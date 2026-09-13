import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  type AdminNotification,
} from "@/lib/admin-notifications-data";

// --- Notifications ---

export function useAdminNotifications(enabled = true) {
  return useQuery<AdminNotification[]>({
    queryKey: ["admin", "notifications"],
    queryFn: getAdminNotifications,
    enabled,
    refetchInterval: 60000,
  });
}

export function useMarkAdminNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markAdminNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });
}

export function useMarkAllAdminNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllAdminNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });
}
