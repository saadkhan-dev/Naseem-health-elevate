import { supabase, staffSupabase } from "@/lib/supabase";
import { todayInClinic } from "@/lib/clinic";
import {
  adminUpdateAppointmentStatus,
  adminUpdateAvailability,
  adminCreateService,
  adminUpdateService,
  adminDeleteService,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminSetVideoPaymentStatus,
  adminCreatePaymentMethod,
  adminUpdatePaymentMethod,
  adminDeletePaymentMethod,
  adminGetPaymentMethods,
  adminSetVideoPricing,
  adminGetVideoPaymentStatus,
  adminRescheduleAppointment,
  adminGetVideoOffers,
  adminCreateVideoOffer,
  adminUpdateVideoOffer,
  adminDeleteVideoOffer,
} from "@/lib/actions.functions";
import type { Service, AvailabilitySlot } from "./bookings";
import type { PaymentMethod, PaymentStatus } from "./payment";

export type VideoOfferType = "waive" | "percent" | "fixed";
export type VideoOfferEligibility = "all" | "new_patients";

export interface VideoOffer {
  id: string;
  title: string;
  description: string | null;
  offer_type: VideoOfferType;
  discount_percent: number | null;
  discount_amount: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  eligibility: VideoOfferEligibility;
  terms: string | null;
  created_at: string;
}

export interface VideoPaymentStatusView {
  appointmentStatus: string;
  paymentStatus: PaymentStatus | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentPayerName: string | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  paymentAmount: number | null;
  offerTitle: string | null;
}

export async function getAllServices(): Promise<Service[]> {
  const { data } = await staffSupabase.from("services").select("*").order("name");
  return data ?? [];
}

export async function getAllAvailability(): Promise<AvailabilitySlot[]> {
  const { data } = await staffSupabase.from("availability").select("*").order("day_of_week");
  return data ?? [];
}

export interface AppointmentWithDetails {
  id: string;
  appointment_no: string | null;
  patient_id: string;
  service_id: string;
  date: string;
  time: string | null;
  status: "pending" | "confirmed" | "rejected" | "completed" | "cancelled" | "arrived" | "no_show";
  notes: string | null;
  created_at: string;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  service_name: string | null;
  is_video: boolean;
  /** Service duration at booking time (NULL = flexible, e.g. Home Visit). */
  duration_minutes: number | null;
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  payment_payer_name: string | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  payment_amount: number | null;
  offer_title: string | null;
  /** Latest Jitsi video session state (video consultations only). */
  video_session_status: "scheduled" | "active" | "completed" | null;
}

// --- Appointments ---

interface AppointmentRow {
  id: string;
  appointment_no?: string | null;
  patient_id: string | null;
  service_id: string;
  date: string;
  time: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  patient_name?: string | null;
  patient_phone?: string | null;
  patient_email?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_payer_name?: string | null;
  payment_submitted_at?: string | null;
  payment_verified_at?: string | null;
  payment_amount?: number | null;
  duration_minutes?: number | null;
  video_offers?: { title?: string | null } | null;
  video_sessions?: { status?: string | null; created_at?: string | null }[] | null;
  profiles?: { full_name?: string | null; phone?: string | null } | null;
  services?: { name?: string | null } | null;
}

function latestVideoSessionStatus(
  a: AppointmentRow,
): AppointmentWithDetails["video_session_status"] {
  const sessions = a.video_sessions ?? [];
  if (sessions.length === 0) return null;
  const latest = [...sessions].sort((x, y) =>
    (y.created_at ?? "").localeCompare(x.created_at ?? ""),
  )[0];
  return (latest.status as AppointmentWithDetails["video_session_status"]) ?? null;
}

