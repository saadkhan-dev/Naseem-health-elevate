import type { SupabaseClient } from "@supabase/supabase-js";
import { generateVideoConsultationNo } from "@/lib/ids";
import { sendVideoReadyNotifications, getServerNotificationEnv } from "./notifications";
import { createPatientNotification } from "./patient-notifications";
import { normalizeSiteUrl, videoJoinUrl } from "@/lib/video-join";
import type { NotificationEnv, NotificationResult } from "@/lib/notifications";
import {
  getLiveKitConfig,
  liveKitConfigured,
  mintVideoJoinAccessToken,
  VIDEO_EVENT_RECONNECT_GRACE_MS,
} from "./livekit";
import { isAdminOrDoctor } from "./supabase-admin";

export { videoJoinUrl };

/**
 * Server-side logic for the online video consultation flow.
 *
 * Lives here (like `video-payments.ts` / `video-offers.ts`) so the e2e tests
 * can exercise it against the live Supabase project without the TanStack Start
 * framework wrapper. The thin server functions in `actions.functions.ts` are
 * the authorization boundary on top of this logic.
 *
 * Rules enforced by this module:
 *  - ONE session per appointment — "Start Video Call" and any retry reuse the
 *    same VC code, room name and patient join link (a session is created only
 *    when the appointment has none yet). Every session is LIVEKIT-native: the
 *    room is addressed by its deterministic `room_name` and created lazily by
 *    LiveKit on the first join, so no external meeting provider is involved.
 *  - A video call can only start for a CONFIRMED video-consultation
 *    appointment whose prepaid payment was verified (or waived) — the payment
 *    and eligibility flow is never bypassed.
 *  - Patient join lookups go through the short VC code only — the internal
 *    appointment/session UUIDs are never returned to guests.
 *  - Notification re-sends reuse the same room/link and report honest per
 *    channel results (`sent` / `not_configured` / `error`), never fakes.
 *  - LiveKit never blocks the session row: starting a session only records the
 *    row; join tokens are minted server-side at join time. If LiveKit is not
 *    configured yet the admin sees a clear `livekitConfigured: false` warning
 *    and the join page explains the clinic has not finished setup.
 */

export type VideoSessionStatus = "scheduled" | "active" | "completed";

export interface VideoSession {
  id: string;
  appointment_id: string;
  room_name: string;
  vc_no: string | null;
  status: VideoSessionStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  created_at: string;
}

/** Max insert attempts when a freshly generated VC code collides. */
const ID_RETRY_ATTEMPTS = 5;

/**
 * Reuse the existing session for an appointment (same VC code and room name)
 * or create one with a fresh VC code. LiveKit does not need a server-side room
 * creation call — rooms are addressed by their deterministic `room_name` and
 * are created by LiveKit on the first join, so this function only ever touches
 * the `video_sessions` row. The code is kept unique by the database; on the
 * (astronomically rare) collision the insert is retried.
 */
export async function createOrReuseVideoSession(
  admin: SupabaseClient,
  appointmentId: string,
  durationMinutes: number,
): Promise<{
  error: string | null;
  session: VideoSession | null;
  /** True when a NEW session was created; false when the existing one was reused. */
  created: boolean;
  /** Whether LiveKit is configured on the server (helps surface a precise warning). */
  livekitConfigured: boolean;
}> {
  const { data: existing } = await admin
    .from("video_sessions")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const session = existing as VideoSession;
    if (session.duration_minutes !== durationMinutes) {
      await admin
        .from("video_sessions")
        .update({ duration_minutes: durationMinutes })
        .eq("id", session.id);
    }
    // The appointment already has a session — reuse it (same room name / VC
    // code / join link), so refreshes and retries never create duplicates.
    return { error: null, session, created: false, livekitConfigured: liveKitConfigured() };
  }

  for (let attempt = 0; attempt < ID_RETRY_ATTEMPTS; attempt++) {
    const vcNo = generateVideoConsultationNo();
    const roomName = `naseem-${vcNo.replace(/[^A-Z0-9]/g, "").toLowerCase()}`;

    const { data, error } = await admin
      .from("video_sessions")
      .insert({
        appointment_id: appointmentId,
        room_name: roomName,
        vc_no: vcNo,
        status: "scheduled",
        duration_minutes: durationMinutes,
      })
      .select("*")
      .single();

    if (!error) {
      return {
        error: null,
        session: data as VideoSession,
        created: true,
        livekitConfigured: liveKitConfigured(),
      };
    }

    const isCodeCollision = error.code === "23505" && /vc_no/i.test(error.message);
    if (!isCodeCollision) {
      return {
        error: error.message,
        session: null,
        created: false,
        livekitConfigured: liveKitConfigured(),
      };
    }
  }

  return {
    error: "Could not generate a unique Video Consultation ID. Please try again.",
    session: null,
    created: false,
    livekitConfigured: liveKitConfigured(),
  };
}

