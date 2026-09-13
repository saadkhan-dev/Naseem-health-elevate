import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONSULTATION_EVENTS,
  type AttachmentKind,
  type ConsultationEventRow,
  type ConsultationDetailView,
  type ConsultationAppointmentView,
  type ConsultationMessageRow,
  type ConsultationParticipantView,
  type ConsultationRole,
  type ConversationStatus,
  type ConversationSummaryView,
  type ConversationEnsureView,
  type ConsultationSaveSummaryInput,
  type SenderRole,
} from "../consultation-types";
import { createAdminNotification, buildAdminNotificationDedupKey } from "./patient-notifications";

/**
 * Server-only business logic for the Consultation Communication system.
 *
 * All functions take the service-role `admin` client (RLS bypassed) and are
 * expected to be called from gated server functions after the caller has been
 * authorized (see `consultationAuthMiddleware`). Defence-in-depth still exists
 * at the database layer (RLS) for direct anon-key reads/writes.
 */

export function isStaffRole(role: string | undefined | null): boolean {
  return role === "doctor" || role === "admin";
}

export function senderRoleOf(role: string | null | undefined): SenderRole {
  return role === "patient" ? "patient" : "doctor";
}

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  appointment_no: string | null;
  date: string;
  time: string | null;
  notes: string | null;
  status: string;
  patient_email: string | null;
  service_name?: string | null;
  video_sessions?:
    { vc_no: string | null; status: string | null; created_at: string | null }[] | null;
}

async function getAppointmentContext(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<AppointmentRow | null> {
  const { data } = await admin
    .from("appointments")
    .select(
      `id, patient_id, appointment_no, date, time, notes, status, patient_email,
       services:service_id (name),
       video_sessions:video_sessions (vc_no, status, created_at)`,
    )
    .eq("id", appointmentId)
    .maybeSingle();
  return (data as unknown as AppointmentRow | null) ?? null;
}

function latestVideoSession(row: AppointmentRow | null) {
  const sessions = row?.video_sessions ?? [];
  if (sessions.length === 0) return null;
  return (
    [...sessions].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null
  );
}

function toAppointmentView(row: AppointmentRow | null): ConsultationAppointmentView | null {
  if (!row) return null;
  const serviceName = row.service_name ?? null;
  const video = latestVideoSession(row);
  return {
    appointmentId: row.id,
    appointmentNo: row.appointment_no ?? null,
    date: row.date,
    time: row.time ? String(row.time).slice(0, 5) : null,
    serviceName,
    isVideo: serviceName?.toLowerCase().includes("video consultation") ?? false,
    status: row.status,
    notes: row.notes,
    patientName: null,
    patientPhone: null,
    patientEmail: row.patient_email ?? null,
    vcNo: video?.vc_no ?? null,
    videoStatus: video?.status ?? null,
  };
}

async function ensureParticipant(
  admin: SupabaseClient,
  conversationId: string,
  userId: string,
  role: string,
): Promise<void> {
  await admin.from("consultation_participants").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      role,
      last_read_at: new Date(0).toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
}

/**
 * Mark a conversation read for a specific user (server-side, service-role).
 *
 * Staff ("doctor"/"admin") often have NO participant row for a conversation
 * (the admin may not be the participant auto-added at booking), so a plain
 * RLS-scoped UPDATE from the client affects 0 rows. This upserts the viewer's
 * own `consultation_participants` row — keeping the per-user `last_read_at`
 * read marker intact. Patients are routed through the direct RLS path, but
 * the server fn still guards patients so it can never mark another patient's
 * conversation (defence-in-depth over the middleware check).
 */
export async function markConversationReadServer(
  admin: SupabaseClient,
  input: { conversationId: string; userId: string; role: ConsultationRole },
): Promise<void> {
  if (input.role === "patient") {
    const { data: conversation } = await admin
      .from("consultation_conversations")
      .select("appointment_id")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversation not found");
    const { data: appointment } = await admin
      .from("appointments")
      .select("patient_id")
      .eq("id", conversation.appointment_id as string)
      .maybeSingle();
    if (!appointment || (appointment.patient_id as string | null) !== input.userId) {
      throw new Error("Forbidden");
    }
  }

  const lastReadAt = new Date().toISOString();
  const { data: existing } = await admin
    .from("consultation_participants")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (existing) {
    await admin
      .from("consultation_participants")
      .update({ last_read_at: lastReadAt })
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId);
  } else {
    await admin.from("consultation_participants").insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: input.role,
      last_read_at: lastReadAt,
    });
  }
}

