import {
  useAdminNotifications,
  useMarkAdminNotificationRead,
  useMarkAllAdminNotificationsRead,
} from "@/hooks/queries/useAdminNotifications";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function AdminNotificationsBell() {
  const { data, isLoading, isError, error } = useAdminNotifications();
  const markRead = useMarkAdminNotificationRead();
  const markAll = useMarkAllAdminNotificationsRead();

  return (
    <NotificationBell
      label="Admin notifications"
      data={data ?? []}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onMarkRead={(id) => markRead.mutate(id)}
      onMarkAll={() => markAll.mutate()}
      triggerClassName="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:-translate-y-0.5 hover:text-foreground"
      badgeClassName="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
    />
  );
}
