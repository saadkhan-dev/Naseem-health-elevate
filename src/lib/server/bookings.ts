import { supabase } from "@/lib/supabase";

export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
}

export interface AvailabilitySlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

export interface Appointment {
  id: string;
  patient_id: string;
  service_id: string;
  date: string;
  time: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "rejected" | "arrived" | "no_show";
  notes: string | null;
  created_at: string;
}

export async function getServices(): Promise<Service[]> {
  const { data } = await supabase.from("services").select("*").eq("is_active", true).order("name");
  return data ?? [];
}

export async function getAvailability(): Promise<AvailabilitySlot[]> {
  const { data } = await supabase
    .from("availability")
    .select("*")
    .eq("is_available", true)
    .order("day_of_week");
  return data ?? [];
}

export async function getBookedSlots(date: string) {
  const { data } = await supabase
    .from("appointments")
    .select("time")
    .eq("date", date)
    .not("status", "in", '("cancelled","rejected","no_show")');
  return new Set(data?.map((a) => a.time) ?? []);
}

export function generateTimeSlots(
  availability: AvailabilitySlot[],
  date: Date,
  bookedSlots: Set<string>,
  durationMinutes: number,
): string[] {
  const dayOfWeek = date.getDay();
  const slots = availability.filter((a) => a.day_of_week === dayOfWeek);
  if (slots.length === 0) return [];

  const times: string[] = [];
  for (const slot of slots) {
    const [startH, startM] = slot.start_time.split(":").map(Number);
    const [endH, endM] = slot.end_time.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const totalMinutes = endMinutes - startMinutes;
    const interval = Math.max(durationMinutes, 30);

    for (let m = 0; m + interval <= totalMinutes; m += interval) {
      const mins = startMinutes + m;
      const h = Math.floor(mins / 60);
      const min = mins % 60;
      const timeStr = `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
      if (!bookedSlots.has(timeStr)) {
        times.push(timeStr);
      }
    }
  }
  return times;
}

export function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export async function createAppointment(
  patientId: string,
  serviceId: string,
  date: string,
  time: string,
): Promise<{ error: string | null; id: string | null }> {
  const { data, error } = await supabase
    .from("appointments")
    .insert({ patient_id: patientId, service_id: serviceId, date, time, status: "pending" })
    .select("id")
    .single();

  if (error) return { error: error.message, id: null };
  return { error: null, id: data.id };
}
