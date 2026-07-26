import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getServices,
  getAvailability,
  getBookedSlots,
  generateTimeSlots,
  createAppointment,
  type Service,
  type AvailabilitySlot,
} from "@/lib/bookings";

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

export function useTimeSlots(date: Date | undefined, selectedServiceId: string | undefined, services: Service[] | undefined) {
  const dateStr = date ? date.toISOString().split("T")[0] : "";
  const service = services?.find((s) => s.id === selectedServiceId);
  const duration = service?.duration_minutes ?? 30;

  const bookedQuery = useQuery({
    queryKey: ["bookedSlots", dateStr],
    queryFn: () => getBookedSlots(dateStr),
    enabled: !!date,
    staleTime: 1000 * 60,
  });

  const availQuery = useAvailability();

  const slots = (() => {
    if (!date || !availQuery.data || !bookedQuery.data) return [];
    return generateTimeSlots(availQuery.data, date, bookedQuery.data, duration);
  })();

  return { slots, isLoading: bookedQuery.isLoading || availQuery.isLoading };
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      patientId,
      serviceId,
      date,
      time,
    }: {
      patientId: string;
      serviceId: string;
      date: string;
      time: string;
    }) => createAppointment(patientId, serviceId, date, time),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookedSlots"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}
