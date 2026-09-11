import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createVideoSession,
  getVideoSessionByAppointment,
  getVideoJoinByVcNo,
  updateVideoSessionStatus,
  type VideoJoinResult,
} from "@/lib/video-call";
import {
  adminResendVideoNotification,
  adminGetVideoNotificationConfig,
} from "@/lib/actions.functions";
import type { NotificationConfig, NotificationResult } from "@/lib/notifications";

export function useCreateVideoSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appointmentId,
      durationMinutes,
    }: {
      appointmentId: string;
      durationMinutes?: number;
    }) => createVideoSession(appointmentId, durationMinutes),
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

export function useVideoJoin(vcNo: string | undefined) {
  return useQuery<VideoJoinResult>({
    queryKey: ["videoJoin", vcNo],
    queryFn: () => getVideoJoinByVcNo(vcNo!),
    enabled: !!vcNo,
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
      qc.invalidateQueries({ queryKey: ["videoJoin"] });
      qc.invalidateQueries({ queryKey: ["admin", "appointments"] });
    },
  });
}

export function useVideoNotificationConfig(enabled: boolean) {
  return useQuery<NotificationConfig>({
    queryKey: ["videoNotificationConfig"],
    queryFn: () => adminGetVideoNotificationConfig({ data: undefined }),
    enabled,
  });
}

export function useResendVideoNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      appointmentId: string,
    ): Promise<{
      error: string | null;
      notifications: NotificationResult[];
    }> => adminResendVideoNotification({ data: { appointmentId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videoNotificationConfig"] });
    },
  });
}
