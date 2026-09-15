import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Minimal info returned by "Find My Order Id". Only the public order number
 * and basic identifying details — never payment_status, address, or internal
 * UUIDs beyond what's needed for display keys.
 */
export interface RecoveredOrderRow {
  orderNo: string;
  name: string;
  total: number;
  status: string;
  createdAt: string;
}

/**
 * Find a guest patient's orders by name + (phone OR email).
 *
 * Security rules mirror `recoverAppointmentsByContact`:
 *  - A bare name NEVER matches on its own — the name is always ANDed with a
 *    verified phone number or email, so other patients' orders cannot be
 *    enumerated by guessing names.
 *  - The name is matched case-insensitively, with wildcard characters escaped.
 *  - Only safe, patient-facing fields are returned — never the patient's full
 *    address, internal UUIDs, or payment details.
 */
export async function recoverOrdersByContact(params: {
  name: string;
  phone?: string;
  email?: string;
}): Promise<RecoveredOrderRow[]> {
  const admin = getSupabaseAdmin();

  const pattern = params.name.replace(/[\\%_]/g, (ch) => `\\${ch}`);

  let query = admin
    .from("orders")
    .select("order_no, name, total, status, created_at")
    .ilike("name", pattern);

  if (params.phone) query = query.eq("phone", params.phone);
  if (params.email) query = query.ilike("email", params.email);

  const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(20);

  if (error || !rows || rows.length === 0) return [];

  return rows.map((row) => ({
    orderNo: row.order_no as string,
    name: row.name as string,
    total: Number(row.total),
    status: row.status as string,
    createdAt: row.created_at as string,
  }));
}
