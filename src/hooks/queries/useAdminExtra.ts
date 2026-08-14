import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFaqsAdmin,
  createFaqAdmin,
  updateFaqAdmin,
  deleteFaqAdmin,
  getSupportMessagesAdmin,
  updateSupportMessageAdmin,
  getDoctorProfileAdmin,
  updateDoctorProfileAdmin,
  getDocumentsAdmin,
  markDocumentReceivedAdmin,
  getOrdersAdmin,
  updateOrderStatusAdmin,
  getOrderRequestsAdmin,
  updateOrderRequestAdmin,
  getRemindersAdmin,
  createReminderAdmin,
  cancelReminderAdmin,
  sendDueRemindersAdmin,
  getAnalyticsAdmin,
  type Faq,
  type DoctorProfile,
  type SupportMessage,
  type AdminDocument,
  type AdminOrder,
  type AdminOrderRequest,
  type AdminReminder,
  type AnalyticsStats,
} from "@/lib/admin-extra";

// --- FAQs ---

export function useAdminFaqs() {
  return useQuery<Faq[]>({
    queryKey: ["admin", "faqs"],
    queryFn: getFaqsAdmin,
  });
}

export function useCreateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createFaqAdmin,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
      qc.invalidateQueries({ queryKey: ["faqs", "public"] });
    },
  });
}

export function useUpdateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateFaqAdmin>[1] }) =>
      updateFaqAdmin(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
      qc.invalidateQueries({ queryKey: ["faqs", "public"] });
    },
  });
}

export function useDeleteFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFaqAdmin(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
      qc.invalidateQueries({ queryKey: ["faqs", "public"] });
    },
  });
}

// --- Support inbox ---

export function useAdminSupportMessages() {
  return useQuery<SupportMessage[]>({
    queryKey: ["support", "admin"],
    queryFn: getSupportMessagesAdmin,
    refetchInterval: 30000,
  });
}

export function useUpdateSupportMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { status?: "new" | "in_progress" | "resolved" | "closed"; admin_notes?: string };
    }) => updateSupportMessageAdmin(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support", "admin"] }),
  });
}

// --- Doctor profile ---

export function useAdminDoctorProfile() {
  return useQuery<DoctorProfile | null>({
    queryKey: ["doctor-profile", "admin"],
    queryFn: getDoctorProfileAdmin,
  });
}

export function useUpdateDoctorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateDoctorProfileAdmin,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-profile", "admin"] });
      qc.invalidateQueries({ queryKey: ["doctor-profile", "public"] });
    },
  });
}

// --- Documents ---

export function useAdminDocuments() {
  return useQuery<AdminDocument[]>({
    queryKey: ["admin", "documents"],
    queryFn: getDocumentsAdmin,
  });
}

export function useMarkDocumentReceived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markDocumentReceivedAdmin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "documents"] }),
  });
}

// --- Orders ---

export function useAdminOrders() {
  return useQuery<AdminOrder[]>({
    queryKey: ["admin", "orders"],
    queryFn: getOrdersAdmin,
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminOrder["status"] }) =>
      updateOrderStatusAdmin(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });
}

// --- Order requests (patient queries / cancels / returns) ---

export function useAdminOrderRequests() {
  return useQuery<AdminOrderRequest[]>({
    queryKey: ["admin", "orderRequests"],
    queryFn: getOrderRequestsAdmin,
  });
}

export function useUpdateOrderRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      adminNotes,
    }: {
      id: string;
      status: AdminOrderRequest["status"];
      adminNotes?: string;
    }) => updateOrderRequestAdmin(id, { status, adminNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orderRequests"] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });
}

// --- Reminders ---

export function useAdminReminders() {
  return useQuery<AdminReminder[]>({
    queryKey: ["admin", "reminders"],
    queryFn: getRemindersAdmin,
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createReminderAdmin,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "reminders"] }),
  });
}

export function useCancelReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelReminderAdmin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "reminders"] }),
  });
}

export function useSendDueReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => sendDueRemindersAdmin(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "reminders"] }),
  });
}

// --- Analytics ---

export function useAnalytics() {
  return useQuery<AnalyticsStats>({
    queryKey: ["admin", "analytics"],
    queryFn: getAnalyticsAdmin,
    refetchInterval: 60000,
  });
}
