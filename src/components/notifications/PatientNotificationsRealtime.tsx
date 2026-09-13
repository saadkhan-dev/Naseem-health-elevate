import { useAuth } from "@/hooks/useAuth";
import { usePatientNotificationRealtime } from "@/hooks/useNotificationRealtime";
import { supabase } from "@/lib/supabase";

/**
 * Mounted once at the app root so there is exactly one patient notification
 * realtime subscription per authenticated session. Renders nothing, unsubscribes
 * automatically on logout (userId becomes null) or unmount.
 */
export function PatientNotificationsRealtime() {
  const { user } = useAuth();
  usePatientNotificationRealtime(supabase, user?.id);
  return null;
}