export interface VideoJoinAppointment {
  /** The appointment's internal id — used to open the same consultation chat. */
  appointmentId: string;
  status: string;
  serviceName: string | null;
  date: string;
  time: string | null;
  appointmentNo: string | null;
}

/**
 * Public join lookup by patient-facing VC code. The appointment id is exposed
 * ONLY so the UI can open the same persistent consultation conversation — that
 * chat remains guarded by its own RLS + the `ensureConversation` ownership
 * check (a non-owner can never read or join it). The session UUID is never
 * exposed. Cancelled/rejected appointments cannot join.
 */
export async function getVideoJoinByVcNo(
  admin: SupabaseClient,
  vcNo: string,
): Promise<{
  error: string | null;
  session: {
    vcNo: string;
    roomName: string;
    durationMinutes: number;
    status: VideoSessionStatus;
    /** LiveKit websocket URL — empty until LiveKit is configured on the server. */
    serverUrl: string;
  } | null;
  appointment: VideoJoinAppointment | null;
  /** Whether LiveKit is configured on the server (helps show a precise message). */
  livekitConfigured: boolean;
}> {
  const { data: session } = await admin
    .from("video_sessions")
    .select("*")
    .eq("vc_no", vcNo)
    .maybeSingle();

  if (!session) {
    return {
      error: "No video session found for that code.",
      session: null,
      appointment: null,
      livekitConfigured: false,
    };
  }

  const { data: appointment } = await admin
    .from("appointments")
    .select("id, status, date, time, appointment_no, services:service_id (name)")
    .eq("id", session.appointment_id)
    .maybeSingle();

  if (!appointment) {
    return {
      error: "No appointment found for that code.",
      session: null,
      appointment: null,
      livekitConfigured: false,
    };
  }

  if (
    appointment.status === "cancelled" ||
    appointment.status === "rejected" ||
    appointment.status === "no_show"
  ) {
    return {
      error: "This video consultation is no longer available.",
      session: null,
      appointment: null,
      livekitConfigured: false,
    };
  }

  const service = appointment.services as unknown as { name: string | null } | null;
  return {
    error: null,
    session: {
      vcNo: (session.vc_no as string | null) ?? vcNo,
      roomName: session.room_name as string,
      durationMinutes: (session.duration_minutes as number | null) ?? 30,
      status: session.status as VideoSessionStatus,
      serverUrl: getLiveKitConfig().url,
    },
    appointment: {
      appointmentId: appointment.id as string,
      status: appointment.status as string,
      serviceName: service?.name ?? null,
      date: appointment.date as string,
      time: (appointment.time as string | null)?.slice(0, 5) ?? null,
      appointmentNo: (appointment.appointment_no as string | null) ?? null,
    },
    livekitConfigured: liveKitConfigured(),
  };
}

/**
 * Start a video call for a confirmed, paid video-consultation appointment.
 * Reuses any existing session (never creates a second room/link). When a NEW
 * session is created, the patient is notified with the join link.
 *
 * `env` is injectable for tests; it defaults to the live server environment.
 */
