import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendAppointmentNotifications,
  sendVideoReadyNotifications,
  getServerNotificationEnv,
} from "./notifications";
import { normalizeSiteUrl, videoJoinUrl } from "@/lib/video-join";
import type { NotificationEnv, NotificationResult } from "@/lib/notifications";

/**
 * Appointment reminders.
 *
 * A `reminders` row is created manually by an admin (see
 * `supabase/feature-foundation.sql` + `supabase/reminders-claim.sql`).
 * `sendDueAppointmentReminders` is idempotent and safe to run on a schedule
 * (a Cloudflare Cron Trigger via Nitro scheduled tasks, or the admin
 * "Send due" action) without double-sending:
 *
 *  1. candidate due rows are claimed ONE AT A TIME with an atomic conditional
 *     update (`scheduled` → `processing`, stamping `updated_at`);
 *  2. concurrent runs cannot claim the same row, so a reminder is delivered at
 *     most once;
 *  3. rows stuck in `processing` for more than `REMINDER_PROCESSING_STALE_MS`
 *     (e.g. the worker was killed mid-flight) are reclaimed and retried;
 *  4. before sending, the appointment is re-checked: cancelled / rejected /
 *     completed / no_show appointments and appointments whose clinic-local
 *     slot time has already passed are skipped and their reminders cancelled
 *     (never sent, never retried);
 *  5. the reminder is only marked `sent` if at least one channel actually
 *     succeeded — channel failures leave the row `failed` with the error.
 *
 * Video consultations include their secure join link in the reminder.
 */

export const REMINDER_BATCH_LIMIT = 50;
export const REMINDER_PROCESSING_STALE_MS = 15 * 60 * 1000;

export type ReminderChannel = "email" | "sms" | "whatsapp";
export type ReminderFinalStatus = "sent" | "failed" | "cancelled";

export interface ReminderInput {
  appointmentId: string;
  channel: ReminderChannel;
  /** Clinic-local date "yyyy-MM-dd" to remind on (start of day). */
  remindOn: string;
  /** "HH:mm" clinic-local time to send at. */
  remindAt: string;
}

export function remindAtTimestamp(remindOn: string, remindAt: string): string {
  // Clinic timezone is fixed UTC+5 (no DST). Encode the wall-clock date/time
  // with the +05:00 offset so the DB stores the exact clinic-local instant.
  return `${remindOn}T${remindAt}:00+05:00`;
}

/** Create a scheduled reminder for an appointment (idempotent per slot). */
export async function createAppointmentReminder(
  admin: SupabaseClient,
  input: ReminderInput,
): Promise<{ error: string | null }> {
  const { data: existing } = await admin
    .from("reminders")
    .select("id")
    .eq("appointment_id", input.appointmentId)
    .eq("status", "scheduled")
    .eq("channel", input.channel)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("reminders")
      .update({
        remind_at: remindAtTimestamp(input.remindOn, input.remindAt),
        status: "scheduled",
      })
      .eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await admin.from("reminders").insert({
    appointment_id: input.appointmentId,
    channel: input.channel,
    remind_at: remindAtTimestamp(input.remindOn, input.remindAt),
    status: "scheduled",
  });
  return { error: error?.message ?? null };
}

/**
 * Appointment statuses that must never receive a reminder. The remaining
 * statuses (`pending`, `confirmed`, `arrived`) are eligible.
 */
export const REMINDER_INELIGIBLE_APPOINTMENT_STATUSES = new Set<string>([
  "cancelled",
  "rejected",
  "completed",
  "no_show",
]);

export interface ReminderEligibilityVerdict {
  eligible: boolean;
  reason?: string;
}

/**
 * Decide whether a reminder should still be sent for an appointment.
 * `date`/`time` are the appointment's clinic-local slot values as stored in
 * the DB ("yyyy-MM-dd" / "HH:mm[:ss]"); the slot instant is compared against
 * `nowMs` using the fixed +05:00 offset. Appointments without a time
 * (flexible slots) rely on status alone. Malformed slots are treated as
 * eligible so the sender still attempts a delivery.
 */
export function appointmentReminderEligibility(
  appointment: {
    status: string | null;
    date: string | null;
    time: string | null;
  },
  nowMs: number = Date.now(),
): ReminderEligibilityVerdict {
  if (!appointment.status || REMINDER_INELIGIBLE_APPOINTMENT_STATUSES.has(appointment.status)) {
    return { eligible: false, reason: "Appointment is not active." };
  }
  if (!appointment.date || !appointment.time) return { eligible: true };
  const slot = new Date(`${appointment.date}T${appointment.time.slice(0, 5)}:00+05:00`);
  if (Number.isNaN(slot.getTime())) return { eligible: true };
  if (slot.getTime() <= nowMs) {
    return { eligible: false, reason: "Appointment time has already passed." };
  }
  return { eligible: true };
}

export interface ReminderCandidate {
  id: string;
  appointment_id: string;
  channel: string;
  remind_at: string;
  updated_at?: string | null;
}

/**
 * Merge freshly-due and stale-`processing` candidates, ordering by the
 * earliest reminder time and capping the batch.
 */
export function selectDueReminderCandidates(
  fresh: ReminderCandidate[],
  stale: ReminderCandidate[],
  limit: number,
): ReminderCandidate[] {
  return [...fresh, ...stale]
    .sort((a, b) => (a.remind_at < b.remind_at ? -1 : a.remind_at > b.remind_at ? 1 : 0))
    .slice(0, limit);
}

/**
 * Atomically claim a candidate reminder: move it to `processing` with a fresh
 * `updated_at` stamp, but only if it is still in the expected state. Returns
 * true when this run won the claim (and only the winner delivers).
 */
