import {
  adminGetFaqs,
  adminCreateFaq,
  adminUpdateFaq,
  adminDeleteFaq,
  adminGetSupportMessages,
  adminUpdateSupportMessage,
  adminGetDoctorProfile,
  adminUpdateDoctorProfile,
  adminGetDocuments,
  adminMarkDocumentReceived,
  adminCreateTestRecommendation,
  adminGetTestRecommendations,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminGetOrderRequests,
  adminUpdateOrderRequest,
  adminGetReminders,
  adminCreateReminder,
  adminCancelReminder,
  adminSendDueReminders,
  adminGetAnalytics,
} from "@/lib/actions.functions";
import type { Faq, DoctorProfile } from "@/lib/site-extra";
import type { AnalyticsStats } from "@/lib/server/analytics";

export type { Faq, DoctorProfile, AnalyticsStats };

export interface SupportMessage {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  message: string;
  status: "new" | "in_progress" | "resolved" | "closed";
  admin_notes: string;
  created_at: string;
  resolved_at: string | null;
}

export interface AdminDocument {
  id: string;
  patient_id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_at: string;
  shared_with_doctor: boolean;
  shared_at: string | null;
  status: "available" | "sent_to_doctor" | "received";
  profiles?: { full_name: string | null; phone: string | null } | null;
}

export interface AdminTestRecommendation {
  id: string;
  patient_id: string;
  test_name: string;
  notes: string;
  status: "pending" | "completed";
  created_at: string;
  profiles?: { full_name: string | null; phone: string | null } | null;
}

export interface AdminOrder {
  id: string;
  order_no: string | null;
  patient_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  total: number;
  status: "placed" | "processing" | "shipped" | "delivered" | "cancelled";
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  payment_payer_name: string | null;
  payment_amount: number | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  payment_receipt_url: string | null;
  notes: string | null;
  created_at: string;
  order_items: Array<{
    product_id?: string | null;
    product_name: string;
    price: number;
    quantity: number;
  }>;
}

export interface AdminOrderRequest {
  id: string;
  order_id: string;
  patient_id: string | null;
  kind: "query" | "cancel" | "return" | "complaint" | "replacement";
  message: string;
  status: "new" | "in_progress" | "resolved" | "closed";
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  order?: {
    order_no: string | null;
    status: AdminOrder["status"];
    total: number;
    created_at: string;
  } | null;
  patient?: { full_name: string | null; phone: string | null } | null;
}

export interface AdminReminder {
  id: string;
  appointment_id: string;
  channel: "email" | "sms" | "whatsapp";
  remind_at: string;
  status: "scheduled" | "sent" | "failed" | "cancelled";
  sent_at: string | null;
  error: string;
  created_at: string;
  appointments?: {
    appointment_no: string | null;
    patient_name: string | null;
    date: string;
    time: string | null;
    services?: { name: string | null } | null;
  } | null;
}

export async function getFaqsAdmin(): Promise<Faq[]> {
  const result = await adminGetFaqs({ data: undefined });
  return (result.faqs ?? []) as Faq[];
}

export async function createFaqAdmin(data: {
  category?: string;
  question: string;
  answer: string;
  sort_order?: number;
  is_active?: boolean;
}): Promise<{ error: string | null }> {
  return adminCreateFaq({ data });
}

export async function updateFaqAdmin(
  id: string,
  data: Partial<{
    category: string;
    question: string;
    answer: string;
    sort_order: number;
    is_active: boolean;
  }>,
): Promise<{ error: string | null }> {
  return adminUpdateFaq({ data: { id, data } });
}

export async function deleteFaqAdmin(id: string): Promise<{ error: string | null }> {
  return adminDeleteFaq({ data: { id } });
}

export async function getSupportMessagesAdmin(): Promise<SupportMessage[]> {
  const result = await adminGetSupportMessages({ data: undefined });
  return (result.messages ?? []) as SupportMessage[];
}

export async function updateSupportMessageAdmin(
  id: string,
  data: { status?: "new" | "in_progress" | "resolved" | "closed"; admin_notes?: string },
): Promise<{ error: string | null }> {
  return adminUpdateSupportMessage({ data: { id, ...data } });
}

export async function getDoctorProfileAdmin(): Promise<DoctorProfile | null> {
  const result = await adminGetDoctorProfile({ data: undefined });
  return (result.profile ?? null) as DoctorProfile | null;
}

export async function updateDoctorProfileAdmin(data: Partial<DoctorProfile>): Promise<{
  error: string | null;
}> {
  return adminUpdateDoctorProfile({ data });
}

export async function getDocumentsAdmin(): Promise<AdminDocument[]> {
  const result = await adminGetDocuments({ data: undefined });
  return (result.documents ?? []) as AdminDocument[];
}

export async function markDocumentReceivedAdmin(id: string): Promise<{ error: string | null }> {
  return adminMarkDocumentReceived({ data: { id } });
}

export async function createTestRecommendationAdmin(data: {
  patientId: string;
  testName: string;
  notes?: string;
}): Promise<{ error: string | null }> {
  return adminCreateTestRecommendation({ data });
}

export async function getTestRecommendationsAdmin(): Promise<AdminTestRecommendation[]> {
  const result = await adminGetTestRecommendations({ data: undefined });
  return (result.recommendations ?? []) as AdminTestRecommendation[];
}

export async function getOrdersAdmin(): Promise<AdminOrder[]> {
  const result = await adminGetOrders({ data: undefined });
  return (result.orders ?? []) as AdminOrder[];
}

export async function updateOrderStatusAdmin(
  id: string,
  status: AdminOrder["status"],
  note?: string,
): Promise<{ error: string | null }> {
  return adminUpdateOrderStatus({ data: { id, status, note } });
}

export async function getOrderRequestsAdmin(): Promise<AdminOrderRequest[]> {
  const result = await adminGetOrderRequests({ data: undefined });
  return (result.requests ?? []) as AdminOrderRequest[];
}

export async function updateOrderRequestAdmin(
  id: string,
  data: {
    status: AdminOrderRequest["status"];
    adminNotes?: string;
  },
): Promise<{ error: string | null }> {
  return adminUpdateOrderRequest({ data: { id, ...data } });
}

export async function getRemindersAdmin(): Promise<AdminReminder[]> {
  const result = await adminGetReminders({ data: undefined });
  return (result.reminders ?? []) as AdminReminder[];
}

export async function createReminderAdmin(data: {
  appointmentId: string;
  channel: "email" | "sms" | "whatsapp";
  remindOn: string;
  remindAt: string;
}): Promise<{ error: string | null }> {
  return adminCreateReminder({ data });
}

export async function cancelReminderAdmin(id: string): Promise<{ error: string | null }> {
  return adminCancelReminder({ data: { id } });
}

export async function sendDueRemindersAdmin(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  return adminSendDueReminders({ data: undefined });
}

export async function getAnalyticsAdmin(): Promise<AnalyticsStats> {
  return adminGetAnalytics({ data: undefined });
}
