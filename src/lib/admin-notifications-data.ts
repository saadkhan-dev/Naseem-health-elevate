import {
  adminGetMyNotifications,
  adminMarkNotificationRead,
  adminMarkAllNotificationsRead,
} from "@/lib/actions.functions";

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  recipient_id: string | null;
  read_at: string | null;
  created_at: string;
}

export async function getAdminNotifications(): Promise<AdminNotification[]> {
  const result = await adminGetMyNotifications({ data: undefined });
  return result.notifications ?? [];
}

export async function markAdminNotificationRead(id: string): Promise<{ error: string | null }> {
  return adminMarkNotificationRead({ data: { id } });
}

export async function markAllAdminNotificationsRead(): Promise<{ error: string | null }> {
  return adminMarkAllNotificationsRead({ data: undefined });
}
