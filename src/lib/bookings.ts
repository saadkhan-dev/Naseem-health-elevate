import { supabase } from "@/lib/supabase";
import { FALLBACK_SERVICES } from "@/lib/fallback-content";
import { createBooking, checkAppointmentStatus, recoverAppointment } from "@/lib/actions.functions";
import { toClinicDate, todayInClinic } from "@/lib/clinic";
import { slotOverlapsAny, type TimeInterval } from "@/lib/slot-logic";
import type { NotificationResult } from "@/lib/notifications";

export interface Service {
  id: string;
  name: string;
  description: string | null;
  /** null = flexible (no fixed slot) — e.g. Home Visit, confirmed by the doctor. */
  duration_minutes: number | null;
  price: number;
  is_active: boolean;
}

/**
 * Video consultation is booked separately (its own flow, routes and
 * `video_sessions`), so it is excluded from the general Book Appointment
 * service dropdown. Detection is by name so it works regardless of the exact
 * wording used in the database (e.g. "Video Consultation" or "Online Video
 * Consultation").
 */
export const VIDEO_CONSULTATION_KEYWORD = "video consultation";

export const HOME_VISIT_SERVICE_NAME = "Home Visit";
export const HOME_VISIT_FEE_LABEL = "Flexible – based on time and distance";

export function isVideoConsultationService(service: { name: string }): boolean {
  return service.name.toLowerCase().includes(VIDEO_CONSULTATION_KEYWORD);
}

export function isHomeVisitService(service: { name: string }): boolean {
  return service.name.toLowerCase().includes("home visit");
}

/** Fee label to display for a service. Home Visit has a flexible (non-fixed) fee. */
export function getServiceFeeLabel(service: { name: string; price: number }): string {
  if (isHomeVisitService(service)) return HOME_VISIT_FEE_LABEL;
  return service.price > 0 ? `Rs. ${service.price}` : "";
}

export interface AvailabilitySlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

/** One-time availability for a SPECIFIC date, on top of the weekly schedule. */
export interface CustomAvailabilitySlot {
  id: string;
  /** Optional doctor/provider; null = clinic-wide. */
  doctor_id: string | null;
  specific_date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  notes: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  service_id: string;
  date: string;
  time: string;
  status: "pending" | "confirmed" | "rejected" | "completed" | "cancelled" | "arrived" | "no_show";
  notes: string | null;
  created_at: string;
}

export async function getServices(): Promise<Service[]> {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("is_active", true)
      .order("name");
    // Empty/erroring database → show the live clinic's real service list
    // instead of a broken booking form (display only; booking creation still
    // requires a real DB connection via the server actions).
    if (!error && data && data.length > 0) return data as Service[];
  } catch {
    // ignore — fall through to snapshot below
  }
  return FALLBACK_SERVICES;
}

export async function getAvailability(): Promise<AvailabilitySlot[]> {
  const { data } = await supabase
    .from("availability")
    .select("*")
    .eq("is_available", true)
    .order("day_of_week");
  return data ?? [];
}

/**
 * Extra / custom availability slots for TODAY onwards. These are one-time
 * slots for a specific date (e.g. a special Sunday clinic) and are merged
 * with the regular weekly schedule when listing bookable times.
 */
export async function getCustomAvailability(): Promise<CustomAvailabilitySlot[]> {
  const { data } = await supabase
    .from("custom_availability")
    .select("*")
    .eq("is_available", true)
    .gte("specific_date", todayInClinic())
    .order("specific_date")
    .order("start_time");
  return data ?? [];
}

export interface BookedSlotInterval {
  /** "HH:mm" start time. */
  slot: string;
  /** Duration in minutes of the service the booked appointment uses. */
  durationMinutes: number;
}

/**
 * Booked intervals for a date (start time + duration of each booked
 * appointment) so the UI can prevent duration-based overlaps — e.g. a
 * 40-minute Physiotherapy at 19:00 must also block a 19:15 booking.
 * Uses `booked_slots_with_duration` (joins services) rather than the
 * older time-only `booked_slots` RPC.
 */
export async function getBookedSlots(date: string): Promise<BookedSlotInterval[]> {
  const { data } = await supabase.rpc("booked_slots_with_duration", { p_date: date });
  const rows = (data ?? []) as Array<{ slot: string; duration_minutes: number | null }>;
  const intervals: BookedSlotInterval[] = [];
  for (const r of rows) {
    const slot = (r.slot ?? "").trim().slice(0, 5);
    if (!slot) continue;
    intervals.push({ slot, durationMinutes: Math.max(r.duration_minutes ?? 0, 0) });
  }
  return intervals;
}

