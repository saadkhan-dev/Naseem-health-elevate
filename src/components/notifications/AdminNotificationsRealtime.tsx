import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useAdminNotificationRealtime } from "@/hooks/useNotificationRealtime";
import { staffSupabase } from "@/lib/supabase";

/**
 * Mounted once inside the admin layout so there is exactly one admin
 * notification realtime subscription per authenticated staff session. Renders
 * nothing. Only subscribes while the staff profile is admin/doctor; leaves the
 * admin session (new user, other roles) without any subscription.
 */
export function AdminNotificationsRealtime() {
  const { user, profile } = useStaffAuth();
  const isStaff = profile?.role === "admin" || profile?.role === "doctor";
  useAdminNotificationRealtime(staffSupabase, isStaff ? user?.id : null);
  return null;
}
