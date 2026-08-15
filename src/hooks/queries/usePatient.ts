import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyAppointments,
  claimAppointment,
  cancelMyAppointment,
  rescheduleMyAppointment,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updateMyProfile,
  getMyDocuments,
  deleteMyDocument,
  shareMyDocument,
  getMyTestRecommendations,
  markTestRecommendationCompleted,
  getMyOrders,
  getMyOrderDetail,
  submitOrderRequest,
  type PatientAppointment,
  type PatientNotification,
  type PatientDocument,
  type PatientTestRecommendation,
  type PatientOrder,
} from "@/lib/patient-data";

// --- Appointments ---

export function useMyAppointments(enabled = true) {
  return useQuery<PatientAppointment[]>({
    queryKey: ["patient", "appointments"],
    queryFn: getMyAppointments,
    enabled,
  });
}

export function useClaimAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appointmentId,
      phone,
      email,
    }: {
      appointmentId: string;
      phone?: string;
      email?: string;
    }) => claimAppointment(appointmentId, phone, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "appointments"] }),
  });
}

export function useCancelMyAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelMyAppointment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", "appointments"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

export function useRescheduleMyAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, time }: { id: string; date: string; time: string | null }) =>
      rescheduleMyAppointment(id, date, time),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", "appointments"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

// --- Notifications ---

export function useMyNotifications(enabled = true) {
  return useQuery<PatientNotification[]>({
    queryKey: ["patient", "notifications"],
    queryFn: getMyNotifications,
    enabled,
    refetchInterval: 60000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "notifications"] }),
  });
}

// --- Profile ---

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMyProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "profile"] }),
  });
}

// --- Documents ---

export function useMyDocuments(enabled = true) {
  return useQuery<PatientDocument[]>({
    queryKey: ["patient", "documents"],
    queryFn: getMyDocuments,
    enabled,
  });
}

export function useDeleteMyDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMyDocument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "documents"] }),
  });
}

export function useShareMyDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shareMyDocument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "documents"] }),
  });
}

// --- Test recommendations (from the doctor) ---

export function useMyTestRecommendations(enabled = true) {
  return useQuery<PatientTestRecommendation[]>({
    queryKey: ["patient", "testRecommendations"],
    queryFn: getMyTestRecommendations,
    enabled,
    refetchInterval: 60000,
  });
}

export function useMarkTestRecommendationCompleted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markTestRecommendationCompleted(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "testRecommendations"] }),
  });
}

// --- Orders ---

export function useMyOrders(enabled = true) {
  return useQuery<PatientOrder[]>({
    queryKey: ["patient", "orders"],
    queryFn: getMyOrders,
    enabled,
  });
}

export function useMyOrderDetail(orderId: string | null) {
  return useQuery<{ error: string | null; order: PatientOrder | null }>({
    queryKey: ["patient", "order", orderId],
    queryFn: () => getMyOrderDetail(orderId!),
    enabled: !!orderId,
  });
}

export function useSubmitOrderRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { orderId: string; kind: "query" | "cancel" | "return"; message: string }) =>
      submitOrderRequest(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", "orders"] });
      qc.invalidateQueries({ queryKey: ["patient", "order"] });
    },
  });
}
