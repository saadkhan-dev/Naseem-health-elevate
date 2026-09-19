/**
 * Short, human-friendly patient-facing identifiers.
 *
 * The internal database primary keys (UUIDs) stay unchanged and keep driving
 * all relationships. These short codes are separate, patient-facing numbers
 * that are easy to read aloud, copy and type. Uniqueness is guaranteed at the
 * database level by a unique index on each column (see
 * `supabase/short-patient-ids.sql`); the server retries with a fresh code when
 * a collision is reported.
 *
 * Codes are purely NUMERIC so patients never confuse letters (I / L / O / 1)
 * when reading them off a phone or typing them on a mobile keypad, and the
 * leading digit is never zero so a code like "APT-482193" cannot be
 * mis-remembered as a shorter number. 6 digits ≈ 900k combinations per prefix;
 * the unique index + server-side retry guarantees uniqueness.
 */

const DIGIT_LENGTH = 6;

function randomNumericCode(): string {
  // First digit 1-9 (never a leading zero); remaining digits 0-9.
  let code = String(Math.floor(Math.random() * 9) + 1);
  for (let i = 1; i < DIGIT_LENGTH; i++) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
}

/** Patient-facing appointment number, e.g. "APT-482193". */
export function generateAppointmentNo(): string {
  return `APT-${randomNumericCode()}`;
}

/** Patient-facing video consultation number, e.g. "VC-482193". */
export function generateVideoConsultationNo(): string {
  return `VC-${randomNumericCode()}`;
}

/** Patient-facing order number, e.g. "ORD-482193". */
export function generateOrderNo(): string {
  return `ORD-${randomNumericCode()}`;
}
