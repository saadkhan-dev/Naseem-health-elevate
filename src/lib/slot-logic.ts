/**
 * Pure slot/interval helpers shared by the client booking UI
 * (`src/lib/bookings.ts`) and the server-side booking validation in
 * `src/lib/actions.functions.ts`.
 *
 * This module has NO imports (no Supabase client, no server function
 * wrappers) so both sides can use it without pulling in the other.
 *
 * All times are "minutes since midnight" integers; durations are minutes.
 * Intervals are half-open [start, start + duration).
 */

export interface TimeInterval {
  startMinutes: number;
  durationMinutes: number;
}

/** Do [aStart, aStart+aDur) and [bStart, bStart+bDur) overlap? */
export function intervalsOverlap(
  aStart: number,
  aDur: number,
  bStart: number,
  bDur: number,
): boolean {
  if (aDur <= 0 || bDur <= 0) return false;
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

/** Does [start, start+duration) overlap any of the booked intervals? */
export function slotOverlapsAny(
  startMinutes: number,
  durationMinutes: number,
  booked: TimeInterval[],
): boolean {
  return booked.some((b) =>
    intervalsOverlap(startMinutes, durationMinutes, b.startMinutes, b.durationMinutes),
  );
}
