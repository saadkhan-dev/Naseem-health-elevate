import { describe, expect, it } from "bun:test";
import {
  CLINIC_HOURS,
  CLINIC_TIME_ZONE,
  clinicHoursForDay,
  todayInClinic,
  nowTimeInClinic,
  toClinicDate,
  isDateBeforeTodayClinic,
  toMinutes,
} from "../src/lib/clinic";
import { generateTimeSlots, formatTimeDisplay, type AvailabilitySlot } from "../src/lib/bookings";

const MON = new Date(2026, 7, 17, 12, 0, 0);
const SUN = new Date(2026, 7, 23, 12, 0, 0);
const TUE = new Date(2026, 7, 18, 12, 0, 0);

function window(day_of_week: number, start_time: string, end_time: string): AvailabilitySlot {
  return {
    id: `w-${day_of_week}-${start_time}`,
    day_of_week,
    start_time,
    end_time,
    is_available: true,
  };
}

describe("CLINIC_HOURS", () => {
  it("has 7 days (Sun=0 … Sat=6)", () => {
    expect(CLINIC_HOURS).toHaveLength(7);
    expect(CLINIC_HOURS.map((c) => c.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("Sunday is 11:00 – 13:00", () => {
    expect(clinicHoursForDay(0)).toMatchObject({ start: "11:00", end: "13:00" });
  });

  it("Mon–Sat are 19:00 – 23:00", () => {
    for (let d = 1; d <= 6; d++) {
      expect(clinicHoursForDay(d)).toMatchObject({ start: "19:00", end: "23:00" });
    }
  });

  it("timezone is fixed to Asia/Karachi (UTC+5, no DST)", () => {
    expect(CLINIC_TIME_ZONE).toBe("Asia/Karachi");
    const off = new Date("2026-08-17T00:00:00Z").getTimezoneOffset?.() ?? 0;
    expect(off).toBeTypeOf("number");
  });
});

describe("clinic date/time helpers", () => {
  it("todayInClinic returns yyyy-MM-dd", () => {
    expect(todayInClinic()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("nowTimeInClinic returns HH:mm (24h)", () => {
    expect(nowTimeInClinic()).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });

  it("todayInClinic matches the Asia/Karachi date computed independently", () => {
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(todayInClinic()).toBe(expected);
  });

  it("toClinicDate formats a Date as yyyy-MM-dd", () => {
    expect(toClinicDate(MON)).toBe("2026-08-17");
    expect(toClinicDate(SUN)).toBe("2026-08-23");
  });

  it("isDateBeforeTodayClinic flags past dates only", () => {
    expect(isDateBeforeTodayClinic(new Date(2020, 0, 1))).toBe(true);
    expect(isDateBeforeTodayClinic(new Date(2030, 0, 1))).toBe(false);
  });

  it("toMinutes converts HH:mm to minutes since midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("00:30")).toBe(30);
    expect(toMinutes("19:00")).toBe(1140);
    expect(toMinutes("23:00")).toBe(1380);
  });
});

describe("generateTimeSlots", () => {
  it("Monday 19:00–23:00 at 30-min interval yields 8 slots", () => {
    const slots = generateTimeSlots([window(1, "19:00", "23:00")], MON, [], 30);
    expect(slots).toEqual(["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"]);
  });

  it("does not offer a slot that would overrun the window end", () => {
    const slots = generateTimeSlots([window(1, "19:00", "23:00")], MON, [], 30);
    expect(slots).not.toContain("23:00");
    expect(slots[slots.length - 1]).toBe("22:30");
  });

  it("uses service duration when it exceeds 30 minutes (45-min physio → 45-min interval)", () => {
    const slots = generateTimeSlots([window(1, "19:00", "23:00")], MON, [], 45);
    expect(slots).toEqual(["19:00", "19:45", "20:30", "21:15", "22:00"]);
  });

  it("uses the service duration for the slot grid (15-min service → 15-min slots)", () => {
    const slots = generateTimeSlots([window(1, "19:00", "23:00")], MON, [], 15);
    expect(slots).toEqual([
      "19:00",
      "19:15",
      "19:30",
      "19:45",
      "20:00",
      "20:15",
      "20:30",
      "20:45",
      "21:00",
      "21:15",
      "21:30",
      "21:45",
      "22:00",
      "22:15",
      "22:30",
      "22:45",
    ]);
  });

  it("uses a 40-min interval for a 40-minute service (physio)", () => {
    const slots = generateTimeSlots([window(1, "19:00", "23:00")], MON, [], 40);
    expect(slots).toEqual(["19:00", "19:40", "20:20", "21:00", "21:40", "22:20"]);
  });

  it("excludes already-booked slots", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "23:00")],
      MON,
      [
        { slot: "19:00", durationMinutes: 30 },
        { slot: "21:30", durationMinutes: 30 },
      ],
      30,
    );
    expect(slots).not.toContain("19:00");
    expect(slots).not.toContain("21:30");
    expect(slots).toHaveLength(6);
  });

  it("a 40-min booking at 19:00 blocks every overlapping 15-min grid slot (19:00–19:30) but not 19:45", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "23:00")],
      MON,
      [{ slot: "19:00", durationMinutes: 40 }],
      15,
    );
    expect(slots).toEqual([
      "19:45",
      "20:00",
      "20:15",
      "20:30",
      "20:45",
      "21:00",
      "21:15",
      "21:30",
      "21:45",
      "22:00",
      "22:15",
      "22:30",
      "22:45",
    ]);
  });

  it("does not block a slot that starts exactly when a 40-min booking ends (19:40)", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "23:00")],
      MON,
      [{ slot: "19:00", durationMinutes: 40 }],
      40,
    );
    expect(slots).not.toContain("19:00");
    expect(slots).toContain("19:40");
  });

  it("returns [] for a flexible (null-duration) service — no fixed slots", () => {
    expect(generateTimeSlots([window(1, "19:00", "23:00")], MON, [], null)).toEqual([]);
  });

  it("excludes past times when booking for today", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "23:00")],
      MON,
      [],
      30,
      "2026-08-17",
      "20:00",
    );
    expect(slots).toEqual(["20:30", "21:00", "21:30", "22:00", "22:30"]);
  });

  it("keeps all slots when the date is not today", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "23:00")],
      MON,
      [],
      30,
      "2026-08-10",
      "20:00",
    );
    expect(slots).toHaveLength(8);
  });

  it("Sunday 11:00–13:00 yields 11:00, 11:30, 12:00, 12:30", () => {
    const slots = generateTimeSlots([window(0, "11:00", "13:00")], SUN, [], 30);
    expect(slots).toEqual(["11:00", "11:30", "12:00", "12:30"]);
  });

  it("returns [] for a closed day (no matching availability)", () => {
    expect(generateTimeSlots([window(1, "19:00", "23:00")], SUN, [], 30)).toEqual([]);
  });

  it("combines non-overlapping windows on the same day without duplicates", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "20:00"), window(1, "20:00", "23:00")],
      MON,
      [],
      30,
    );
    expect(slots).toEqual(["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"]);
    expect(new Set(slots).size).toBe(8);
  });
});

describe("formatTimeDisplay", () => {
  it("formats 12-hour display correctly", () => {
    expect(formatTimeDisplay("19:00")).toBe("7:00 PM");
    expect(formatTimeDisplay("23:15")).toBe("11:15 PM");
    expect(formatTimeDisplay("12:30")).toBe("12:30 PM");
    expect(formatTimeDisplay("00:00")).toBe("12:00 AM");
    expect(formatTimeDisplay("09:05")).toBe("9:05 AM");
    expect(formatTimeDisplay("11:00")).toBe("11:00 AM");
  });
});