async function recordEvent(
  admin: SupabaseClient,
  input: {
    conversationId: string;
    actorId: string | null;
    actorRole: string | null;
    eventType: string;
    messageId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("consultation_events").insert({
      conversation_id: input.conversationId,
      actor_id: input.actorId,
      actor_role: input.actorRole,
      event_type: input.eventType,
      message_id: input.messageId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Audit enrichment is best-effort; never break the primary operation.
  }
}

/**
 * Resolve the patient's stored booking name for a conversation (works for
 * guest bookings too — the appointment always records `patient_name`).
 */
async function getConversationPatientName(
  admin: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  const { data: conv } = await admin
    .from("consultation_conversations")
    .select("appointment_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return null;
  const { data: appt } = await admin
    .from("appointments")
    .select("patient_name")
    .eq("id", conv.appointment_id as string)
    .maybeSingle();
  const stored = (appt?.patient_name as string | null)?.trim();
  return stored || null;
}

/**
 * Idempotently create (or reuse) the conversation for an appointment and make
 * sure the patient + the acting user are participants. A patient acting user
 * may only open their OWN appointment; staff may open any.
 */
export async function ensureConversation(
  admin: SupabaseClient,
  input: { appointmentId: string; actorUserId: string; actorRole: ConsultationRole },
): Promise<ConversationEnsureView> {
  const appointment = await getAppointmentContext(admin, input.appointmentId);
  if (!appointment) {
    throw new Error("Appointment not found");
  }

  if (input.actorRole === "patient" && appointment.patient_id !== input.actorUserId) {
    throw new Error("Forbidden");
  }

  let { data: conversation } = await admin
    .from("consultation_conversations")
    .select("id, status")
    .eq("appointment_id", input.appointmentId)
    .maybeSingle();

  let created = false;
  if (!conversation) {
    const { data: inserted } = await admin
      .from("consultation_conversations")
      .insert({ appointment_id: input.appointmentId, status: "active" })
      .select("id, status")
      .single();
    conversation = inserted;
    created = true;
  }

  const conversationId = conversation!.id;

  if (appointment.patient_id) {
    await ensureParticipant(admin, conversationId, appointment.patient_id, "patient");
  }
  await ensureParticipant(admin, conversationId, input.actorUserId, input.actorRole);

  if (created) {
    await recordEvent(admin, {
      conversationId,
      actorId: input.actorUserId,
      actorRole: input.actorRole,
      eventType: CONSULTATION_EVENTS.CONVERSATION_CREATED,
    });
    const { data } = await admin
      .from("consultation_conversations")
      .select("started_at")
      .eq("id", conversationId)
      .maybeSingle();
    void data;
  }

  return {
    conversationId,
    status: conversation!.status as ConversationStatus,
    appointment: toAppointmentView(appointment),
  };
}

// --- RPC row shapes ----------------------------------------------------------

interface HistoryRpcRow {
  conversation_id: string;
  appointment_id: string;
  appointment_no: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  last_message_at: string | null;
  appointment_date: string;
  appointment_time: string | null;
  service_name: string | null;
  is_video: boolean;
  vc_no: string | null;
  video_status: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  unread_count: number;
  last_body: string | null;
  last_sender_role: string | null;
  has_attachments: boolean;
  message_count?: number;
}

function mapHistoryRow(row: HistoryRpcRow): ConversationSummaryView {
  return {
    conversationId: row.conversation_id,
    appointmentId: row.appointment_id,
    appointmentNo: row.appointment_no ?? null,
    status: (row.status as ConversationStatus) ?? "active",
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lastMessageAt: row.last_message_at,
    appointmentDate: row.appointment_date,
    appointmentTime: row.appointment_time ? String(row.appointment_time).slice(0, 5) : null,
    serviceName: row.service_name ?? null,
    isVideo: row.is_video,
    vcNo: row.vc_no ?? null,
    videoStatus: row.video_status ?? null,
    patientName: row.patient_name ?? null,
    patientPhone: row.patient_phone ?? null,
    patientEmail: row.patient_email ?? null,
    patientGender: null,
    unreadCount: Number(row.unread_count ?? 0),
    lastBody: row.last_body ?? null,
    lastSenderRole: (row.last_sender_role as SenderRole) ?? null,
    hasAttachments: row.has_attachments,
    messageCount: row.message_count != null ? Number(row.message_count) : undefined,
  };
}

export interface ConsultationHistoryFilters {
  q?: string | null;
  status?: ConversationStatus | null;
  from?: string | null;
  to?: string | null;
  hasAttachments?: boolean | null;
}

/**
 * Direct read-model build for the history lists, using only the service-role
 * client (no PostgREST RPC dependency). Mirrors `consultation_history_for_user`
 * exactly:
 *   - conversations are filtered to `appointments.patient_id = userId` when a
 *     userId is given (the SAME security boundary as the SQL function) — a
 *     patient can never see another patient's conversations;
 *   - staff mode (userId = null) returns every conversation and is only used
 *     after the server middleware has confirmed the caller is doctor/admin.
 *
 * This is the automatic fallback whenever an RPC call fails (e.g. the function
 * is missing/stale in the deployed database), so the UI never silently breaks.
 */
async function loadConversationHistoryDirect(
  admin: SupabaseClient,
  opts: {
    userId?: string | null;
    viewerId?: string | null;
    q?: string | null;
    status?: ConversationStatus | null;
    from?: string | null;
    to?: string | null;
    hasAttachments?: boolean | null;
  },
): Promise<ConversationSummaryView[]> {
  const { userId, viewerId, q, status, from, to, hasAttachments } = opts;

  const { data: convs, error: convError } = await admin
    .from("consultation_conversations")
    .select("id, appointment_id, status, started_at, ended_at, last_message_at")
    .order("last_message_at", { ascending: false });
  if (convError) throw new Error(`consultation_conversations: ${convError.message}`);
  const rawConvs = (convs ?? []) as unknown as {
    id: string;
    appointment_id: string;
    status: string;
    started_at: string | null;
    ended_at: string | null;
    last_message_at: string | null;
  }[];

  if (rawConvs.length === 0) return [];

  const appointmentIds = [...new Set(rawConvs.map((r) => r.appointment_id))];
  const conversationIds = rawConvs.map((r) => r.id);

  const { data: appts, error: apptError } = await admin
    .from("appointments")
    .select("id, appointment_no, patient_id, patient_email, date, time, service_id")
    .in("id", appointmentIds);
  if (apptError) throw new Error(`appointments: ${apptError.message}`);
  const apptById = new Map(
    ((appts as unknown as Record<string, unknown>[]) ?? []).map((a) => [
      a.id as string,
      a as {
        id: string;
        appointment_no: string | null;
        patient_id: string | null;
        patient_email: string | null;
        date: string | null;
        time: string | null;
        service_id: string | null;
      },
    ]),
  );

  const serviceIds = [...new Set([...apptById.values()].map((a) => a.service_id).filter(Boolean))];
  const patientIds = [...new Set([...apptById.values()].map((a) => a.patient_id).filter(Boolean))];

  const [services, profiles, sessions, messages, participants, attachments] = await Promise.all([
    serviceIds.length > 0
      ? admin.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] }),
    patientIds.length > 0
      ? admin.from("profiles").select("id, full_name, phone, gender").in("id", patientIds)
      : Promise.resolve({ data: [] }),
    admin
      .from("video_sessions")
      .select("appointment_id, vc_no, status, created_at")
      .in("appointment_id", appointmentIds)
      .order("created_at", { ascending: false }),
    admin
      .from("consultation_messages")
      .select("id, conversation_id, sender_id, sender_role, body, deleted_at, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true }),
    admin
      .from("consultation_participants")
      .select("conversation_id, user_id, role, last_read_at")
      .in("conversation_id", conversationIds),
    admin
      .from("consultation_attachments")
      .select("conversation_id")
      .eq("deleted_at", null)
      .in("conversation_id", conversationIds),
  ]);

  const svcById = new Map(
    ((services.data as unknown as Record<string, unknown>[]) ?? []).map((s) => [
      s.id as string,
      s.name as string | null,
    ]) as [string, string | null][],
  );
  const profileById = new Map(
    ((profiles.data as unknown as Record<string, unknown>[]) ?? []).map((p) => [
      p.id as string,
      p as { id: string; full_name: string | null; phone: string | null; gender: string | null },
    ]),
  );
  const msgsByConvo = new Map<string, Record<string, unknown>[]>();
  for (const m of ((messages.data as unknown as Record<string, unknown>[]) ?? []) as Record<
    string,
    unknown
  >[]) {
    const cid = m.conversation_id as string;
    const list = msgsByConvo.get(cid) ?? [];
    list.push(m);
    msgsByConvo.set(cid, list);
  }
  // Unread is ALWAYS measured against the VIEWER's own read marker:
  //   * patient mode — the patient viewer (same security boundary as the RPC);
  //   * staff mode — the staff member looking at the list, NOT the patient's
  //     marker. This is what lets an admin's badge clear the moment they open
  //     the conversation (markers are per-user; the patient's marker only
  //     tracks what the PATIENT has read).
  const unreadViewerId = viewerId ?? userId ?? null;
  const viewerReadAtByConvo = new Map<string, string | null>();
  for (const p of (participants.data as unknown as Record<string, unknown>[]) ?? []) {
    if (unreadViewerId == null || (p.user_id as string) !== unreadViewerId) continue;
    viewerReadAtByConvo.set(p.conversation_id as string, (p.last_read_at as string | null) ?? null);
  }
  const attachmentsByConvo = new Set<string>();
  for (const a of (attachments.data as unknown as { conversation_id: string }[]) ?? []) {
    attachmentsByConvo.add(a.conversation_id);
  }
  const sessionByAppt = new Map<string, { vc_no: string | null; status: string | null }>();
  for (const v of (sessions.data as unknown as Record<string, unknown>[]) ?? []) {
    const key = v.appointment_id as string;
    if (!sessionByAppt.has(key)) {
      sessionByAppt.set(key, {
        vc_no: (v.vc_no as string | null) ?? null,
        status: (v.status as string | null) ?? null,
      });
    }
  }

  const out: ConversationSummaryView[] = [];
  for (const r of rawConvs) {
    const appt = apptById.get(r.appointment_id);
    if (!appt) continue;
    // Security boundary — identical to `consultation_history_for_user`.
    if (userId != null && appt.patient_id !== userId) continue;

    const svcName = appt.service_id ? (svcById.get(appt.service_id) ?? null) : null;

    // Staff filters (client-side over the already-loaded dataset).
    if (userId == null && q != null && q !== "") {
      const patientName = appt.patient_id
        ? (profileById.get(appt.patient_id)?.full_name ?? "")
        : "";
      const haystack = [
        patientName,
        appt.patient_email ?? "",
        appt.appointment_no ?? "",
        svcName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q.toLowerCase())) continue;
    }
    if (userId == null && status != null && r.status !== status) continue;
    if (userId == null && from != null && (appt.date ?? "") < from) continue;
    if (userId == null && to != null && (appt.date ?? "") > to) continue;

    const msgs = msgsByConvo.get(r.id) ?? [];
    const liveMsgs = msgs.filter((m) => m.deleted_at == null);
    const lastMsg = liveMsgs.length > 0 ? liveMsgs[liveMsgs.length - 1] : null;
    const readAt = viewerReadAtByConvo.get(r.id) ?? null;
    let unread = 0;
    for (const m of liveMsgs) {
      if (unreadViewerId != null && m.sender_id === unreadViewerId) continue;
      const sentAt = m.created_at as string;
      if (readAt == null || sentAt > readAt) unread += 1;
    }

    const hasFiles = attachmentsByConvo.has(r.id);
    if (userId == null && hasAttachments != null && hasFiles !== hasAttachments) continue;

    const profile =
      appt.patient_id && profileById.has(appt.patient_id)
        ? profileById.get(appt.patient_id)!
        : null;
    const video = sessionByAppt.get(r.appointment_id) ?? null;

    out.push({
      conversationId: r.id,
      appointmentId: r.appointment_id,
      appointmentNo: appt.appointment_no ?? null,
      status: (r.status as ConversationStatus) ?? "active",
      startedAt: r.started_at,
      endedAt: r.ended_at,
      lastMessageAt: r.last_message_at,
      appointmentDate: appt.date ?? "",
      appointmentTime: appt.time ? String(appt.time).slice(0, 5) : null,
      serviceName: svcName,
      isVideo: svcName?.toLowerCase().includes("video consultation") ?? false,
      vcNo: video?.vc_no ?? null,
      videoStatus: video?.status ?? null,
      patientName: profile?.full_name ?? null,
      patientPhone: profile?.phone ?? null,
      patientEmail: appt.patient_email ?? null,
      patientGender: profile?.gender ?? null,
      unreadCount: unread,
      lastBody: (lastMsg?.body as string | null) ?? null,
      lastSenderRole: (lastMsg?.sender_role as SenderRole) ?? null,
      hasAttachments: hasFiles,
      messageCount: liveMsgs.length,
    });
  }

  return out.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

/**
 * The staff/patient history RPCs return the patient's name/phone but not their
 * gender. Batch-enrich the summaries with the patient's gender (used for the
 * small ♀/♂ symbol in the chat lists). Uses `patient_id` from the appointments
 * table so it also works when the RPC row does not carry it.
 */
async function attachPatientGender(
  admin: SupabaseClient,
  rows: ConversationSummaryView[],
): Promise<ConversationSummaryView[]> {
  if (rows.length === 0) return rows;
  const appointmentIds = [...new Set(rows.map((r) => r.appointmentId).filter(Boolean))];
  const { data: appts } = await admin
    .from("appointments")
    .select("id, patient_id")
    .in("id", appointmentIds);
  const patientIdByAppointment = new Map<string, string | null>();
  const patientIds = new Set<string>();
  for (const a of (appts as unknown as { id: string; patient_id: string | null }[]) ?? []) {
    patientIdByAppointment.set(a.id, a.patient_id);
    if (a.patient_id) patientIds.add(a.patient_id);
  }
  const ids = [...patientIds];
  const { data: profs } =
    ids.length > 0
      ? await admin.from("profiles").select("id, gender").in("id", ids)
      : await Promise.resolve({ data: [] });
  const genderByUser = new Map<string, string | null>(
    ((profs as unknown as { id: string; gender: string | null }[]) ?? []).map((p) => [
      p.id,
      p.gender,
    ]),
  );
  return rows.map((r) => {
    const patientId = patientIdByAppointment.get(r.appointmentId) ?? null;
    return {
      ...r,
      patientGender: patientId ? (genderByUser.get(patientId) ?? null) : r.patientGender,
    };
  });
}

export async function getPatientHistory(
  admin: SupabaseClient,
  userId: string,
): Promise<ConversationSummaryView[]> {
  try {
    const { data, error } = await admin.rpc("consultation_history_for_user", {
      p_user_id: userId,
    });
    if (error) throw error;
    const rows = ((data as unknown as HistoryRpcRow[]) ?? []).map(mapHistoryRow);
    return attachPatientGender(admin, rows);
  } catch (rpcErr) {
    const rpcMessage = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
    try {
      const direct = await loadConversationHistoryDirect(admin, { userId });
      return attachPatientGender(
        admin,
        direct.map((row) => ({ ...row, messageCount: undefined })),
      );
    } catch (directErr) {
      throw new Error(
        `consultation_history_for_user failed [${rpcMessage}]; direct fallback also failed [${
          directErr instanceof Error ? directErr.message : String(directErr)
        }]`,
      );
    }
  }
}

export async function getStaffHistory(
  admin: SupabaseClient,
  filters: ConsultationHistoryFilters,
  viewerId: string,
): Promise<ConversationSummaryView[]> {
  // The single search box matches a name/email/appointment, OR a date — when the
  // query starts with digits (e.g. "2026-09" or "2026-09-12") it is treated as
  // a date prefix over `appointmentDate`.
  const q = (filters.q ?? "").trim();
  const isDateQuery = /^\d{4}/.test(q);
  const nameQuery = isDateQuery ? null : filters.q || null;
  const matchDateQuery = (rows: ConversationSummaryView[]) => {
    if (!isDateQuery) return rows;
    return rows.filter((r) => (r.appointmentDate ?? "").startsWith(q));
  };
  try {
    const { data, error } = await admin.rpc("consultation_history_for_staff", {
      p_search: nameQuery,
      p_status: filters.status || null,
      p_from: filters.from || null,
      p_to: filters.to || null,
      p_has_attachments: filters.hasAttachments ?? null,
      p_viewer_id: viewerId,
    });
    if (error) throw error;
    const rows = ((data as unknown as HistoryRpcRow[]) ?? []).map(mapHistoryRow);
    return matchDateQuery(await attachPatientGender(admin, rows));
  } catch (rpcErr) {
    const rpcMessage = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
    try {
      const rows = await attachPatientGender(
        admin,
        await loadConversationHistoryDirect(admin, {
          viewerId,
          q: nameQuery,
          status: filters.status ?? null,
          from: filters.from ?? null,
          to: filters.to ?? null,
          hasAttachments: filters.hasAttachments ?? null,
        }),
      );
      return matchDateQuery(rows);
    } catch (directErr) {
      throw new Error(
        `consultation_history_for_staff failed [${rpcMessage}]; direct fallback also failed [${
          directErr instanceof Error ? directErr.message : String(directErr)
        }]`,
      );
    }
  }
}

export async function getUnreadTotalForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc("consultation_unread_for_user", {
      p_user_id: userId,
    });
    if (error) throw error;
    return Number(data ?? 0);
  } catch (rpcErr) {
    const rpcMessage = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
    try {
      const rows = await loadConversationHistoryDirect(admin, { userId });
      return rows.reduce((sum, row) => sum + row.unreadCount, 0);
    } catch (directErr) {
      throw new Error(
        `consultation_unread_for_user failed [${rpcMessage}]; direct fallback also failed [${
          directErr instanceof Error ? directErr.message : String(directErr)
        }]`,
      );
    }
  }
}

