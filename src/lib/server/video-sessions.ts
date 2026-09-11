import type { SupabaseClient } from "@supabase/supabase-js";
import { generateVideoConsultationNo } from "@/lib/ids";
import { sendVideoReadyNotifications, getServerNotificationEnv } from "./notifications";
import { createPatientNotification } from "./patient-notifications";
import { normalizeSiteUrl, videoJoinUrl } from "@/lib/video-join";
import type { NotificationEnv, NotificationResult } from "@/lib/notifications";
import {
  createGoogleMeetSpace,
  getGoogleMeetConfig,
  GoogleMeetNotConfiguredError,
} from "./google-meet";

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
 *    same VC code, patient join link and Google Meet meeting (a session + its
 *    Meet space are created only when the appointment has none yet).
 *  - Each video appointment maps to exactly ONE Google Meet meeting — the
 *    `meet_url` is created once and reused forever afterwards, so refreshing
 *    the page or clicking the button again never makes a second meeting.
 *  - A video call can only start for a CONFIRMED video-consultation
 *    appointment whose prepaid payment was verified (or waived) — the payment
 *    and eligibility flow is never bypassed.
 *  - Patient join lookups go through the short VC code only — the internal
 *    appointment/session UUIDs are never returned to guests.
 *  - Notification re-sends reuse the same room/link and report honest per
 *    channel results (`sent` / `not_configured` / `error`), never fakes.
 *  - Google Meet creation failures never block the session row: the admin sees
 *    a clear `meetError` and can retry (the retry reuses the session and
 *    backfills the meeting). The safe join still works once a URL exists.
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
  /** Google Meet join URL (e.g. https://meet.google.com/abc-mnop-xyz). Null until created. */
  meet_url: string | null;
  /** Google Meet space resource name (e.g. spaces/abc123). Null until created. */
  meet_space_id: string | null;
}

/** Max insert attempts when a freshly generated VC code collides. */
const ID_RETRY_ATTEMPTS = 5;

/**
 * Create the appointment's single Google Meet meeting and persist it. Never
 * called when a `meet_url` already exists — that is what guarantees one
 * appointment == one meeting even across page refreshes / retries.
 */
async function attachGoogleMeetToSession(
  admin: SupabaseClient,
  session: VideoSession,
): Promise<{ error: string | null; session: VideoSession | null; meetConfigured: boolean }> {
  try {
    const space = await createGoogleMeetSpace();
    const { data, error } = await admin
      .from("video_sessions")
      .update({ meet_url: space.meetingUri, meet_space_id: space.name })
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) return { error: error.message, session: null, meetConfigured: true };
    return { error: null, session: data as VideoSession, meetConfigured: true };
  } catch (e) {
    const notConfigured = e instanceof GoogleMeetNotConfiguredError;
    return {
      error: e instanceof Error ? e.message : "Could not create the Google Meet meeting.",
      session,
      meetConfigured: !notConfigured,
    };
  }
}

/**
 * Reuse the existing session for an appointment (same room/VC link and Google
 * Meet meeting) or create one with a fresh VC code. When a NEW session is
 * created — or an existing session still has no Meet URL (a previous creation
 * attempt failed) — a single Google Meet meeting is created and stored. The
 * code is kept unique by the database; on the (astronomically rare) collision
 * the insert is retried.
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
  /** Google Meet creation failure (session still exists — retry backfills). */
  meetError: string | null;
  /** Whether the Google Meet server credentials are configured at all. */
  meetConfigured: boolean;
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
    // The appointment already has a session — reuse it. Its Meet meeting (if
    // any) is reused too so refreshes/clicks never create duplicates. Only when
    // a previous Meet creation FAILED (no URL) do we try to backfill it.
    if (!session.meet_url) {
      const meeting = await attachGoogleMeetToSession(admin, session);
      return {
        error: null,
        session: meeting.session ?? session,
        created: false,
        meetError: meeting.error,
        meetConfigured: meeting.meetConfigured,
      };
    }
    return {
      error: null,
      session,
      created: false,
      meetError: null,
      meetConfigured: true,
    };
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
      const session = data as VideoSession;
      const meeting = await attachGoogleMeetToSession(admin, session);
      return {
        error: null,
        session: meeting.session ?? session,
        created: true,
        meetError: meeting.error,
        meetConfigured: meeting.meetConfigured,
      };
    }

    const isCodeCollision = error.code === "23505" && /vc_no/i.test(error.message);
    if (!isCodeCollision) {
      return {
        error: error.message,
        session: null,
        created: false,
        meetError: null,
        meetConfigured: true,
      };
    }
  }

  return {
    error: "Could not generate a unique Video Consultation ID. Please try again.",
    session: null,
    created: false,
    meetError: null,
    meetConfigured: true,
  };
}

export interface VideoJoinAppointment {
  status: string;
  serviceName: string | null;
  date: string;
  time: string | null;
  appointmentNo: string | null;
}

/**
 * Public join lookup by patient-facing VC code. Only safe fields are exposed —
 * never the internal appointment or session UUIDs. Cancelled/rejected
 * appointments cannot join.
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
    /** Google Meet join URL — the ONLY thing the join button opens. Null when not created yet. */
    meetUrl: string | null;
  } | null;
  appointment: VideoJoinAppointment | null;
  /** Whether the Google Meet server credentials are configured (helps show a precise error). */
  meetConfigured: boolean;
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
      meetConfigured: false,
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
      meetConfigured: false,
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
      meetConfigured: false,
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
      meetUrl: (session.meet_url as string | null) ?? null,
    },
    appointment: {
      status: appointment.status as string,
      serviceName: service?.name ?? null,
      date: appointment.date as string,
      time: (appointment.time as string | null)?.slice(0, 5) ?? null,
      appointmentNo: (appointment.appointment_no as string | null) ?? null,
    },
    meetConfigured: getGoogleMeetConfig().configured,
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
  /** Set when the session exists but its Google Meet meeting could not be created. */
  meetError: string | null;
  /** Whether the Google Meet server credentials are configured. */
  meetConfigured: boolean;
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
      meetError: null,
      meetConfigured: true,
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
      meetError: null,
      meetConfigured: true,
      notifications: [],
    };
  }
  if (appointment.status !== "confirmed") {
    return {
      error: "Confirm the appointment before starting the video call.",
      session: null,
      created: false,
      meetError: null,
      meetConfigured: true,
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
      meetError: null,
      meetConfigured: true,
      notifications: [],
    };
  }

  const result = await createOrReuseVideoSession(admin, appointmentId, durationMinutes);
  if (result.error || !result.session) {
    return {
      error: result.error,
      session: null,
      created: false,
      meetError: null,
      meetConfigured: result.meetConfigured,
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
    meetError: result.meetError,
    meetConfigured: result.meetConfigured,
    notifications,
  };
}

/**
 * Re-send the "video ready to join" notification for an appointment, reusing
 * the existing session's VC code, Google Meet meeting and join link.
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