export async function createVideoSessionForAppointment(
  admin: SupabaseClient,
  appointmentId: string,
  durationMinutes: number,
  siteUrl: string | undefined,
  env: NotificationEnv = getServerNotificationEnv(),
): Promise<{
  error: string | null;
  session: VideoSession | null;
  created: boolean;
  /** Whether LiveKit is configured on the server (a warning, never a blocker). */
  livekitConfigured: boolean;
  notifications: NotificationResult[];
}> {
  const { data: appointment } = await admin
    .from("appointments")
    .select("status, payment_status, services:service_id (name)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return {
      error: "Appointment not found.",
      session: null,
      created: false,
      livekitConfigured: liveKitConfigured(),
      notifications: [],
    };
  }

  const service = appointment.services as unknown as { name: string | null } | null;
  const isVideo = service?.name?.toLowerCase().includes("video consultation") ?? false;
  if (!isVideo) {
    return {
      error: "Video calls can only be started for video consultation appointments.",
      session: null,
      created: false,
      livekitConfigured: liveKitConfigured(),
      notifications: [],
    };
  }
  if (appointment.status !== "confirmed") {
    return {
      error: "Confirm the appointment before starting the video call.",
      session: null,
      created: false,
      livekitConfigured: liveKitConfigured(),
      notifications: [],
    };
  }
  if (
    appointment.payment_status !== "payment_verified" &&
    appointment.payment_status !== "waived"
  ) {
    return {
      error: "The patient's payment must be verified before the video call can start.",
      session: null,
      created: false,
      livekitConfigured: liveKitConfigured(),
      notifications: [],
    };
  }

  const result = await createOrReuseVideoSession(admin, appointmentId, durationMinutes);
  if (result.error || !result.session) {
    return {
      error: result.error,
      session: null,
      created: false,
      livekitConfigured: result.livekitConfigured,
      notifications: [],
    };
  }

  let notifications: NotificationResult[] = [];
  if (result.created) {
    const notified = await resendVideoNotification(admin, appointmentId, siteUrl, env);
    notifications = notified.notifications;
  }

  return {
    error: null,
    session: result.session,
    created: result.created,
    livekitConfigured: result.livekitConfigured,
    notifications,
  };
}

/**
 * Re-send the "video ready to join" notification for an appointment, reusing
 * the existing session's VC code, LiveKit room name and join link.
 */
export async function resendVideoNotification(
  admin: SupabaseClient,
  appointmentId: string,
  siteUrl: string | undefined,
  env: NotificationEnv = getServerNotificationEnv(),
): Promise<{ error: string | null; notifications: NotificationResult[] }> {
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "patient_id, appointment_no, patient_name, patient_phone, patient_email, date, time, services:service_id (name)",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return { error: "Appointment not found.", notifications: [] };
  }

  const { data: session } = await admin
    .from("video_sessions")
    .select("vc_no, room_name, duration_minutes, status")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session || !session.vc_no) {
    return { error: "Start the video call first.", notifications: [] };
  }

  const service = appointment.services as unknown as { name: string | null } | null;
  const vcNo = session.vc_no as string;
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);

  if (appointment.patient_id) {
    await createPatientNotification(admin, {
      userId: appointment.patient_id as string,
      type: "video_ready",
      title: "Video consultation ready",
      body: `Your online video consultation is ready to join. Use code ${vcNo} on the join page.`,
      link: `/video/${vcNo}`,
    });
  }

  const notifications = await sendVideoReadyNotifications(
    {
      appointmentId: (appointment.appointment_no as string | null) ?? appointmentId,
      patientName: appointment.patient_name ?? "Patient",
      serviceName: service?.name ?? "Video Consultation",
      date: appointment.date as string,
      time: (appointment.time as string | null)?.slice(0, 5) ?? "Flexible",
      vcNo,
      joinUrl: videoJoinUrl(normalizedSiteUrl, vcNo),
      statusUrl: normalizedSiteUrl ? `${normalizedSiteUrl}/appointment-status` : undefined,
      phone: appointment.patient_phone ?? undefined,
      email: appointment.patient_email ?? undefined,
    },
    env,
  );

  return { error: null, notifications };
}

/**
 * Mint the server-side LiveKit join token for a session, the final step of
 * joining a call. Enforces the same eligibility rules as getVideoJoinByVcNo
 * (cancelled/rejected/no-show appointments cannot join) and mints a token only
 * for a room that belongs to the given VC code. Doctors/admins (verified via
 * their JWT) receive the roomAdmin grant; patients receive a plain participant.
 * LIVEKIT_API_SECRET never leaves this module — callers only get the signed JWT.
 */
