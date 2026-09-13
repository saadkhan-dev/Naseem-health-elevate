import {
  useMyNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/queries/usePatient";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function PatientNotificationsBell() {
  const { data, isLoading, isError, error } = useMyNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  return (
    <NotificationBell
      label="Notifications"
      data={data ?? []}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onMarkRead={(id) => markRead.mutate(id)}
      onMarkAll={() => markAll.mutate()}
      triggerClassName="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition-colors hover:border-emerald-400/40 hover:text-white"
      badgeClassName="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-black"
    />
  );
}