// --- Conversation detail -----------------------------------------------------

export async function getConversationDetail(
  admin: SupabaseClient,
  input: { conversationId: string; viewerId: string; viewerRole: ConsultationRole },
): Promise<ConsultationDetailView> {
  const staff = isStaffRole(input.viewerRole);

  const { data: conversation, error } = await admin
    .from("consultation_conversations")
    .select("id, appointment_id, status, started_at, ended_at, last_message_at")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conversation) throw new Error("Conversation not found");

  let { data: myParticipant } = await admin
    .from("consultation_participants")
    .select("user_id, role, last_read_at")
    .eq("conversation_id", input.conversationId)
    .eq("user_id", input.viewerId)
    .maybeSingle();

  if (!myParticipant && !staff) {
    // Self-heal: the patient owns the appointment, so they belong in the
    // conversation even if their participant row is missing (e.g. a
    // conversation created by a version of the ensure logic that backfilled
    // nothing). Restoring the row keeps the composer usable — it never grants
    // access to a conversation the patient is not actually entitled to.
    const appointmentForCheck = await getAppointmentContext(
      admin,
      conversation.appointment_id as string,
    );
    if (!appointmentForCheck || appointmentForCheck.patient_id !== input.viewerId) {
      throw new Error("Forbidden");
    }
    await ensureParticipant(admin, conversation.id, input.viewerId, "patient");
    const { data: healed } = await admin
      .from("consultation_participants")
      .select("user_id, role, last_read_at")
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.viewerId)
      .maybeSingle();
    if (!healed) throw new Error("Forbidden");
    myParticipant = healed;
  }

  const [appointment, participants, summary] = await Promise.all([
    getAppointmentContext(admin, conversation.appointment_id as string),
    admin
      .from("consultation_participants")
      .select("user_id, role, last_read_at")
      .eq("conversation_id", input.conversationId),
    admin
      .from("consultation_summaries")
      .select("*")
      .eq("conversation_id", input.conversationId)
      .maybeSingle(),
  ]);

  const allParticipants = participants.data ?? [];
  const names: Record<string, string | null> = {};
  const genders: Record<string, string | null> = {};
  const ids = allParticipants.map((p) => p.user_id);
  if (ids.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, gender")
      .in("id", ids);
    for (const p of profiles ?? []) {
      names[p.id] = p.full_name ?? null;
      genders[p.id] = p.gender ?? null;
    }
  }

  const participantViews: ConsultationParticipantView[] = allParticipants.map((p) => ({
    userId: p.user_id,
    role: p.role as ConsultationRole,
    fullName: names[p.user_id] ?? null,
    gender: genders[p.user_id] ?? null,
    lastReadAt: p.last_read_at,
  }));

  const appointmentView = toAppointmentView(appointment);
  // Patient display fields come from the participant list (single-doctor clinic:
  // staff names are the doctor/admin profiles; patient name from profiles too).
  for (const p of participantViews) {
    if (p.role === "patient" && appointmentView) {
      appointmentView.patientName = p.fullName ?? appointmentView.patientName;
      appointmentView.patientGender = p.gender ?? appointmentView.patientGender;
    }
  }

  const myRole = (myParticipant?.role as ConsultationRole) ?? input.viewerRole;
  return {
    conversationId: conversation.id,
    status: conversation.status as ConversationStatus,
    startedAt: conversation.started_at,
    endedAt: conversation.ended_at,
    lastMessageAt: conversation.last_message_at,
    appointment: appointmentView,
    participants: participantViews,
    myUserId: input.viewerId,
    myRole,
    mySenderRole: isStaffRole(myRole) ? "doctor" : "patient",
    canSend: conversation.status === "active",
    summary: (summary.data as ConsultationDetailView["summary"]) ?? null,
  };
}

