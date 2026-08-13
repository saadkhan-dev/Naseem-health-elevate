import { format } from "date-fns";

/**
 * Clinic working hours + Pakistan Standard Time (UTC+5) helpers.
 * The clinic has no daylight-saving time, so UTC+5 is a fixed offset.
 */

export const CLINIC_TIME_ZONE = "Asia/Karachi";

export interface ClinicDayHours {
  /** 0 = Sunday, 1 = Monday ... 6 = Saturday */
  dayOfWeek: number;
  /** "HH:mm" in 24h format */
  start: string;
  end: string;
}

/** Monday–Saturday: 7:00 PM – 11:00 PM. Sunday: 11:00 AM – 1:00 PM. */
export const CLINIC_HOURS: ClinicDayHours[] = [
  { dayOfWeek: 0, start: "11:00", end: "13:00" },
  { dayOfWeek: 1, start: "19:00", end: "23:00" },
  { dayOfWeek: 2, start: "19:00", end: "23:00" },
  { dayOfWeek: 3, start: "19:00", end: "23:00" },
  { dayOfWeek: 4, start: "19:00", end: "23:00" },
  { dayOfWeek: 5, start: "19:00", end: "23:00" },
  { dayOfWeek: 6, start: "19:00", end: "23:00" },
];

export function clinicHoursForDay(dayOfWeek: number): ClinicDayHours | undefined {
  return CLINIC_HOURS.find((c) => c.dayOfWeek === dayOfWeek);
}

function karachiNow(): { date: string; time: string } {
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const now = new Date();
  return { date: dateFmt.format(now), time: timeFmt.format(now) };
}

/** Today's date ("yyyy-MM-dd") in Pakistan time, regardless of the machine timezone. */
export function todayInClinic(): string {
  return karachiNow().date;
}

/** Current clock time ("HH:mm", 24h) in Pakistan time. */
export function nowTimeInClinic(): string {
  return karachiNow().time;
}

/** The booking date a calendar-picked Date represents ("yyyy-MM-dd"). */
export function toClinicDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function isDateBeforeTodayClinic(date: Date): boolean {
  return toClinicDate(date) < todayInClinic();
}

/** "HH:mm" -> minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
