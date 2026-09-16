import { supabase, staffSupabase } from "@/lib/supabase";
import { todayInClinic } from "@/lib/clinic";
import {
  adminUpdateAppointmentStatus,
  adminUpdateAvailability,
  adminCreateCustomAvailability,
  adminUpdateCustomAvailability,
  adminDeleteCustomAvailability,
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
  adminApplyRescheduleAppointment,
  adminGetVideoOffers,
  adminCreateVideoOffer,
  adminUpdateVideoOffer,
  adminDeleteVideoOffer,
  adminCreateRecurringAvailability,
  adminUpdateRecurringAvailability,
  adminDeleteRecurringAvailability,
  adminUpdateOrderDeliveryCharge,
  getPublicStoreSettings,
  adminUpdateStoreSettings,
  adminCreateDeliveryArea,
  adminUpdateDeliveryArea,
  adminDeleteDeliveryArea,
  adminGetDeliveryAreas,
  adminPlaceOrder,
} from "@/lib/actions.functions";
import type {
  Service,
  AvailabilitySlot,
  CustomAvailabilitySlot,
  RecurringAvailabilitySlot,
} from "./bookings";
import { DEFAULT_STORE_SETTINGS, normalizeStoreSettings, type StoreSettings } from "./delivery";
import type { PaymentMethod, PaymentStatus } from "./payment";

export interface PlaceOrderInput {
  items: Array<{ productId: string; quantity: number }>;
  name: string;
  phone: string;
  email?: string;
  address: string;
  notes?: string;
  deliveryAreaId?: string | null;
}

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
  /** Private storage path of the uploaded receipt screenshot (Option 2). */
  paymentReceiptUrl: string | null;
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

/** All extra / custom availability slots (one-time slots for a specific date). */
export async function getAllCustomAvailability(): Promise<CustomAvailabilitySlot[]> {
  const { data } = await staffSupabase
    .from("custom_availability")
    .select("*")
    .order("specific_date", { ascending: true })
    .order("start_time", { ascending: true });
  return data ?? [];
}

/** All recurring (weekly) extra availability slots. */
export async function getAllRecurringAvailability(): Promise<RecurringAvailabilitySlot[]> {
  const { data } = await staffSupabase
    .from("recurring_availability")
    .select("*")
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  return data ?? [];
}

/** Doctors/admins who can be assigned an extra availability slot. */
export async function getStaffMembers(): Promise<Array<{ id: string; full_name: string | null }>> {
  const { data } = await staffSupabase
    .from("profiles")
    .select("id, full_name, role")
    .or("role.eq.admin,role.eq.doctor")
    .order("full_name");
  return (data ?? []) as Array<{ id: string; full_name: string | null }>;
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
  /** Private storage path of the uploaded receipt screenshot (Option 2). */
  payment_receipt_url: string | null;
  offer_title: string | null;
  /** Latest video session state (video consultations only). */
  video_session_status: "scheduled" | "active" | "completed" | null;
  /** Pending reschedule request state (two-sided confirmation flow). */
  reschedule_status: "none" | "pending";
  reschedule_requested_by: "patient" | "staff" | null;
  reschedule_date: string | null;
  reschedule_time: string | null;
  reschedule_requested_at: string | null;
  /** When the last accepted reschedule actually moved the appointment. */
  last_rescheduled_at: string | null;
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
  payment_receipt_url?: string | null;
  payment_amount?: number | null;
  duration_minutes?: number | null;
  video_offers?: { title?: string | null } | null;
  video_sessions?: { status?: string | null; created_at?: string | null }[] | null;
  reschedule_status?: string | null;
  reschedule_requested_by?: string | null;
  reschedule_date?: string | null;
  reschedule_time?: string | null;
  reschedule_requested_at?: string | null;
  last_rescheduled_at?: string | null;
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
    payment_receipt_url: a.payment_receipt_url ?? null,
    offer_title: a.video_offers?.title ?? null,
    duration_minutes: a.duration_minutes ?? null,
    video_session_status: latestVideoSessionStatus(a),
    reschedule_status:
      (a.reschedule_status as AppointmentWithDetails["reschedule_status"] | null) ?? "none",
    reschedule_requested_by:
      (a.reschedule_requested_by as AppointmentWithDetails["reschedule_requested_by"] | null) ??
      null,
    reschedule_date: a.reschedule_date ?? null,
    reschedule_time: (a.reschedule_time as string | null)?.slice(0, 5) ?? null,
    reschedule_requested_at: a.reschedule_requested_at ?? null,
    last_rescheduled_at: a.last_rescheduled_at ?? null,
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

// --- Recent patients (dashboard) ---

export interface RecentPatient {
  id: string;
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  created_at: string;
}

/** Most recently registered patient accounts (patients only, not staff). */
export async function getRecentPatients(limit = 12): Promise<RecentPatient[]> {
  const { data, error } = await staffSupabase
    .from("profiles")
    .select("id, full_name, phone, gender, created_at")
    .or("role.eq.patient,role.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin] getRecentPatients failed:", error.message);
    return [];
  }
  return (data ?? []) as RecentPatient[];
}

