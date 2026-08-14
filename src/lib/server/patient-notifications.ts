import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only helper for the in-app patient notification center
 * (`patient_notifications` table). Rows are always written with the
 * service-role client (RLS bypassed) and read by the patient through the
 * anon client + `patient_notifications_read_own` policy.
 */

export type PatientNotificationType =
  | "appointment_status"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "video_ready"
  | "payment"
  | "review"
  | "support_reply"
  | "general";

export async function createPatientNotification(
  admin: SupabaseClient,
  input: {
    userId: string;
    type: PatientNotificationType;
    title: string;
    body: string;
    link?: string | null;
  },
): Promise<void> {
  if (!input.userId) return;
  try {
    await admin.from("patient_notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000),
      link: input.link ?? null,
      read_at: null,
    });
  } catch {
    // Best-effort: never break the primary flow when a notification fails.
  }
}
