import {
  patientGetMyAppointments,
  patientClaimAppointment,
  patientCancelAppointment,
  patientRescheduleAppointment,
  patientGetMyNotifications,
  patientMarkNotificationRead,
  patientMarkAllNotificationsRead,
  patientUpdateProfile,
  patientGetMyDocuments,
  patientDeleteDocument,
  patientShareDocument,
  patientGetMyOrders,
  patientGetOrderDetail,
  patientSubmitOrderRequest,
  type PatientAppointment,
} from "@/lib/actions.functions";

export type { PatientAppointment };

export interface PatientNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type PatientDocumentStatus = "available" | "sent_to_doctor" | "received";

export interface PatientDocument {
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
  status: PatientDocumentStatus;
}

export interface PatientOrderItem {
  product_id?: string | null;
  product_name: string;
  price: number;
  quantity: number;
}

export interface PatientOrderStatusHistory {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
}

export interface PatientOrderRequest {
  id: string;
  kind: "query" | "cancel" | "return";
  message: string;
  status: "new" | "in_progress" | "resolved" | "closed";
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface PatientOrder {
  id: string;
  order_no: string | null;
  status: "placed" | "processing" | "shipped" | "delivered" | "cancelled";
  name: string;
  phone: string;
  email: string | null;
  address: string;
  total: number;
  notes: string | null;
  created_at: string;
  order_items: PatientOrderItem[];
  status_history?: PatientOrderStatusHistory[];
  requests?: PatientOrderRequest[];
}

export async function getMyAppointments(): Promise<PatientAppointment[]> {
  const result = await patientGetMyAppointments({ data: undefined });
  return result.appointments ?? [];
}

export async function claimAppointment(
  appointmentId: string,
  phone?: string,
  email?: string,
): Promise<{ error: string | null }> {
  return patientClaimAppointment({
    data: { appointmentId, phone: phone?.trim() || undefined, email: email?.trim() || undefined },
  });
}

export async function cancelMyAppointment(id: string): Promise<{ error: string | null }> {
  return patientCancelAppointment({ data: { id } });
}

export async function rescheduleMyAppointment(
  id: string,
  date: string,
  time: string | null,
): Promise<{ error: string | null }> {
  return patientRescheduleAppointment({ data: { id, date, time } });
}

export async function getMyNotifications(): Promise<PatientNotification[]> {
  const result = await patientGetMyNotifications({ data: undefined });
  return result.notifications ?? [];
}

export async function markNotificationRead(id: string): Promise<{ error: string | null }> {
  return patientMarkNotificationRead({ data: { id } });
}

export async function markAllNotificationsRead(): Promise<{ error: string | null }> {
  return patientMarkAllNotificationsRead({ data: undefined });
}

export async function updateMyProfile(data: {
  full_name?: string;
  phone?: string;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
}): Promise<{ error: string | null }> {
  return patientUpdateProfile({ data });
}

export async function getMyDocuments(): Promise<PatientDocument[]> {
  const result = await patientGetMyDocuments({ data: undefined });
  return result.documents ?? [];
}

export async function deleteMyDocument(id: string): Promise<{ error: string | null }> {
  return patientDeleteDocument({ data: { id } });
}

export async function shareMyDocument(id: string): Promise<{ error: string | null }> {
  return patientShareDocument({ data: { id } });
}

export async function getMyOrders(): Promise<PatientOrder[]> {
  const result = await patientGetMyOrders({ data: undefined });
  return (result.orders ?? []) as PatientOrder[];
}

export async function getMyOrderDetail(
  id: string,
): Promise<{ error: string | null; order: PatientOrder | null }> {
  return patientGetOrderDetail({ data: { id } });
}

export async function submitOrderRequest(data: {
  orderId: string;
  kind: "query" | "cancel" | "return";
  message: string;
}): Promise<{ error: string | null }> {
  return patientSubmitOrderRequest({ data });
}