function mapAppointment(a: AppointmentRow): AppointmentWithDetails {
  const serviceName = a.services?.name ?? null;
  return {
    id: a.id,
    appointment_no: a.appointment_no ?? null,
    patient_id: a.patient_id ?? "",
    service_id: a.service_id,
    date: a.date,
    time: a.time,
    status: a.status as AppointmentWithDetails["status"],
    notes: a.notes,
    created_at: a.created_at,
    patient_name: a.patient_name ?? a.profiles?.full_name ?? null,
    patient_phone: a.patient_phone ?? a.profiles?.phone ?? null,
    patient_email: a.patient_email ?? null,
    service_name: serviceName,
    is_video: serviceName ? serviceName.toLowerCase().includes("video consultation") : false,
    payment_status: a.payment_status ?? "payment_pending",
    payment_method: a.payment_method ?? null,
    payment_reference: a.payment_reference ?? null,
    payment_payer_name: a.payment_payer_name ?? null,
    payment_submitted_at: a.payment_submitted_at ?? null,
    payment_verified_at: a.payment_verified_at ?? null,
    payment_amount: a.payment_amount ?? null,
    offer_title: a.video_offers?.title ?? null,
    duration_minutes: a.duration_minutes ?? null,
    video_session_status: latestVideoSessionStatus(a),
  };
}

function compareAppointments(a: AppointmentWithDetails, b: AppointmentWithDetails): number {
  const today = todayInClinic();
  const aUpcoming = a.date >= today;
  const bUpcoming = b.date >= today;
  if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1; // upcoming first
  if (a.date !== b.date) return a.date < b.date ? -1 : 1; // chronological
  if ((a.time ?? "") !== (b.time ?? "")) return (a.time ?? "") < (b.time ?? "") ? -1 : 1;
  // same date+time → newest request first (desc created_at)
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

export async function getAllAppointments(): Promise<AppointmentWithDetails[]> {
  const { data } = await staffSupabase
    .from("appointments")
    .select(
      `
      *,
      profiles:patient_id (full_name, phone),
      services:service_id (name),
      video_offers:offer_id (title),
      video_sessions:video_sessions (status, created_at)
    `,
    )
    .order("date", { ascending: false })
    .order("time", { ascending: false });

  const rows = (data ?? []).map(mapAppointment);

  // Sort: upcoming (date >= today) first in chronological order,
  // then past dates in reverse chronological order.
  // Within same date+time, newest request (created_at) comes first.
  const today = todayInClinic();
  const upcoming = rows.filter((r) => r.date >= today);
  const past = rows.filter((r) => r.date < today);

  const sortByDateThenTimeThenCreated = (a: AppointmentWithDetails, b: AppointmentWithDetails) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if ((a.time ?? "") !== (b.time ?? "")) return (a.time ?? "") < (b.time ?? "") ? -1 : 1;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  };

  return [
    ...upcoming.sort(sortByDateThenTimeThenCreated),
    ...past.sort(sortByDateThenTimeThenCreated).reverse(),
  ];
}

export async function getAppointmentById(id: string): Promise<AppointmentWithDetails | null> {
  const { data } = await staffSupabase
    .from("appointments")
    .select(
      `
      *,
      profiles:patient_id (full_name, phone),
      services:service_id (name),
      video_offers:offer_id (title),
      video_sessions:video_sessions (status, created_at)
    `,
    )
    .eq("id", id)
    .single();

  return data ? mapAppointment(data) : null;
}

export async function updateAppointmentStatus(
  id: string,
  status: "pending" | "confirmed" | "rejected" | "completed" | "cancelled" | "arrived" | "no_show",
) {
  return adminUpdateAppointmentStatus({ data: { id, status } });
}

// --- Availability ---

export async function updateAvailability(
  id: string,
  data: { start_time?: string; end_time?: string; is_available?: boolean },
) {
  return adminUpdateAvailability({ data: { id, data } });
}

// --- Services ---

export async function createService(data: {
  name: string;
  description: string;
  duration_minutes: number | null;
  price: number;
  is_active?: boolean;
}) {
  return adminCreateService({ data });
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
  return adminUpdateService({ data: { id, data } });
}

export async function deleteService(id: string) {
  return adminDeleteService({ data: { id } });
}

// --- Products ---

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discount_price: number | null;
  image_url: string | null;
  category: string | null;
  in_stock: boolean;
  stock_quantity: number | null;
  rating_avg: number | null;
  rating_count: number;
  created_at: string;
}

export async function getProducts(): Promise<Product[]> {
  const { data } = await staffSupabase.from("products").select("*").order("name");
  return (data ?? []) as Product[];
}

export async function getPublishedProducts(): Promise<Product[]> {
  const { data } = await staffSupabase
    .from("products")
    .select("*")
    .eq("in_stock", true)
    .order("name");
  return (data ?? []) as Product[];
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data } = await staffSupabase.from("products").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as Product | null;
}