export async function mintVideoJoinToken(
  admin: SupabaseClient,
  vcNo: string,
  staffToken: string | null | undefined,
): Promise<{
  error: string | null;
  token: string | null;
  serverUrl: string;
  roomName: string;
  expiresAt: number | null;
}> {
  const join = await getVideoJoinByVcNo(admin, vcNo);
  if (join.error || !join.session) {
    return {
      error: join.error ?? "No video session found for that code.",
      token: null,
      serverUrl: "",
      roomName: "",
      expiresAt: null,
    };
  }
  if (!join.livekitConfigured) {
    return {
      error: "LiveKit is not configured on this website yet — video calls cannot start.",
      token: null,
      serverUrl: "",
      roomName: join.session.roomName,
      expiresAt: null,
    };
  }

  const isStaff = await isAdminOrDoctor(admin, staffToken);
  const identity = `${isStaff ? "doctor" : "patient"}-${join.session.roomName}`;

  try {
    const minted = await mintVideoJoinAccessToken({
      roomName: join.session.roomName,
      identity,
      name: isStaff ? "Doctor" : "Patient",
      roomAdmin: isStaff,
    });
    return {
      error: null,
      token: minted.token,
      serverUrl: minted.serverUrl,
      roomName: minted.roomName,
      expiresAt: minted.expiresAt,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not start the video call.",
      token: null,
      serverUrl: getLiveKitConfig().url,
      roomName: join.session.roomName,
      expiresAt: null,
    };
  }
}

/** Most-recently-started OPEN leg (left_at IS NULL) for a participant in a session, if any. */
async function findOpenLeg(
  admin: SupabaseClient,
  sessionId: string,
  participantRole: "patient" | "doctor",
): Promise<{ id: string; joined_at: string } | null> {
  const { data } = await admin
    .from("video_session_events")
    .select("id, joined_at")
    .eq("session_id", sessionId)
    .eq("participant_role", participantRole)
    .is("left_at", null)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; joined_at: string } | null) ?? null;
}

/**
 * Record a join/leave event for the app-tracked usage estimate on the admin
 * "LiveKit Usage" panel (Build plan has no official Analytics API). Best-effort
 * and non-fatal: failures are swallowed so a lost event can never break a call.
 * The `video_session_events` table is created by supabase/livekit-video-sessions.sql.
 *
 * Keeps at most ONE open leg per participant/session:
 * - "joined" reconciles any existing open leg for the same participant BEFORE
 *   opening a new one (bounded by VIDEO_EVENT_RECONNECT_GRACE_MS so a stale leg
 *   from long ago cannot balloon). A genuine reconnect after a real "left"
 *   finds nothing open and records a fresh, non-overlapping leg.
 * - "left" closes the most recent open interval, as before.
 */
export async function recordVideoSessionEvent(
  admin: SupabaseClient,
  vcNo: string,
  participantRole: "patient" | "doctor",
  event: "joined" | "left",
): Promise<void> {
  try {
    const { data: session } = await admin
      .from("video_sessions")
      .select("id")
      .eq("vc_no", vcNo)
      .maybeSingle();
    if (!session) return;

    if (event === "joined") {
      // Reconnect protection: if this participant still has an OPEN leg, a
      // second "joined" would create overlapping, double-counted time. Close
      // the previous leg first (at most GRACE past its start) then open fresh.
      const open = await findOpenLeg(admin, session.id as string, participantRole);
      if (open) {
        const openStart = new Date(open.joined_at as string).getTime();
        const now = Date.now();
        const reconciled = new Date(
          Number.isNaN(openStart) ? now : Math.min(now, openStart + VIDEO_EVENT_RECONNECT_GRACE_MS),
        ).toISOString();
        await admin
          .from("video_session_events")
          .update({ left_at: reconciled })
          .eq("id", open.id as string);
      }
      await admin.from("video_session_events").insert({
        session_id: session.id as string,
        participant_role: participantRole,
      });
      return;
    }

    // "left": close the most recent open interval for this participant.
    const open = await findOpenLeg(admin, session.id as string, participantRole);
    if (open) {
      await admin
        .from("video_session_events")
        .update({ left_at: new Date().toISOString() })
        .eq("id", open.id as string);
    }
  } catch {
    // Usage accounting must never affect the consultation itself.
  }
}