// --- Staff lifecycle actions -------------------------------------------------

export async function setConversationStatus(
  admin: SupabaseClient,
  input: {
    conversationId: string;
    status: ConversationStatus;
    actorUserId: string;
    actorRole: ConsultationRole;
  },
): Promise<ConversationStatus> {
  if (!isStaffRole(input.actorRole)) throw new Error("Forbidden");
  if (input.status !== "active" && input.status !== "read_only") {
    throw new Error("Invalid status");
  }
  const endedAt = input.status === "read_only" ? new Date().toISOString() : null;
  const { data, error } = await admin
    .from("consultation_conversations")
    .update({ status: input.status, ended_at: endedAt })
    .eq("id", input.conversationId)
    .select("status")
    .single();
  if (error) throw new Error(error.message);

  await recordEvent(admin, {
    conversationId: input.conversationId,
    actorId: input.actorUserId,
    actorRole: input.actorRole,
    eventType: CONSULTATION_EVENTS.STATUS_CHANGED,
    metadata: { status: input.status },
  });
  return data.status as ConversationStatus;
}

export async function saveSummary(
  admin: SupabaseClient,
  input: {
    conversationId: string;
    actorUserId: string;
    actorRole: ConsultationRole;
    data: ConsultationSaveSummaryInput;
  },
): Promise<ConsultationDetailView["summary"]> {
  if (!isStaffRole(input.actorRole)) throw new Error("Forbidden");

  const { data: conversation } = await admin
    .from("consultation_conversations")
    .select("appointment_id")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (!conversation) throw new Error("Conversation not found");

  const existing = await admin
    .from("consultation_summaries")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .maybeSingle();

  const row = {
    conversation_id: input.conversationId,
    appointment_id: conversation.appointment_id,
    doctor_id: input.actorUserId,
    chief_concern: input.data.chief_concern ?? "",
    symptoms: input.data.symptoms ?? "",
    diagnosis: input.data.diagnosis ?? "",
    doctor_notes: input.data.doctor_notes ?? "",
    advice: input.data.advice ?? "",
    prescription: input.data.prescription ?? "",
    follow_up_date: input.data.follow_up_date || null,
    additional_notes: input.data.additional_notes ?? "",
    status: input.data.status,
  };

  if (existing.data?.id) {
    const { data: updated } = await admin
      .from("consultation_summaries")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select("*")
      .single();
    await recordEvent(admin, {
      conversationId: input.conversationId,
      actorId: input.actorUserId,
      actorRole: input.actorRole,
      eventType: CONSULTATION_EVENTS.SUMMARY_SAVED,
      metadata: { status: input.data.status },
    });
    return updated as ConsultationDetailView["summary"];
  }

  const { data: inserted } = await admin
    .from("consultation_summaries")
    .insert(row)
    .select("*")
    .single();
  await recordEvent(admin, {
    conversationId: input.conversationId,
    actorId: input.actorUserId,
    actorRole: input.actorRole,
    eventType: CONSULTATION_EVENTS.SUMMARY_SAVED,
    metadata: { status: input.data.status },
  });
  return inserted as ConsultationDetailView["summary"];
}

