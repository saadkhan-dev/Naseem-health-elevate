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
 * A `reminders` row is created when an appointment is confirmed or manually
 * by an admin (see `supabase/feature-foundation.sql`). `sendDueAppointmentReminders`
 * is idempotent: it picks every due `scheduled` reminder, sends the
 * appointment reminder on its channel, and marks it sent/failed — so it can be
 * run on a schedule (e.g. a cron or a Supabase Edge Function) or from the
 * admin dashboard without double-sending.
 *
 * Video consultations include their secure join link in the reminder.
 */

export interface ReminderInput {
  appointmentId: string;
  channel: "email" | "sms" | "whatsapp";
  /** Clinic-local date "yyyy-MM-dd" to remind on (start of day). */
  remindOn: string;
  /** "HH:mm" clinic-local time to send at. */
  remindAt: string;
}

function remindAtTimestamp(remindOn: string, remindAt: string): string {
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
 * Send every due reminder once. Returns the number of reminders processed
 * (sent + failed). `env` is injectable for tests.
 */
export async function sendDueAppointmentReminders(
  admin: SupabaseClient,
  env: NotificationEnv = getServerNotificationEnv(),
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: due } = await admin
    .from("reminders")
    .select("id, appointment_id, channel")
    .eq("status", "scheduled")
    .lte("remind_at", new Date().toISOString())
    .order("remind_at")
    .limit(50);

  let sent = 0;
  let failed = 0;
  for (const reminder of due ?? []) {
    const results = await deliverReminder(admin, reminder.appointment_id as string, env);
    const ok = results.some((r) => r.status === "sent");
    if (ok) sent++;
    else failed++;
    await admin
      .from("reminders")
      .update({
        status: ok ? "sent" : "failed",
        sent_at: ok ? new Date().toISOString() : null,
        error: ok
          ? ""
          : results
              .map((r) => r.detail ?? "")
              .join("; ")
              .slice(0, 500),
      })
      .eq("id", reminder.id);
  }
  return { processed: due?.length ?? 0, sent, failed };
}

/** Send one reminder on its channel and return per-channel results. */
async function deliverReminder(
  admin: SupabaseClient,
  appointmentId: string,
  env: NotificationEnv,
): Promise<NotificationResult[]> {
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "appointment_no, patient_name, patient_phone, patient_email, date, time, services:service_id (name)",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return [{ channel: "email", status: "error", to: "", detail: "Appointment not found." }];
  }

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
      );
    }
  }

  return sendAppointmentNotifications(base, env);
}
