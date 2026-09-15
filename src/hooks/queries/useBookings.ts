import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getServices,
  getAvailability,
  getCustomAvailability,
  getBookedSlots,
  generateTimeSlots,
  createAppointment,
  checkAppointment,
  checkOrder,
  recoverAppointments,
  recoverOrders,
  type Service,
  type AvailabilitySlot,
  type CustomAvailabilitySlot,
  type AppointmentStatus,
  type RecoveredAppointment,
  type OrderStatus,
  type RecoveredOrder,
} from "@/lib/bookings";
import type { NotificationResult } from "@/lib/notifications";
import { toClinicDate, todayInClinic, nowTimeInClinic } from "@/lib/clinic";

export function useServices() {
  return useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: getServices,
    staleTime: 1000 * 60 * 30,
  });
}

export function useAvailability() {
  return useQuery<AvailabilitySlot[]>({
    queryKey: ["availability"],
    queryFn: getAvailability,
    staleTime: 1000 * 60 * 30,
  });
}

/** One-time / custom availability slots for specific dates (today onwards). */
export function useCustomAvailability() {
  return useQuery<CustomAvailabilitySlot[]>({
    queryKey: ["customAvailability"],
    queryFn: getCustomAvailability,
    staleTime: 1000 * 60 * 5,
  });
}

export function useTimeSlots(
  date: Date | undefined,
  selectedServiceId: string | undefined,
  services: Service[] | undefined,
) {
  const dateStr = date ? toClinicDate(date) : "";
  const service = services?.find((s) => s.id === selectedServiceId);
  // null duration = flexible service (Home Visit) → no fixed slots.
  const duration = service?.duration_minutes ?? null;

  const bookedQuery = useQuery({
    queryKey: ["bookedSlots", dateStr],
    queryFn: () => getBookedSlots(dateStr),
    enabled: !!date,
    staleTime: 1000 * 60,
  });

  const availQuery = useAvailability();
  const customQuery = useCustomAvailability();

  const slots = (() => {
    if (!date || !availQuery.data || !bookedQuery.data) return [];
    return generateTimeSlots(
      availQuery.data,
      date,
      bookedQuery.data,
      duration,
      todayInClinic(),
      nowTimeInClinic(),
      customQuery.data,
    );
  })();

  return {
    slots,
    isLoading: bookedQuery.isLoading || availQuery.isLoading || customQuery.isLoading,
  };
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      phone,
      email,
      serviceId,
      date,
      time,
      notes,
    }: {
      name: string;
      phone?: string;
      email?: string;
      serviceId: string;
      date: string;
      /** "HH:mm". Omitted for flexible services (Home Visit) — the doctor confirms the time. */
      time?: string;
      notes?: string;
    }): Promise<{
      error: string | null;
      id: string | null;
      appointmentNo: string | null;
      notifications: NotificationResult[];
      amount: number | null;
      paymentStatus: string | null;
      offerTitle: string | null;
    }> => createAppointment(name, phone ?? "", email ?? "", serviceId, date, time, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookedSlots"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useCheckAppointmentStatus() {
  return useMutation({
    mutationFn: ({
      appointmentId,
      phone,
      email,
    }: {
      appointmentId: string;
      phone: string;
      email: string;
    }): Promise<{
      error: string | null;
      found: boolean;
      appointment: AppointmentStatus | null;
    }> => checkAppointment(appointmentId, phone, email),
  });
}

export function useRecoverAppointment() {
  return useMutation({
    mutationFn: ({
      name,
      phone,
      email,
    }: {
      name: string;
      phone: string;
      email: string;
    }): Promise<{
      error: string | null;
      appointments: RecoveredAppointment[];
    }> => recoverAppointments(name, phone, email),
  });
}

export function useCheckOrderStatus() {
  return useMutation({
    mutationFn: ({
      orderNo,
      phone,
      email,
    }: {
      orderNo: string;
      phone: string;
      email: string;
    }): Promise<{
      error: string | null;
      found: boolean;
      order: OrderStatus | null;
    }> => checkOrder(orderNo, phone, email),
  });
}

export function useRecoverOrder() {
  return useMutation({
    mutationFn: ({
      name,
      phone,
      email,
    }: {
      name: string;
      phone: string;
      email: string;
    }): Promise<{
      error: string | null;
      orders: RecoveredOrder[];
    }> => recoverOrders(name, phone, email),
  });
}
