import { getSupabaseAdmin } from "./supabase-admin";
import type { AppointmentStatusValue } from "../notifications";

/**
 * Result of a successful "Find My Appointment" recovery. Only the short
 * patient-facing appointment number and the patient's own summary are
 * returned — internal UUIDs are never exposed to the patient.
 */
export interface RecoveredAppointmentRow {
  appointmentNo: string;
  patientName: string;
  status: AppointmentStatusValue;
  /** "yyyy-MM-dd" */
  date: string;
  /** "HH:mm". null for flexible services (e.g. Home Visit — the doctor confirms the time). */
  time: string | null;
  serviceName: string | null;
}

/**
 * Find a guest patient's appointments by name + (phone OR email).
 *
 * Security rules:
 *  - A bare name NEVER matches on its own — the name is always ANDed with a
 *    verified phone number or email, so other patients' appointments cannot be
 *    enumerated by guessing names.
 *  - The name is matched case-insensitively (patients type it from memory and
 *    may not reproduce the exact casing used at booking), but wildcard
 *    characters are escaped so the name cannot widen the search.
 *  - Rows that predate the short-ID migration (appointment_no IS NULL) are
 *    excluded: the patient-facing recovery flow returns only short
 *    appointment numbers. Legacy rows stay reachable through the unchanged
 *    "Appointment ID + phone/email" lookup.
 *
 * Runs on the service-role client, like every other public server function.
 */
export async function recoverAppointmentsByContact(params: {
  name: string;
  phone?: string;
  email?: string;
}): Promise<RecoveredAppointmentRow[]> {
  const admin = getSupabaseAdmin();

  const pattern = params.name.replace(/[\\%_]/g, (ch) => `\\${ch}`);

  let query = admin
    .from("appointments")
    .select(
      "appointment_no, patient_name, status, date, time, service_id, services:service_id (name)",
    )
    .ilike("patient_name", pattern)
    .not("appointment_no", "is", null);

  if (params.phone) query = query.eq("patient_phone", params.phone);
  if (params.email) query = query.ilike("patient_email", params.email);

  const { data: rows, error } = await query
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .limit(20);

  if (error || !rows || rows.length === 0) return [];

  return rows.map((row) => {
    const services = row.services as unknown as { name: string | null } | null;
    return {
      appointmentNo: row.appointment_no as string,
      patientName: row.patient_name as string,
      status: row.status as AppointmentStatusValue,
      date: row.date as string,
      time: (row.time as string | null)?.slice(0, 5) ?? null,
      serviceName: services?.name ?? null,
    };
  });
}
