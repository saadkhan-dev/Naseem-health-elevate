import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInClinic, nowTimeInClinic, toMinutes } from "@/lib/clinic";
import { intervalsOverlap } from "@/lib/slot-logic";

/**
 * Shared server-side slot validation used by every (re)booking path so the
 * rules are identical everywhere:
 *  - Home Visit has no fixed slot — only the date is validated.
 *  - The date must be today or later (clinic timezone).
 *  - Same-day slots must be in the future (clinic timezone).
 *  - The time must fall on a duration-aligned slot inside an open
 *    availability window for that weekday.
 *  - The new [time, time+duration) interval must not overlap any active
 *    appointment for that date (excluding `excludeId`).
 *
 * Returns a human-readable error string, or `null` when the slot is valid.
 */
export async function validateAppointmentSlot(
  admin: SupabaseClient,
  input: {
    date: string;
    time: string | null;
    durationMinutes: number;
    isHomeVisit: boolean;
    /** Appointment id to ignore during the overlap scan (self). */
    excludeId?: string;
  },
): Promise<string | null> {
  const today = todayInClinic();
  if (input.date < today) {
    return "That date has already passed. Please pick a future date.";
  }

  if (input.isHomeVisit) return null;

  if (!input.time) return "A time slot is required.";
  if (input.date === today && input.time <= nowTimeInClinic()) {
    return "That time has already passed. Please pick a later slot.";
  }

  const [y, m, d] = input.date.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const timeMin = toMinutes(input.time);
  const duration = input.durationMinutes;

  const { data: windows } = await admin
    .from("availability")
    .select("start_time, end_time")
    .eq("day_of_week", dayOfWeek)
    .eq("is_available", true);

  const inOpenWindow = (windows ?? []).some((w) => {
    const start = toMinutes(w.start_time);
    const end = toMinutes(w.end_time);
    if (timeMin < start || timeMin >= end || timeMin + duration > end) return false;
    return (timeMin - start) % duration === 0;
  });

  if (!inOpenWindow) {
    return "That slot is not available. Please pick an open slot.";
  }

  let query = admin
    .from("appointments")
    .select("time, services:service_id (duration_minutes)")
    .eq("date", input.date)
    .not("status", "in", '("cancelled","rejected","no_show")');
  if (input.excludeId) query = query.neq("id", input.excludeId);

  const { data: activeRows } = await query;

  const overlaps = (activeRows ?? []).some((r) => {
    const t = r.time as string | null;
    if (!t) return false;
    const [th, tm] = t.split(":").map(Number);
    const otherDur =
      (r.services as { duration_minutes?: number | null } | null)?.duration_minutes ?? 30;
    return intervalsOverlap(timeMin, duration, th * 60 + tm, otherDur);
  });

  if (overlaps) {
    return "That time overlaps an existing appointment. Please pick another time.";
  }

  return null;
}