// --- Message actions (edit / soft delete / pin) ------------------------------

/**
 * WhatsApp-style window: patients can edit/delete their own messages only for
 * a limited time after sending, so a patient can't rewrite history after the
 * doctor has read it. Staff can always fix or remove any message.
 */
export const PATIENT_MESSAGE_MODIFY_WINDOW_MS = 30 * 60 * 1000;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_role: string;
  deleted_at: string | null;
  created_at: string;
};

async function canActOnMessage(
  admin: SupabaseClient,
  actor: { userId: string; role: ConsultationRole },
  message: MessageRow,
): Promise<boolean> {
  const staff = isStaffRole(actor.role);
  if (staff) return true;
  if (message.sender_id !== actor.userId) return false;
  const ageMs = Date.now() - new Date(message.created_at).getTime();
  if (ageMs > PATIENT_MESSAGE_MODIFY_WINDOW_MS) {
    throw new Error("This message is older than 30 minutes and can no longer be changed.");
  }
  return true;
}

async function assertParticipant(
  admin: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const { count } = await admin
    .from("consultation_participants")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  return (count ?? 0) > 0;
}

/**
 * Create a short-lived, force-download signed URL for a private attachment.
 * Runs through the service-role client so the recipient's own storage RLS can
 * never block the link (the file may have been uploaded by the other party),
 * while the caller is still gated to participants/staff here on the server.
 */
