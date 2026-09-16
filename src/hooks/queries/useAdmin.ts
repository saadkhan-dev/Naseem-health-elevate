import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  updateAvailability,
  getAllServices,
  getAllAvailability,
  getAllCustomAvailability,
  createCustomAvailability,
  updateCustomAvailability,
  deleteCustomAvailability,
  getAllRecurringAvailability,
  createRecurringAvailability,
  updateRecurringAvailability,
  deleteRecurringAvailability,
  updateStoreSettings,
  updateOrderDeliveryCharge,
  getStaffMembers,
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
  applyReschedule,
  getVideoOffers,
  createVideoOffer,
  updateVideoOffer,
  deleteVideoOffer,
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getRecentPatients,
  getPatientById,
  createDeliveryArea,
  updateDeliveryArea,
  deleteDeliveryArea,
  getActiveDeliveryAreas,
  getAllDeliveryAreas,
  type DeliveryArea,
  type AppointmentWithDetails,
  type Product,
  type DashboardStats,
  type VideoOffer,
  type VideoPaymentStatusView,
  type RecentPatient,
  type CustomAvailabilityInput,
  type RecurringAvailabilityInput,
} from "@/lib/admin-data";
import { adminGetChatUsage } from "@/lib/actions.functions";
import type { ChatUsageRange, ChatUsageStats } from "@/lib/server/chat-usage";
import type {
  Service,
  AvailabilitySlot,
  CustomAvailabilitySlot,
  RecurringAvailabilitySlot,
} from "@/lib/bookings";
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

// --- Extra / custom availability (one-time slots for a specific date) ---

export function useAdminCustomAvailability() {
  return useQuery<CustomAvailabilitySlot[]>({
    queryKey: ["admin", "custom-availability"],
    queryFn: getAllCustomAvailability,
  });
}

/** Doctors/admins who can be assigned an extra availability slot. */
export function useStaffMembers() {
  return useQuery<Array<{ id: string; full_name: string | null }>>({
    queryKey: ["admin", "staff-members"],
    queryFn: getStaffMembers,
    staleTime: 1000 * 60 * 30,
  });
}

export function useCreateCustomAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomAvailabilityInput) => createCustomAvailability(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "custom-availability"] });
      qc.invalidateQueries({ queryKey: ["customAvailability"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

export function useUpdateCustomAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomAvailabilityInput> }) =>
      updateCustomAvailability(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "custom-availability"] });
      qc.invalidateQueries({ queryKey: ["customAvailability"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

export function useDeleteCustomAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomAvailability(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "custom-availability"] });
      qc.invalidateQueries({ queryKey: ["customAvailability"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

// --- Recurring (weekly) extra availability ---

export function useAdminRecurringAvailability() {
  return useQuery<RecurringAvailabilitySlot[]>({
    queryKey: ["admin", "recurring-availability"],
    queryFn: getAllRecurringAvailability,
  });
}

export function useCreateRecurringAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecurringAvailabilityInput) => createRecurringAvailability(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "recurring-availability"] });
      qc.invalidateQueries({ queryKey: ["recurringAvailability"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

export function useUpdateRecurringAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RecurringAvailabilityInput> }) =>
      updateRecurringAvailability(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "recurring-availability"] });
      qc.invalidateQueries({ queryKey: ["recurringAvailability"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

export function useDeleteRecurringAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecurringAvailability(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "recurring-availability"] });
      qc.invalidateQueries({ queryKey: ["recurringAvailability"] });
      qc.invalidateQueries({ queryKey: ["bookedSlots"] });
    },
  });
}

// --- Store settings (delivery charge) ---
// The read side lives in `useShop.ts` (`useStoreSettings`) so the public
// storefront never imports an admin-only hook module.

export function useUpdateStoreSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof updateStoreSettings>[0]) => updateStoreSettings(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-settings"] }),
  });
}

// --- Product delivery charge on a single order ---

export function useUpdateOrderDeliveryCharge(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deliveryCharge }: { id: string; deliveryCharge: number }) =>
      updateOrderDeliveryCharge(id, deliveryCharge),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      onDone?.();
    },
  });
}

export function useDeliveryAreas() {
  return useQuery<DeliveryArea[]>({
    queryKey: ["delivery-areas"],
    queryFn: getAllDeliveryAreas,
    staleTime: 1000 * 60,
  });
}

export function useCreateDeliveryArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDeliveryArea,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-areas"] });
      qc.invalidateQueries({ queryKey: ["active-delivery-areas"] });
    },
  });
}

export function useUpdateDeliveryArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateDeliveryArea>[1] }) =>
      updateDeliveryArea(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-areas"] });
      qc.invalidateQueries({ queryKey: ["active-delivery-areas"] });
    },
  });
}

export function useDeleteDeliveryArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDeliveryArea,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-areas"] });
      qc.invalidateQueries({ queryKey: ["active-delivery-areas"] });
    },
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

/** Admin approves or rejects a pending reschedule request raised by the patient. */
export function useApplyReschedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      applyReschedule(id, action),
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

/** Most recently registered patients (dashboard deep-link target). */
export function useRecentPatients() {
  return useQuery<RecentPatient[]>({
    queryKey: ["admin", "recent-patients"],
    queryFn: () => getRecentPatients(12),
  });
}

/** Single patient profile — loads the deep-linked patient even when they are
 *  not inside the recent-patients list, so the notification always lands on
 *  the exact record. */
export function usePatientById(id: string | null) {
  return useQuery<RecentPatient | null>({
    queryKey: ["admin", "patient", id ?? "none"],
    queryFn: () => getPatientById(id as string),
    enabled: !!id,
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
