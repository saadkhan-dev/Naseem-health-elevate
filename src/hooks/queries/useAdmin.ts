import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  updateAvailability,
  getAllServices,
  getAllAvailability,
  createService,
  updateService,
  deleteService,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getDashboardStats,
  setVideoPaymentStatus,
  getVideoPaymentStatus,
  setVideoPricing,
  rescheduleAppointment,
  getVideoOffers,
  createVideoOffer,
  updateVideoOffer,
  deleteVideoOffer,
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  type AppointmentWithDetails,
  type Product,
  type DashboardStats,
  type VideoOffer,
  type VideoPaymentStatusView,
} from "@/lib/admin-data";
import { adminGetChatUsage } from "@/lib/actions.functions";
import type { ChatUsageRange, ChatUsageStats } from "@/lib/server/chat-usage";
import type { Service, AvailabilitySlot } from "@/lib/bookings";
import type { PaymentMethod } from "@/lib/payment";

// --- Appointments ---

export function useAppointments() {
  return useQuery<AppointmentWithDetails[]>({
    queryKey: ["admin", "appointments"],
    queryFn: getAllAppointments,
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery<AppointmentWithDetails | null>({
    queryKey: ["admin", "appointment", id],
    queryFn: () => getAppointmentById(id!),
    enabled: !!id,
  });
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status:
        "pending" | "confirmed" | "rejected" | "completed" | "cancelled" | "arrived" | "no_show";
    }) => updateAppointmentStatus(id, status),
    onSuccess: () => {
      // Refresh the admin list + dashboard stats immediately, and the public
      // slot availability (cancelled/rejected appointments free their slot).
      qc.invalidateQueries({ queryKey: ["admin", "appointments"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

// --- Availability ---

export function useAdminAvailability() {
  return useQuery<AvailabilitySlot[]>({
    queryKey: ["admin", "availability"],
    queryFn: getAllAvailability,
  });
}

export function useUpdateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { start_time?: string; end_time?: string; is_available?: boolean };
    }) => updateAvailability(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "availability"] }),
  });
}

// --- Services ---

export function useAdminServices() {
  return useQuery<Service[]>({
    queryKey: ["admin", "services"],
    queryFn: getAllServices,
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createService,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "services"] }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateService>[1] }) =>
      updateService(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "services"] }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "services"] }),
  });
}

// --- Products ---

export function useAdminProducts() {
  return useQuery<Product[]>({
    queryKey: ["admin", "products"],
    queryFn: getProducts,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateProduct>[1] }) =>
      updateProduct(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
  });
}

// --- Video Consultation payments ---

export function useSetVideoPaymentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appointmentId,
      status,
    }: {
      appointmentId: string;
      status: "payment_verified" | "payment_failed" | "refunded" | "waived";
    }) => setVideoPaymentStatus(appointmentId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "appointments"] });
    },
  });
}

export function useVideoPaymentStatus(appointmentId: string | undefined) {
  return useQuery<VideoPaymentStatusView | null>({
    queryKey: ["admin", "video-payment-status", appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      const result = await getVideoPaymentStatus(appointmentId);
      return result.status;
    },
    enabled: !!appointmentId,
    refetchInterval: 15000,
  });
}

// --- Video Consultation pricing ---

export function useSetVideoPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (price: number) => setVideoPricing(price),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "services"] });
    },
  });
}

// --- Reschedule ---

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, time }: { id: string; date: string; time: string | null }) =>
      rescheduleAppointment(id, date, time),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "appointments"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

// --- Video Consultation offers ---

export function useAdminVideoOffers() {
  return useQuery<VideoOffer[]>({
    queryKey: ["admin", "video-offers"],
    queryFn: getVideoOffers,
  });
}

export function useCreateVideoOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createVideoOffer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "video-offers"] }),
  });
}

export function useUpdateVideoOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateVideoOffer>[1] }) =>
      updateVideoOffer(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "video-offers"] }),
  });
}

export function useDeleteVideoOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVideoOffer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "video-offers"] }),
  });
}

// --- Payment methods (prepaid Video Consultation) ---

export function useAdminPaymentMethods() {
  return useQuery<PaymentMethod[]>({
    queryKey: ["admin", "payment-methods"],
    queryFn: getPaymentMethods,
  });
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPaymentMethod,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] }),
  });
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePaymentMethod>[1] }) =>
      updatePaymentMethod(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] }),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePaymentMethod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] }),
  });
}

// --- Dashboard ---

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ["admin", "stats"],
    queryFn: getDashboardStats,
    refetchInterval: 30000,
  });
}

// --- AI Chatbot Usage ---

export function useChatUsage(range: ChatUsageRange = "30d") {
  return useQuery<ChatUsageStats>({
    queryKey: ["admin", "chat-usage", range],
    queryFn: () => adminGetChatUsage({ data: { range } }),
    refetchInterval: 30000,
  });
}
