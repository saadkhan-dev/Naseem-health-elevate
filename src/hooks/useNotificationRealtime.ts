import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyNotificationChange,
  type NotificationChangeKind,
  type NotificationLike,
} from "@/lib/notification-realtime";

/**
 * Phase 5 — Supabase Realtime for the notification bells.
 *
 * One subscription per authenticated user / session / role, mirroring the
 * existing consultation-chat realtime pattern in `src/hooks/useConsultation.ts`:
 * `client.channel(name).on("postgres_changes", ...).subscribe()` with the
 * channel removed in the effect cleanup. Mounted exactly once (patient: root
 * app, admin: admin layout), so opening/closing the bell dropdown/Sheet or
 * navigating never creates duplicate listeners.
 *
 * RLS does the authorization: the client's JWT only receives events for rows
 * its SELECT policy allows. The patient filter (`user_id`) is defensive belt
 * -and-braces on top of that and also reduces traffic. Nothing here is logged —
 * realtime payloads can contain notification contents, and the UI must never
 * expose those in the browser console.
 *
 * The 60s `refetchInterval` on the notification queries stays in place as a
 * polling fallback when realtime is not available.
 */

const PATIENT_NOTIFICATIONS_KEY = ["patient", "notifications"] as const;
const ADMIN_NOTIFICATIONS_KEY = ["admin", "notifications"] as const;

function applyRealtimeChange(
  qc: QueryClient,
  queryKey: readonly unknown[],
  row: NotificationLike | undefined,
  kind: NotificationChangeKind,
) {
  // Mirror the change into the shared query cache so the badge/list update
  // immediately, then refetch so ordering and the server-side `LIMIT 100`
  // are reconciled by the actual data.
  qc.setQueryData<NotificationLike[]>(queryKey, (current) =>
    applyNotificationChange(current, row, kind),
  );
  void qc.invalidateQueries({ queryKey });
}

interface RealtimeSubscriptionConfig {
  channelName: string;
  tableName: `patient_notifications` | `admin_notifications`;
  queryKey: readonly unknown[];
}

function useNotificationRealtime(
  client: SupabaseClient,
  userId: string | null | undefined,
  config: RealtimeSubscriptionConfig & { filter?: string },
) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const listener =
      (kind: NotificationChangeKind) =>
      (payload: { new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => {
        const source = kind === "DELETE" ? payload.old : payload.new;
        applyRealtimeChange(
          qc,
          config.queryKey,
          (source ?? undefined) as unknown as NotificationLike | undefined,
          kind,
        );
      };

    const channel = client
      .channel(config.channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: config.tableName,
          ...(config.filter ? { filter: config.filter } : {}),
        },
        listener("INSERT"),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: config.tableName,
          ...(config.filter ? { filter: config.filter } : {}),
        },
        listener("UPDATE"),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: config.tableName,
          ...(config.filter ? { filter: config.filter } : {}),
        },
        listener("DELETE"),
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client, qc, userId, config.channelName, config.tableName, config.queryKey, config.filter]);
}

/**
 * Mount once at the app root for the authenticated patient. Uses the PUBLIC
 * client so events are scoped to `user_id = auth.uid()` by both the realtime
 * filter and the `patient_notifications` SELECT RLS policy.
 */
export function usePatientNotificationRealtime(
  client: SupabaseClient,
  userId: string | null | undefined,
) {
  useNotificationRealtime(client, userId, {
    channelName: "patient-notifications",
    tableName: "patient_notifications",
    queryKey: PATIENT_NOTIFICATIONS_KEY,
    filter: userId ? `user_id=eq.${userId}` : undefined,
  });
}

/**
 * Mount once inside the admin layout. Uses the staff client. No filter: the
 * `admin_notifications` SELECT RLS policy (`is_admin() OR recipient_id =
 * auth.uid()`) already gates delivery, so admins only receive rows they are
 * authorised to read (broadcasts + all admin notifications) — never unrelated
 * users' private data.
 */
export function useAdminNotificationRealtime(
  client: SupabaseClient,
  userId: string | null | undefined,
) {
  useNotificationRealtime(client, userId, {
    channelName: "admin-notifications",
    tableName: "admin_notifications",
    queryKey: ADMIN_NOTIFICATIONS_KEY,
  });
}
