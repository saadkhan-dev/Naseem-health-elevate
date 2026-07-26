import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllAppointments,
  updateAppointmentStatus,
  updateAvailability,
  createService,
  updateService,
  deleteService,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getDashboardStats,
  type AppointmentWithDetails,
  type Product,
  type DashboardStats,
} from "@/lib/admin-data";
import { getServices, getAvailability, type Service, type AvailabilitySlot } from "@/lib/bookings";

// --- Appointments ---

export function useAppointments() {
  return useQuery<AppointmentWithDetails[]>({
    queryKey: ["admin", "appointments"],
    queryFn: getAllAppointments,
  });
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pending" | "confirmed" | "completed" | "cancelled" }) =>
      updateAppointmentStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "appointments"] }),
  });
}

// --- Availability ---

export function useAdminAvailability() {
  return useQuery<AvailabilitySlot[]>({
    queryKey: ["admin", "availability"],
    queryFn: getAvailability,
  });
}

export function useUpdateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { start_time?: string; end_time?: string; is_available?: boolean } }) =>
      updateAvailability(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "availability"] }),
  });
}

// --- Services ---

export function useAdminServices() {
  return useQuery<Service[]>({
    queryKey: ["admin", "services"],
    queryFn: () => getServices(),
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
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateService>[1] }) => updateService(id, data),
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
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateProduct>[1] }) => updateProduct(id, data),
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

// --- Dashboard ---

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ["admin", "stats"],
    queryFn: getDashboardStats,
    refetchInterval: 30000,
  });
}
