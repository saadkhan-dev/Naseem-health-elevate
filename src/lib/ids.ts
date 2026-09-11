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
 * Alphabet excludes visually confusing characters (I, L, O, 0, 1), so codes
 * are safe to dictate over the phone. 6 chars over 32 symbols ≈ 1.07 billion
 * combinations per prefix.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/** Patient-facing appointment number, e.g. "APT-7K4M92". */
export function generateAppointmentNo(): string {
  return `APT-${randomCode()}`;
}

/** Patient-facing video consultation number, e.g. "VC-8F3K21". */
export function generateVideoConsultationNo(): string {
  return `VC-${randomCode()}`;
}

/** Patient-facing order number, e.g. "ORD-2T7H4J". */
export function generateOrderNo(): string {
  return `ORD-${randomCode()}`;
}
