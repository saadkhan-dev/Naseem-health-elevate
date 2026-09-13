/**
 * Shared, pure helpers for admin in-app notifications (`admin_notifications`).
 *
 * Mirrors `src/lib/notifications.ts`: no Supabase/DB imports — only types and
 * pure functions — so this module is safe to import from server code, browser
 * code and tests. The DB insert itself lives in
 * `src/lib/server/patient-notifications.ts` (`createAdminNotification`).
 */

export type AdminNotificationType =
  | "new_patient"
  | "new_appointment"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "patient_message"
  | "new_order"
  | "payment_update"
  | "support_message"
  | "video"
  | "review"
  | "general";

export const ADMIN_NOTIFICATION_TYPES: readonly AdminNotificationType[] = [
  "new_patient",
  "new_appointment",
  "appointment_cancelled",
  "appointment_rescheduled",
  "patient_message",
  "new_order",
  "payment_update",
  "support_message",
  "video",
  "review",
  "general",
];

/** Length caps — same limits as the patient helper (title <= 200, body <= 1000). */
export const ADMIN_NOTIFICATION_TITLE_MAX = 200;
export const ADMIN_NOTIFICATION_BODY_MAX = 1000;
export const ADMIN_NOTIFICATION_LINK_MAX = 1000;
export const ADMIN_NOTIFICATION_DEDUP_KEY_MAX = 200;

/**
 * What a caller wants to create. `recipientId` omitted (or null) => broadcast
 * notification visible to every authorized admin/doctor.
 */
export interface AdminNotificationInput {
  recipientId?: string | null;
  type?: AdminNotificationType;
  title: string;
  body: string;
  link?: string | null;
  /** Optional dedup key; the helper skips the insert when this row already exists. */
  dedupKey?: string | null;
}

/** Sanitized row shape actually written to `admin_notifications`. */
export interface AdminNotificationRecord {
  recipient_id: string | null;
  type: AdminNotificationType;
  title: string;
  body: string;
  link: string | null;
  dedup_key: string | null;
  read_at: null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Basic shape check for a Supabase user uuid (server-side recipient validation). */
export function isValidRecipientId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Build a stable dedup key for an event, e.g.
 * buildAdminNotificationDedupKey("new_appointment", "APT-7K4M92")
 * => "new_appointment:APT-7K4M92". Sanitizes the segments and caps the total
 * length so it never violates the DB/column limits.
 */
export function buildAdminNotificationDedupKey(type: string, entityId: string): string {
  const safeType =
    type
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "general";
  const safeId = entityId
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "");
  return `${safeType}:${safeId}`.slice(0, ADMIN_NOTIFICATION_DEDUP_KEY_MAX);
}

/**
 * Validate + sanitize a caller's input into the shape written to the DB.
 * Unknown/empty types fall back to "general"; empty optional fields become
 * null (clearly signalling "no value") instead of a castable empty string.
 */
export function normalizeAdminNotificationInput(
  input: AdminNotificationInput,
): AdminNotificationRecord {
  const rawType = typeof input?.type === "string" ? input.type.trim() : "";
  const type: AdminNotificationType = (ADMIN_NOTIFICATION_TYPES as readonly string[]).includes(
    rawType,
  )
    ? (rawType as AdminNotificationType)
    : "general";

  const title = (input?.title ?? "").toString().trim().slice(0, ADMIN_NOTIFICATION_TITLE_MAX);
  const body = (input?.body ?? "").toString().trim().slice(0, ADMIN_NOTIFICATION_BODY_MAX);

  const link =
    typeof input?.link === "string" && input.link.trim()
      ? input.link.trim().slice(0, ADMIN_NOTIFICATION_LINK_MAX)
      : null;

  const dedup_key =
    typeof input?.dedupKey === "string" && input.dedupKey.trim()
      ? input.dedupKey.trim().slice(0, ADMIN_NOTIFICATION_DEDUP_KEY_MAX)
      : null;

  const recipient_id =
    typeof input?.recipientId === "string" && input.recipientId.trim()
      ? input.recipientId.trim()
      : null;

  return { recipient_id, type, title, body, link, dedup_key, read_at: null };
}