export async function getPublishedProductReviews(
  productId: string,
): Promise<
  Array<{ id: string; name: string; rating: number; comment: string; created_at: string }>
> {
  const { data } = await supabase
    .from("product_reviews")
    .select("id, name, rating, comment, created_at")
    .eq("product_id", productId)
    .eq("is_active", true)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  return (data ?? []) as Array<{
    id: string;
    name: string;
    rating: number;
    comment: string;
    created_at: string;
  }>;
}

export async function createProduct(data: {
  name: string;
  description: string;
  price: number;
  image_url?: string;
  in_stock?: boolean;
  category?: string;
  stock_quantity?: number | null;
  discount_price?: number | null;
}) {
  return adminCreateProduct({ data });
}

export async function updateProduct(
  id: string,
  data: {
    name?: string;
    description?: string;
    price?: number;
    image_url?: string;
    in_stock?: boolean;
    category?: string;
    stock_quantity?: number | null;
    discount_price?: number | null;
  },
) {
  return adminUpdateProduct({ data: { id, data } });
}

export async function deleteProduct(id: string) {
  return adminDeleteProduct({ data: { id } });
}

// --- Video Consultation payments ---

export async function setVideoPaymentStatus(
  appointmentId: string,
  status: "payment_verified" | "payment_failed" | "refunded" | "waived",
): Promise<{ error: string | null }> {
  return adminSetVideoPaymentStatus({ data: { appointmentId, status } });
}

export async function getVideoPaymentStatus(
  appointmentId: string,
): Promise<{ status: VideoPaymentStatusView | null }> {
  return adminGetVideoPaymentStatus({ data: { appointmentId } });
}

// --- Video Consultation pricing ---

export async function setVideoPricing(price: number): Promise<{ error: string | null }> {
  return adminSetVideoPricing({ data: { price } });
}

// --- Reschedule ---

export async function rescheduleAppointment(id: string, date: string, time: string | null) {
  return adminRescheduleAppointment({ data: { id, date, time } });
}

// --- Video Consultation offers ---

export interface VideoOfferInput {
  title: string;
  description?: string;
  offer_type: VideoOfferType;
  discount_percent?: number | null;
  discount_amount?: number | null;
  start_date: string;
  end_date?: string | null;
  is_active?: boolean;
  eligibility?: VideoOfferEligibility;
  terms?: string | null;
}

export async function getVideoOffers(): Promise<VideoOffer[]> {
  const result = await adminGetVideoOffers({ data: undefined });
  return (result.offers ?? []) as VideoOffer[];
}

export async function createVideoOffer(data: VideoOfferInput): Promise<{ error: string | null }> {
  return adminCreateVideoOffer({ data });
}

export async function updateVideoOffer(
  id: string,
  data: Partial<VideoOfferInput>,
): Promise<{ error: string | null }> {
  return adminUpdateVideoOffer({ data: { id, data } });
}

export async function deleteVideoOffer(id: string): Promise<{ error: string | null }> {
  return adminDeleteVideoOffer({ data: { id } });
}

// --- Payment methods (prepaid Video Consultation) ---

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const result = await adminGetPaymentMethods({ data: undefined });
  return (result.methods ?? []) as PaymentMethod[];
}

export async function createPaymentMethod(data: {
  name: string;
  description?: string;
  instructions?: string;
  account_holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  mobile_number?: string | null;
  is_active?: boolean;
  sort_order?: number;
}) {
  return adminCreatePaymentMethod({ data });
}

export async function updatePaymentMethod(
  id: string,
  data: {
    name?: string;
    description?: string;
    instructions?: string;
    account_holder_name?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    iban?: string | null;
    mobile_number?: string | null;
    is_active?: boolean;
    sort_order?: number;
  },
) {
  return adminUpdatePaymentMethod({ data: { id, data } });
}

export async function deletePaymentMethod(id: string) {
  return adminDeletePaymentMethod({ data: { id } });
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
    staffSupabase.from("appointments").select("id", { count: "exact", head: true }),
    staffSupabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    staffSupabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("date", today),
    staffSupabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalAppointments: total.count ?? 0,
    pendingAppointments: pending.count ?? 0,
    todayAppointments: todayAppts.count ?? 0,
    totalPatients: patients.count ?? 0,
  };
}
