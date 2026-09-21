import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackAnalyticsEventAs, sendHeartbeat } from "@/lib/analytics";

/**
 * Page-view tracking + live presence heartbeat for one "surface".
 * Mounted once:
 *   * public app (root, non-admin routes) -> `supabase` (guest/patient)
 *   * admin panel (admin layout)          -> `staffSupabase` (staff)
 *
 * Tracks the current path when the route changes, then keeps the presence
 * record fresh with a ~60s heartbeat (and on tab visibility changes) while
 * the surface stays mounted.
 */
export function useSiteTracking(client: SupabaseClient) {
  const location = useLocation();
  const mounted = useRef(false);

  useEffect(() => {
    const path = location.pathname;
    trackAnalyticsEventAs(client, "page_view", { path });
    sendHeartbeat(path, client);
  }, [client, location.pathname]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      sendHeartbeat(window.location.pathname, client);
    }
    const id = setInterval(() => sendHeartbeat(window.location.pathname, client), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") sendHeartbeat(window.location.pathname, client);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client]);
}

export function SiteTracking({ client }: { client: SupabaseClient }) {
  useSiteTracking(client);
  return null;
}