async function claimReminder(
  admin: SupabaseClient,
  candidate: ReminderCandidate,
  fresh: boolean,
  nowIso: string,
  staleCutoffIso: string,
): Promise<boolean> {
  let query = admin
    .from("reminders")
    .update({ status: "processing", updated_at: nowIso })
    .eq("id", candidate.id);
  query = fresh
    ? query.eq("status", "scheduled")
    : query.eq("status", "processing").lte("updated_at", staleCutoffIso);
  const { data, error } = await query.select("id").maybeSingle();
  return !error && !!data;
}

async function finishReminder(
  admin: SupabaseClient,
  id: string,
  status: ReminderFinalStatus,
  nowIso: string,
  errorText: string,
): Promise<void> {
  await admin
    .from("reminders")
    .update({
      status,
      sent_at: status === "sent" ? nowIso : null,
      updated_at: nowIso,
      error: errorText,
    })
    .eq("id", id);
}

/**
 * Send every due reminder exactly once. Rows claimed but not delivered
 * (e.g. a worker crash) are reclaimed on the next run once their `updated_at`
 * stamp goes stale. `env` is injectable for tests.
 */
export async function sendDueAppointmentReminders(
  admin: SupabaseClient,
  env: NotificationEnv = getServerNotificationEnv(),
): Promise<{ processed: number; sent: number; failed: number }> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const staleCutoffIso = new Date(nowMs - REMINDER_PROCESSING_STALE_MS).toISOString();

  const [freshRes, staleRes] = await Promise.all([
    admin
      .from("reminders")
      .select("id, appointment_id, channel, remind_at")
      .eq("status", "scheduled")
      .lte("remind_at", nowIso)
      .order("remind_at", { ascending: true })
      .limit(REMINDER_BATCH_LIMIT),
    admin
      .from("reminders")
      .select("id, appointment_id, channel, remind_at")
      .eq("status", "processing")
      .lte("updated_at", staleCutoffIso)
      .order("remind_at", { ascending: true })
      .limit(REMINDER_BATCH_LIMIT),
  ]);
  if (freshRes.error || staleRes.error) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const fresh = (freshRes.data ?? []) as unknown as ReminderCandidate[];
  const stale = (staleRes.data ?? []) as unknown as ReminderCandidate[];
  const freshIds = new Set(fresh.map((r) => r.id));
  const candidates = selectDueReminderCandidates(fresh, stale, REMINDER_BATCH_LIMIT);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const claimed = await claimReminder(
      admin,
      candidate,
      freshIds.has(candidate.id),
      nowIso,
      staleCutoffIso,
    );
    if (!claimed) continue;

    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .select(
        "appointment_no, patient_name, patient_phone, patient_email, date, time, status, services:service_id (name)",
      )
      .eq("id", candidate.appointment_id)
      .maybeSingle();

    if (appointmentError || !appointment) {
      await finishReminder(admin, candidate.id, "cancelled", nowIso, "Appointment not found.");
      processed++;
      continue;
    }

    const verdict = appointmentReminderEligibility(appointment, nowMs);
    if (!verdict.eligible) {
      await finishReminder(admin, candidate.id, "cancelled", nowIso, verdict.reason ?? "");
      processed++;
      continue;
    }

    const results = await deliverReminder(
      admin,
      candidate.appointment_id,
      appointment,
      env,
      candidate.channel,
    );
    const ok = results.some((r) => r.status === "sent");
    if (ok) sent++;
    else failed++;
    await finishReminder(
      admin,
      candidate.id,
      ok ? "sent" : "failed",
      nowIso,
      results.length > 0
        ? results
            .map((r) => r.detail ?? "")
            .join("; ")
            .slice(0, 500)
        : "Requested reminder channel has no matching contact on file (no phone/email), or is not configured.",
    );
    processed++;
  }
  return { processed, sent, failed };
}

/** Send one reminder on its channel and return per-channel results. */
async function deliverReminder(
  admin: SupabaseClient,
  appointmentId: string,
  appointment: {
    appointment_no: string | null;
    patient_name: string | null;
    patient_phone: string | null;
    patient_email: string | null;
    date: string;
    time: string | null;
    services: unknown;
  },
  env: NotificationEnv,
  requestedChannel: string,
): Promise<NotificationResult[]> {
  // An admin reminder is for exactly one channel — never silently re-routed to
  // email or the other phone channel (e.g. WhatsApp) when that choice is made.
  const only: ReminderChannel[] =
    requestedChannel === "email" || requestedChannel === "sms" || requestedChannel === "whatsapp"
      ? [requestedChannel]
      : [];
  const service = appointment.services as unknown as { name: string | null } | null;
  const isVideo = service?.name?.toLowerCase().includes("video consultation") ?? false;

  const siteUrl = normalizeSiteUrl(
    typeof process !== "undefined" ? process.env.SITE_URL : undefined,
  );
  const statusUrl = siteUrl ? `${siteUrl}/appointment-status` : undefined;

  const base = {
    appointmentId: (appointment.appointment_no as string | null) ?? appointmentId,
    patientName: appointment.patient_name ?? "Patient",
    serviceName: service?.name ?? "Your appointment",
    date: appointment.date as string,
    time: (appointment.time as string | null)?.slice(0, 5) ?? "Flexible",
    statusUrl,
    phone: appointment.patient_phone ?? undefined,
    email: appointment.patient_email ?? undefined,
  };

  if (isVideo) {
    const { data: session } = await admin
      .from("video_sessions")
      .select("vc_no")
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const vcNo = (session?.vc_no as string | null) ?? null;
    if (vcNo) {
      return sendVideoReadyNotifications(
        {
          ...base,
          vcNo,
          joinUrl: videoJoinUrl(siteUrl, vcNo),
        },
        env,
        { only },
      );
    }
  }

  return sendAppointmentNotifications(base, env, { only });
}
