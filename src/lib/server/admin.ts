import { supabase } from "@/lib/supabase";
import type { Service, AvailabilitySlot } from "./bookings";

interface AppointmentRow {
  id: string;
  patient_id: string;
  service_id: string;
  date: string;
  time: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  profiles?: { full_name: string | null; phone: string | null } | null;
  services?: { name: string | null } | null;
}

export interface AppointmentWithDetails {
  id: string;
  patient_id: string;
  service_id: string;
  date: string;
  time: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  service_name: string | null;
}

// --- Appointments ---

export async function getAllAppointments(): Promise<AppointmentWithDetails[]> {
  const { data } = await supabase
    .from("appointments")
    .select(
      `
      *,
      profiles:patient_id (full_name, phone),
      services:service_id (name)
    `,
    )
    .order("date", { ascending: false })
    .order("time", { ascending: false });

  return (data ?? []).map((a: AppointmentRow) => ({
    id: a.id,
    patient_id: a.patient_id,
    service_id: a.service_id,
    date: a.date,
    time: a.time,
    status: a.status,
    notes: a.notes,
    created_at: a.created_at,
    patient_name: a.profiles?.full_name ?? null,
    patient_phone: a.profiles?.phone ?? null,
    patient_email: null,
    service_name: a.services?.name ?? null,
  }));
}

export async function updateAppointmentStatus(
  id: string,
  status: "pending" | "confirmed" | "completed" | "cancelled",
) {
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
  return { error: error?.message ?? null };
}

// --- Availability ---

export async function updateAvailability(
  id: string,
  data: { start_time?: string; end_time?: string; is_available?: boolean },
) {
  const { error } = await supabase.from("availability").update(data).eq("id", id);
  return { error: error?.message ?? null };
}

// --- Services ---

export async function createService(data: {
  name: string;
  description: string;
  duration_minutes: number | null;
  price: number;
}) {
  const { error } = await supabase.from("services").insert(data);
  return { error: error?.message ?? null };
}

export async function updateService(
  id: string,
  data: {
    name?: string;
    description?: string;
    duration_minutes?: number | null;
    price?: number;
    is_active?: boolean;
  },
) {
  const { error } = await supabase.from("services").update(data).eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteService(id: string) {
  const { error } = await supabase.from("services").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// --- Products ---

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  in_stock: boolean;
  created_at: string;
}

export async function getProducts(): Promise<Product[]> {
  const { data } = await supabase.from("products").select("*").order("name");
  return data ?? [];
}

export async function createProduct(data: {
  name: string;
  description: string;
  price: number;
  image_url?: string;
}) {
  const { error } = await supabase.from("products").insert(data);
  return { error: error?.message ?? null };
}

export async function updateProduct(
  id: string,
  data: {
    name?: string;
    description?: string;
    price?: number;
    image_url?: string;
    in_stock?: boolean;
  },
) {
  const { error } = await supabase.from("products").update(data).eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// --- Dashboard Stats ---

export interface DashboardStats {
  totalAppointments: number;
  pendingAppointments: number;
  todayAppointments: number;
  totalPatients: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().split("T")[0];

  const [total, pending, todayAppts, patients] = await Promise.all([
    supabase.from("appointments").select("id", { count: "exact", head: true }),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("date", today),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalAppointments: total.count ?? 0,
    pendingAppointments: pending.count ?? 0,
    todayAppointments: todayAppts.count ?? 0,
    totalPatients: patients.count ?? 0,
  };
}
