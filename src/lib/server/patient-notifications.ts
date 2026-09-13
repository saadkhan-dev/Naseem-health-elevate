import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isValidRecipientId,
  normalizeAdminNotificationInput,
  type AdminNotificationInput,
} from "@/lib/admin-notifications";

/**
 * Server-only helpers for the in-app notification centers. Rows are always
 * written with the service-role client (RLS bypassed) and read back through
 * RLS policies:
 *  - `patient_notifications` -> the patient via `patient_notifications_read_own`
 *  - `admin_notifications`   -> admin/doctor staff via `is_admin()` /
 *                               `admin_notifications_read_own`
 */

export type PatientNotificationType =
  | "appointment_status"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "consultation_message"
  | "video_ready"
  | "payment"
  | "review"
  | "support_reply"
  | "order"
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

/**
 * Create an in-app notification for admin/doctor staff (`admin_notifications`).
 *
 * Best-effort like the patient helper: it never throws, so failures can never
 * break booking/payment/etc. A notification is skipped (with a server-side log)
 * when:
 *  - title/body are empty after sanitization,
 *  - a recipient_id is provided but does not look like a valid user uuid
 *    (never silently downgraded to a broadcast),
 *  - the dedup_key already exists for the same recipient scope.
 *
 * `recipientId: undefined | null` => broadcast notification visible to every
 * authorized admin/doctor. When a dedupKey is supplied, the insert is skipped
 * if an existing row matches the same (recipient scope, dedup_key); the unique
 * partial indexes in `supabase/admin-notifications.sql` enforce this at the DB
 * level as well (racing inserts). See that migration for the exact policy set.
 */
export async function createAdminNotification(
  admin: SupabaseClient,
  input: AdminNotificationInput,
): Promise<void> {
  const record = normalizeAdminNotificationInput(input);

  if (!record.title || !record.body) {
    console.error("[notifications] createAdminNotification skipped: empty title/body");
    return;
  }
  if (record.recipient_id && !isValidRecipientId(record.recipient_id)) {
    // Never guess: an invalid id must not become a broadcast (or a failed
    // foreign-key insert). Log and skip instead.
    console.error("[notifications] createAdminNotification skipped: invalid recipient_id");
    return;
  }

  try {
    if (record.dedup_key) {
      let query = admin.from("admin_notifications").select("id").eq("dedup_key", record.dedup_key);
      query = record.recipient_id
        ? query.eq("recipient_id", record.recipient_id)
        : query.is("recipient_id", null);
      const { data } = await query.maybeSingle();
      if (data) return; // already notified for this event
    }
    await admin.from("admin_notifications").insert(record);
  } catch (e) {
    console.error(
      "[notifications] createAdminNotification failed:",
      e instanceof Error ? e.message : "unknown error",
    );
  }
}

export {
  isValidRecipientId,
  normalizeAdminNotificationInput,
  buildAdminNotificationDedupKey,
  type AdminNotificationInput,
  type AdminNotificationRecord,
  type AdminNotificationType,
  ADMIN_NOTIFICATION_TYPES,
} from "@/lib/admin-notifications";