/** Single patient profile — used to pin the deep-linked patient on top. */
export async function getPatientById(id: string): Promise<RecentPatient | null> {
  const { data, error } = await staffSupabase
    .from("profiles")
    .select("id, full_name, phone, gender, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as RecentPatient | null) ?? null;
}

// --- Availability ---

export async function updateAvailability(
  id: string,
  data: { start_time?: string; end_time?: string; is_available?: boolean },
) {
  return adminUpdateAvailability({ data: { id, data } });
}

export type CustomAvailabilityInput = {
  doctor_id?: string | null;
  specific_date: string;
  start_time: string;
  end_time: string;
  is_available?: boolean;
  notes?: string | null;
};

export async function createCustomAvailability(data: CustomAvailabilityInput) {
  return adminCreateCustomAvailability({ data });
}

export async function updateCustomAvailability(id: string, data: Partial<CustomAvailabilityInput>) {
  return adminUpdateCustomAvailability({ data: { id, data } });
}

export async function deleteCustomAvailability(id: string) {
  return adminDeleteCustomAvailability({ data: { id } });
}

export type RecurringAvailabilityInput = {
  doctor_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available?: boolean;
  notes?: string | null;
};

export async function createRecurringAvailability(data: RecurringAvailabilityInput) {
  return adminCreateRecurringAvailability({ data });
}

export async function updateRecurringAvailability(
  id: string,
  data: Partial<RecurringAvailabilityInput>,
) {
  return adminUpdateRecurringAvailability({ data: { id, data } });
}

export async function deleteRecurringAvailability(id: string) {
  return adminDeleteRecurringAvailability({ data: { id } });
}

// --- Store settings (delivery charge configuration) ---

/**
 * Store delivery configuration. Public read (RLS allows it) — the storefront
 * needs the delivery charge before an order is placed. Falls back to
 * "delivery charges off" when the row/table is not available yet.
 */
export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    const result = await getPublicStoreSettings({ data: undefined });
    if (result.settings) return normalizeStoreSettings(result.settings);
  } catch {
    // ignore — fall through to the default (no delivery charge) below
  }
  return DEFAULT_STORE_SETTINGS;
}

/** Admin — save the store delivery configuration. */
export async function updateStoreSettings(data: {
  delivery_charge: number;
  free_delivery_threshold: number | null;
  delivery_is_active: boolean;
  delivery_note?: string | null;
}) {
  return adminUpdateStoreSettings({ data });
}

/** Admin — override the delivery charge on a single order. */
export async function updateOrderDeliveryCharge(id: string, deliveryCharge: number) {
  return adminUpdateOrderDeliveryCharge({ data: { id, deliveryCharge } });
}

// --- Delivery areas ---

export interface DeliveryArea {
  id: string;
  name: string;
  delivery_charge: number;
  free_delivery_threshold: number | null;
  is_active: boolean;
  delivery_note: string | null;
  created_at: string;
  updated_at: string;
}

export async function getActiveDeliveryAreas(): Promise<DeliveryArea[]> {
  try {
    const { data, error } = await supabase
      .from("delivery_areas")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) return [];
    return (data ?? []) as DeliveryArea[];
  } catch {
    return [];
  }
}

export async function getAllDeliveryAreas(): Promise<DeliveryArea[]> {
  try {
    const res = await adminGetDeliveryAreas();
    return (res.areas ?? []) as DeliveryArea[];
  } catch {
    return [];
  }
}

export async function createDeliveryArea(data: {
  name: string;
  delivery_charge: number;
  free_delivery_threshold: number | null;
  delivery_note: string | null;
}) {
  return adminCreateDeliveryArea({ data });
}

export async function updateDeliveryArea(
  id: string,
  data: {
    name?: string;
    delivery_charge?: number;
    free_delivery_threshold?: number | null;
    is_active?: boolean;
    delivery_note?: string | null;
  },
) {
  return adminUpdateDeliveryArea({ data: { id, data } });
}

export async function deleteDeliveryArea(id: string) {
  return adminDeleteDeliveryArea({ data: { id } });
}

// --- Orders ---

export async function placeOrder(data: PlaceOrderInput): Promise<{
  error: string | null;
  orderId: string | null;
  orderNo: string | null;
  total: number | null;
  subtotal: number | null;
  deliveryCharge: number | null;
  deliveryAreaName: string | null;
}> {
  return adminPlaceOrder({ data });
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
  offer_is_active: boolean;
  offer_title: string | null;
  offer_percent: number | null;
  offer_start_date: string | null;
  offer_end_date: string | null;
  pack_size: string | null;
  product_condition: string | null;
  /** Optional estimated delivery time shown to patients (e.g. "3–5 days"). */
  delivery_estimate: string | null;
  created_at: string;
}

/** One entry in the optional product gallery. position 0 = primary image. */
export interface ProductImage {
  id: string;
  product_id: string;
  position: number;
  url: string;
  created_at: string;
}

export async function getProductImages(productId: string): Promise<ProductImage[]> {
  const { data } = await supabase
    .from("product_images")
    .select("id, product_id, position, url, created_at")
    .eq("product_id", productId)
    .order("position", { ascending: true });
  return (data ?? []) as ProductImage[];
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
  offer_is_active?: boolean;
  offer_title?: string | null;
  offer_percent?: number | null;
  offer_start_date?: string | null;
  offer_end_date?: string | null;
  pack_size?: string | null;
  product_condition?: string | null;
  /** Optional estimated delivery time (e.g. "3–5 days"). */
  delivery_estimate?: string | null;
  /** Ordered gallery URLs. position 0 becomes image_url + the primary image. */
  images?: string[];
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
    offer_is_active?: boolean;
    offer_title?: string | null;
    offer_percent?: number | null;
    offer_start_date?: string | null;
    offer_end_date?: string | null;
    pack_size?: string | null;
    product_condition?: string | null;
    /** Optional estimated delivery time (e.g. "3–5 days"). */
    delivery_estimate?: string | null;
    /** Ordered gallery URLs. position 0 becomes image_url + the primary image. */
    images?: string[];
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

/** Admin approves or rejects a pending reschedule request raised by the patient. */
export async function applyReschedule(id: string, action: "approve" | "reject") {
  return adminApplyRescheduleAppointment({ data: { id, action } });
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