export async function getAttachmentSignedUrl(
  admin: SupabaseClient,
  input: {
    conversationId: string;
    messageId: string;
    viewerId: string;
    viewerRole: ConsultationRole;
  },
): Promise<{ url: string; fileName: string }> {
  const staff = isStaffRole(input.viewerRole);
  const { data: attachment } = await admin
    .from("consultation_attachments")
    .select("id, conversation_id, storage_path, file_name, deleted_at")
    .eq("message_id", input.messageId)
    .maybeSingle();
  if (!attachment || attachment.deleted_at) throw new Error("Attachment not found");
  if (attachment.conversation_id !== input.conversationId) throw new Error("Forbidden");
  if (!staff && !(await assertParticipant(admin, input.conversationId, input.viewerId))) {
    throw new Error("Forbidden");
  }
  const { data, error } = await admin.storage
    .from("consultation-attachments")
    .createSignedUrl(attachment.storage_path, 300, { download: true });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create the download link");
  }
  return { url: data.signedUrl, fileName: attachment.file_name };
}

async function assertActiveConversation(
  admin: SupabaseClient,
  conversationId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("consultation_conversations")
    .select("status")
    .eq("id", conversationId)
    .maybeSingle();
  return data?.status === "active";
}

const MESSAGE_FULL_SELECT = `
  id, conversation_id, sender_id, sender_role, body, message_type, reply_to_id,
  is_pinned, pinned_at, edited_at, deleted_at, created_at,
  consultation_attachments(*),
  reply_to:reply_to_id (id, body, sender_role, deleted_at, created_at)
`;