export function generateTimeSlots(
  availability: AvailabilitySlot[],
  date: Date,
  bookedSlots: BookedSlotInterval[],
  durationMinutes: number | null,
  todayStr = "",
  nowTime = "00:00",
  customAvailability: CustomAvailabilitySlot[] = [],
): string[] {
  // Flexible services (e.g. Home Visit) have no fixed slots — the doctor
  // confirms the time after booking.
  if (durationMinutes == null || durationMinutes <= 0) return [];

  const dateStr = toClinicDate(date);
  const dayOfWeek = date.getDay();
  // Regular weekly windows for this weekday + any one-time custom windows for
  // this exact date (custom slots ADD to the schedule, they never replace it).
  const regularSlots = availability.filter((a) => a.day_of_week === dayOfWeek);
  const customSlots = customAvailability.filter(
    (c) => c.specific_date === dateStr && c.is_available,
  );
  const slots = [...regularSlots, ...customSlots];
  if (slots.length === 0) return [];

  const bookedStartTimes = new Set(bookedSlots.map((b) => b.slot));
  const bookedIntervals: TimeInterval[] = bookedSlots.flatMap((b) => {
    const match = /^(\d{2}):(\d{2})$/.exec(b.slot);
    if (!match) return [];
    return [
      {
        startMinutes: Number(match[1]) * 60 + Number(match[2]),
        durationMinutes: Math.max(b.durationMinutes, 0),
      },
    ];
  });

  const times: string[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const [startH, startM] = slot.start_time.split(":").map(Number);
    const [endH, endM] = slot.end_time.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const totalMinutes = endMinutes - startMinutes;
    // Slot grid steps by the service's own duration (duration_minutes is the
    // single source of truth), so a 15-minute service yields 15-minute slots,
    // a 40-minute service 40-minute slots, etc.
    const interval = durationMinutes;

    for (let m = 0; m + interval <= totalMinutes; m += interval) {
      const mins = startMinutes + m;
      const h = Math.floor(mins / 60);
      const min = mins % 60;
      const timeStr = `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
      const isTodayPast = dateStr === todayStr && timeStr <= nowTime;
      if (seen.has(timeStr) || bookedStartTimes.has(timeStr) || isTodayPast) continue;
      if (slotOverlapsAny(mins, durationMinutes, bookedIntervals)) continue;
      seen.add(timeStr);
      times.push(timeStr);
    }
  }
  times.sort((a, b) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });
  return times;
}

export function formatTimeDisplay(time: string | null | undefined): string {
  if (!time) {
    return "—";
  }

  const [h, m] = time.split(":").map(Number);

  if (Number.isNaN(h) || Number.isNaN(m)) {
    return "—";
  }

  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;

  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}
export async function createAppointment(
  name: string,
  phone: string,
  email: string,
  serviceId: string,
  date: string,
  time?: string,
  notes?: string,
): Promise<{
  error: string | null;
  id: string | null;
  appointmentNo: string | null;
  notifications: NotificationResult[];
  amount: number | null;
  paymentStatus: string | null;
  offerTitle: string | null;
}> {
  return createBooking({
    data: {
      name,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      serviceId,
      date,
      time,
      notes: notes?.trim() || undefined,
    },
  });
}

export interface AppointmentStatus {
  id: string;
  /** Short patient-facing appointment number (falls back to the row UUID for legacy rows). */
  appointmentNo: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled" | "completed" | "arrived" | "no_show";
  date: string;
  /** "HH:mm". null for flexible services (e.g. Home Visit — doctor confirms the time). */
  time: string | null;
  serviceName: string | null;
  createdAt: string;
  /**
   * Video consultation join state — present only for video-consultation
   * appointments. Never contains internal UUIDs.
   */
  video?: {
    /** Short patient-facing code (e.g. "VC-8F3K21"); null before the doctor starts the call. */
    vcNo: string | null;
    sessionStatus: "scheduled" | "active" | "completed" | null;
    durationMinutes: number | null;
  } | null;
}

export async function checkAppointment(
  appointmentId: string,
  phone: string,
  email: string,
): Promise<{ error: string | null; found: boolean; appointment: AppointmentStatus | null }> {
  return checkAppointmentStatus({
    data: { appointmentId, phone: phone.trim() || undefined, email: email.trim() || undefined },
  });
}

export interface RecoveredAppointment {
  /** Short patient-facing appointment number (falls back to the row UUID for legacy rows). */
  appointmentNo: string;
  patientName: string;
  status: AppointmentStatus["status"];
  date: string;
  /** "HH:mm". null for flexible services (e.g. Home Visit). */
  time: string | null;
  serviceName: string | null;
}

export async function recoverAppointments(
  name: string,
  phone: string,
  email: string,
): Promise<{ error: string | null; appointments: RecoveredAppointment[] }> {
  return recoverAppointment({
    data: { name, phone: phone.trim() || undefined, email: email.trim() || undefined },
  });
}
