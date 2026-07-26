import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createVideoSession,
  getVideoSessionByAppointment,
  updateVideoSessionStatus,
} from "@/lib/video-call";

export function useCreateVideoSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appointmentId, durationMinutes }: { appointmentId: string; durationMinutes?: number }) =>
      createVideoSession(appointmentId, durationMinutes),
    onSuccess: (_, { appointmentId }) => {
      qc.invalidateQueries({ queryKey: ["videoSession", appointmentId] });
    },
  });
}

export function useVideoSession(appointmentId: string | undefined) {
  return useQuery({
    queryKey: ["videoSession", appointmentId],
    queryFn: () => getVideoSessionByAppointment(appointmentId!),
    enabled: !!appointmentId,
    refetchInterval: 15000,
  });
}

export function useUpdateVideoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      status,
    }: {
      sessionId: string;
      status: "scheduled" | "active" | "completed";
    }) => updateVideoSessionStatus(sessionId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videoSession"] });
    },
  });
}