export async function sendMessage(
  admin: SupabaseClient,
  input: {
    conversationId: string;
    senderId: string;
    senderRole: SenderRole;
    body: string;
    replyToId?: string | null;
  },
): Promise<ConsultationMessageRow> {
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("Message body is required");
  if (trimmed.length > 4000) throw new Error("Message is too long");
  if (!(await assertParticipant(admin, input.conversationId, input.senderId))) {
    throw new Error("Forbidden");
  }
  if (!(await assertActiveConversation(admin, input.conversationId))) {
    throw new Error("This conversation is read-only");
  }
  const { data, error } = await admin
    .from("consultation_messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      sender_role: input.senderRole,
      body: trimmed,
      message_type: "text",
      reply_to_id: input.replyToId ?? null,
    })
    .select(MESSAGE_FULL_SELECT)
    .single();
  if (error) throw new Error(`Could not send the message: ${error.message}`);

  // Best-effort admin notification for patient → doctor messages only. The
  // doctor → patient direction is already covered by the
  // `consultation_notify_patient` trigger, so nothing is added here for it.
  if (input.senderRole === "patient") {
    const patientName = await getConversationPatientName(admin, input.conversationId);
    await createAdminNotification(admin, {
      type: "patient_message",
      title: "New patient message",
      body: `${patientName ?? "A patient"} sent a new message in a consultation.`,
      link: `/admin/consultations/${input.conversationId}`,
      dedupKey: buildAdminNotificationDedupKey("patient_message", (data as { id: string }).id),
    });
  }

  return data as unknown as ConsultationMessageRow;
}

/**
 * Upper bound for chat attachments uploaded through the server function. The
 * request body travels as base64 inside a JSON server-function call, which is
 * far more reliable across mobile browsers/networks than the direct
 * browser→Supabase Storage cross-origin PUT (the one that surfaced as
 * "TypeError: Failed to fetch").
 */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Store a chat attachment on the server: upload the decoded bytes to the
 * private `consultation-attachments` bucket with the service-role client, then
 * delegate to `createFileMessage` for the participant/active checks and the
 * message + attachment rows. Called from `consultationUploadAttachment` after
 * the middleware has authenticated the caller (so `userId`/`role` are trusted).
 */
