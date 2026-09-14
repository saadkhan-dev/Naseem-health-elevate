import type { AppointmentWithDetails } from "@/lib/admin-data";

/**
 * Google-style search matching for the Admin Appointments page.
 *
 * Matching is case-insensitive and partial: every whitespace-separated token
 * of the query must appear somewhere in the appointment's searchable fields
 * (patient name, phone, email, appointment no., id, service, date, time).
 * Phone digits are normalized so "0300 1234567" matches regardless of the
 * stored formatting.
 */

export function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function appointmentHaystack(a: AppointmentWithDetails): string {
  return normalizeSearchTerm(
    [
      a.patient_name,
      a.patient_phone,
      a.patient_email,
      a.patient_id,
      a.appointment_no,
      a.id,
      a.service_name,
      a.date,
      a.time,
    ]
      .filter((v): v is string => !!v)
      .join(" "),
  );
}

function appointmentDigits(a: AppointmentWithDetails): string {
  const phone = (a.patient_phone ?? "").replace(/\D/g, "");
  return `${phone} ${normalizeSearchTerm(a.appointment_no ?? "")} ${normalizeSearchTerm(a.id)}`;
}

export function appointmentMatchesQuery(a: AppointmentWithDetails, rawQuery: string): boolean {
  const query = normalizeSearchTerm(rawQuery);
  if (!query) return true;
  const tokens = query.split(" ");
  const haystack = appointmentHaystack(a);
  const digits = appointmentDigits(a);
  return tokens.every((token) => {
    if (!token) return true;
    const tokenDigits = token.replace(/\D/g, "");
    if (tokenDigits.length >= 2 && digits.includes(tokenDigits)) return true;
    return haystack.includes(token);
  });
}