export async function uploadAttachment(
  admin: SupabaseClient,
  input: {
    conversationId: string;
    userId: string;
    role: ConsultationRole;
    fileName: string;
    mimeType: string;
    size: number;
    fileBase64: string;
    attachmentType: AttachmentKind;
  },
): Promise<ConsultationMessageRow> {
  if (!input.fileBase64) throw new Error("The selected file is empty or could not be read.");
  if (input.size <= 0 || input.size > ATTACHMENT_MAX_BYTES) {
    throw new Error("Files must be 20 MB or smaller.");
  }
  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.length === 0 || bytes.length !== input.size) {
    throw new Error("The selected file could not be read. Please try again.");
  }

  // Same sanitisation as the previous client-side path.
  const safeName = input.fileName.replace(/[^\w.-]+/g, "_").slice(-120) || `file-${Date.now()}`;
  const path = `${input.conversationId}/${input.userId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await admin.storage
    .from("consultation-attachments")
    .upload(path, bytes, {
      upsert: false,
      contentType: input.mimeType || "application/octet-stream",
    });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  return createFileMessage(admin, {
    conversationId: input.conversationId,
    userId: input.userId,
    senderRole: senderRoleOf(input.role),
    storagePath: path,
    fileName: input.fileName,
    mimeType: input.mimeType || "application/octet-stream",
    size: input.size,
    attachmentType: input.attachmentType,
  });
}

export async function createFileMessage(
  admin: SupabaseClient,
  input: {
    conversationId: string;
    userId: string;
    senderRole: SenderRole;
    storagePath: string;
    fileName: string;
    mimeType: string;
    size: number;
    attachmentType: AttachmentKind;
  },
): Promise<ConsultationMessageRow> {
  if (!(await assertParticipant(admin, input.conversationId, input.userId))) {
    throw new Error("Forbidden");
  }
  if (!(await assertActiveConversation(admin, input.conversationId))) {
    throw new Error("This conversation is read-only");
  }
  const { data: message, error: msgError } = await admin
    .from("consultation_messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.userId,
      sender_role: input.senderRole,
      body: input.fileName,
      message_type: "file",
    })
    .select("id, created_at")
    .single();
  if (msgError) throw new Error(`Could not save the file message: ${msgError.message}`);
  const { error: attError } = await admin.from("consultation_attachments").insert({
    conversation_id: input.conversationId,
    message_id: message.id,
    uploaded_by: input.userId,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    file_size: input.size,
    attachment_type: input.attachmentType,
  });
  if (attError) {
    throw new Error(`Could not save the attachment record: ${attError.message}`);
  }

  // Best-effort admin notification for patient-sent file/attachment messages
  // (mirrors the text-message notification in `sendMessage`).
  if (input.senderRole === "patient") {
    const patientName = await getConversationPatientName(admin, input.conversationId);
    await createAdminNotification(admin, {
      type: "patient_message",
      title: "New patient message",
      body: `${patientName ?? "A patient"} uploaded a file in a consultation.`,
      link: `/admin/consultations/${input.conversationId}`,
      dedupKey: buildAdminNotificationDedupKey("patient_message", message.id),
    });
  }

  const { data: full } = await admin
    .from("consultation_messages")
    .select(MESSAGE_FULL_SELECT)
    .eq("id", message.id)
    .maybeSingle();
  await recordEvent(admin, {
    conversationId: input.conversationId,
    actorId: input.userId,
    actorRole: input.senderRole === "patient" ? "patient" : "doctor",
    eventType: CONSULTATION_EVENTS.ATTACHMENT_UPLOADED,
    messageId: message.id,
  });
  return (full ?? message) as unknown as ConsultationMessageRow;
}

export async function editMessage(
  admin: SupabaseClient,
  input: { messageId: string; body: string; actorUserId: string; actorRole: ConsultationRole },
) {
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("Message body is required");

  const { data: message } = await admin
    .from("consultation_messages")
    .select("id, conversation_id, sender_id, sender_role, deleted_at, created_at")
    .eq("id", input.messageId)
    .maybeSingle();
  if (!message) throw new Error("Message not found");
  if ((message as MessageRow).deleted_at) throw new Error("Message was deleted");

  if (
    !(await canActOnMessage(
      admin,
      { userId: input.actorUserId, role: input.actorRole },
      message as MessageRow,
    ))
  ) {
    throw new Error("Forbidden");
  }
  if (
    !(await assertParticipant(admin, (message as MessageRow).conversation_id, input.actorUserId))
  ) {
    throw new Error("Forbidden");
  }

  const { data: updated } = await admin
    .from("consultation_messages")
    .update({
      body: trimmed,
      edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.messageId)
    .select("id, body, edited_at")
    .single();
  await recordEvent(admin, {
    conversationId: (message as MessageRow).conversation_id,
    actorId: input.actorUserId,
    actorRole: input.actorRole,
    eventType: CONSULTATION_EVENTS.MESSAGE_EDITED,
    messageId: input.messageId,
  });
  return updated;
}

export async function softDeleteMessage(
  admin: SupabaseClient,
  input: { messageId: string; actorUserId: string; actorRole: ConsultationRole },
) {
  const { data: message } = await admin
    .from("consultation_messages")
    .select("id, conversation_id, sender_id, sender_role, deleted_at, created_at")
    .eq("id", input.messageId)
    .maybeSingle();
  if (!message) throw new Error("Message not found");
  if ((message as MessageRow).deleted_at) throw new Error("Message already deleted");

  if (
    !(await canActOnMessage(
      admin,
      { userId: input.actorUserId, role: input.actorRole },
      message as MessageRow,
    ))
  ) {
    throw new Error("Forbidden");
  }
  if (
    !(await assertParticipant(admin, (message as MessageRow).conversation_id, input.actorUserId))
  ) {
    throw new Error("Forbidden");
  }

  const { data: updated } = await admin
    .from("consultation_messages")
    .update({
      body: "",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.messageId)
    .select("id, deleted_at")
    .single();
  await recordEvent(admin, {
    conversationId: (message as MessageRow).conversation_id,
    actorId: input.actorUserId,
    actorRole: input.actorRole,
    eventType: CONSULTATION_EVENTS.MESSAGE_DELETED,
    messageId: input.messageId,
  });
  return updated;
}

export async function togglePinMessage(
  admin: SupabaseClient,
  input: { messageId: string; pinned: boolean; actorUserId: string; actorRole: ConsultationRole },
) {
  const { data: message } = await admin
    .from("consultation_messages")
    .select("id, conversation_id, sender_id, sender_role, deleted_at, created_at")
    .eq("id", input.messageId)
    .maybeSingle();
  if (!message) throw new Error("Message not found");
  const row = message as MessageRow;
  if (row.deleted_at) throw new Error("Message was deleted");

  const staff = isStaffRole(input.actorRole);
  if (!staff && row.sender_id !== input.actorUserId) throw new Error("Forbidden");
  if (!(await assertParticipant(admin, row.conversation_id, input.actorUserId))) {
    throw new Error("Forbidden");
  }

  const { data: updated } = await admin
    .from("consultation_messages")
    .update({
      is_pinned: input.pinned,
      pinned_at: input.pinned ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.messageId)
    .select("id, is_pinned, pinned_at")
    .single();
  await recordEvent(admin, {
    conversationId: row.conversation_id,
    actorId: input.actorUserId,
    actorRole: input.actorRole,
    eventType: input.pinned
      ? CONSULTATION_EVENTS.MESSAGE_PINNED
      : CONSULTATION_EVENTS.MESSAGE_UNPINNED,
    messageId: input.messageId,
  });
  return updated;
}

// --- Timeline (audit trail) --------------------------------------------------

export async function getTimeline(
  admin: SupabaseClient,
  input: { conversationId: string; viewerId: string; viewerRole: ConsultationRole },
): Promise<ConsultationEventRow[]> {
  if (
    !(await assertParticipant(admin, input.conversationId, input.viewerId)) &&
    !isStaffRole(input.viewerRole)
  ) {
    throw new Error("Forbidden");
  }
  const { data } = await admin
    .from("consultation_events")
    .select("id, actor_id, actor_role, event_type, message_id, metadata, created_at")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as ConsultationEventRow[];
}
