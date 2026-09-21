import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/notifications";

/**
 * Realtime auto-updates for the whole site.
 *
 * Three cooperating subscriptions (each exactly ONE channel, removed in the
 * effect cleanup so navigation never creates duplicates — mirroring
 * `src/hooks/useConsultation.ts`):
 *
 *  1. Admin events  — `public.realtime_events`, staff client. RLS gates
 *     delivery (only admins/doctors may read), so only staff receive them.
 *     Invalidates the admin queries and raises toasts for NEW business
 *     objects (appointment request, order, support message, review).
 *
 *  2. Patient events — `public.realtime_events`, public client, filtered to
 *     `user_id = auth.uid()` (the non-PK filter is why the table uses
 *     REPLICA IDENTITY FULL). Invalidates the patient's appointment/order/video
 *     queries and toasts status changes made from the admin side.
 *
 *  3. Public content — high-level content tables whose rows are already
 *     public via RLS, so subscribing on the public client is safe and pushes
 *     fresh data (availability slots, services, products, ...) into existing
 *     queries immediately without 30-min staleTime waits or polling.
 *
 * Nothing here is logged to the console: realtime payloads can contain
 * patient-visible text and must never surface in the browser console.
 */

type RealtimeEventRow = {
  id: string;
  kind: string;
  entity_id: string | null;
  entity_no: string | null;
  scope: string;
  user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

function invalidateMany(qc: QueryClient, keys: readonly (readonly unknown[])[]) {
  for (const key of keys) {
    void qc.invalidateQueries({ queryKey: key as readonly unknown[] });
  }
}

/** Dedupe + ignore anything older than 30s (e.g. buffered replay). */
function makeFreshGate() {
  const seen = new Set<string>();
  return (id: string | undefined, created_at: string | undefined): boolean => {
    if (!id) return false;
    if (seen.has(id)) return false;
    const age = created_at ? Date.now() - new Date(created_at).getTime() : Number.POSITIVE_INFINITY;
    if (age > 30_000) return false;
    seen.add(id);
    if (seen.size > 500) seen.clear();
    return true;
  };
}

function prettyStatus(status: string | null): string {
  if (!status) return "";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const ADMIN_INVALIDATIONS: Record<string, readonly (readonly unknown[])[]> = {
  new_appointment: [["admin", "appointments"], ["admin", "stats"], ["bookedSlots"]],
  appointment_update: [
    ["admin", "appointments"],
    ["admin", "appointment"],
    ["admin", "stats"],
    ["bookedSlots"],
  ],
  payment_update: [
    ["admin", "appointments"],
    ["admin", "stats"],
    ["admin", "payments"],
    ["bookedSlots"],
  ],
  video_ready: [
    ["admin", "appointments"],
    ["admin", "videos"],
    ["admin", "payments"],
  ],
  new_order: [
    ["admin", "orders"],
    ["admin", "stats"],
  ],
  order_update: [
    ["admin", "orders"],
    ["admin", "stats"],
    ["admin", "payments"],
  ],
  new_support_message: [["support", "admin"]],
  new_review: [["reviews"], ["admin", "reviews"]],
};

export function useAdminRealtimeSync(client: SupabaseClient) {
  const qc = useQueryClient();
  const fresh = useRef(makeFreshGate());

  useEffect(() => {
    const listener = (payload: { new: Record<string, unknown> | null }) => {
      const row = payload.new as RealtimeEventRow | null;
      if (!row || !fresh.current(row.id, row.created_at)) return;

      const keys = ADMIN_INVALIDATIONS[row.kind];
      if (keys) {
        invalidateMany(qc, keys);
        // also invalidate the exact appointment detail if we know the id
        if (row.kind === "appointment_update" && row.entity_id) {
          void qc.invalidateQueries({ queryKey: ["admin", "appointment", row.entity_id] });
        }
        if (row.kind === "payment_update" || row.kind === "video_ready") {
          void qc.invalidateQueries({ queryKey: ["admin", "appointments"] });
        }
      }

      const no = row.entity_no ?? "";
      switch (row.kind) {
        case "new_appointment":
          toast.info(`New appointment request${no ? ` ${no}` : ""}`, {
            description: "Check the appointments list to take action.",
          });
          break;
        case "new_order":
          toast.info(`New order${no ? ` ${no}` : ""}`, {
            description: "A new order was placed.",
          });
          break;
        case "new_support_message":
          toast.info("New support message", {
            description: "A patient needs assistance.",
          });
          break;
        case "new_review":
          toast.info("New review submitted", {
            description: "A patient left feedback.",
          });
          break;
      }
    };

    const channel = client
      .channel("realtime-events-admin")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "realtime_events" },
        listener,
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client, qc]);
}

// ---------------------------------------------------------------------------
// Patient
// ---------------------------------------------------------------------------

const PATIENT_INVALIDATIONS: Record<string, readonly (readonly unknown[])[]> = {
  appointment_update: [["patient", "appointments"], ["videoSession"], ["videoJoin"]],
  payment_update: [["patient", "appointments"], ["videoSession"], ["videoJoin"]],
  video_ready: [["videoJoin"], ["videoSession"], ["patient", "appointments"]],
  order_update: [
    ["patient", "orders"],
    ["patient", "order"],
  ],
};

export function usePatientRealtimeSync(client: SupabaseClient, userId: string | null | undefined) {
  const qc = useQueryClient();
  const fresh = useRef(makeFreshGate());

  useEffect(() => {
    if (!userId) return;

    const listener = (payload: { new: Record<string, unknown> | null }) => {
      const row = payload.new as RealtimeEventRow | null;
      if (!row || !fresh.current(row.id, row.created_at)) return;

      const keys = PATIENT_INVALIDATIONS[row.kind];
      if (keys) {
        invalidateMany(qc, keys);
      }

      const no = row.entity_no ?? "";
      const event = (row.payload ?? {}) as {
        rescheduled?: boolean;
        status?: string | null;
        payment_status?: string | null;
        date?: string | null;
        time?: string | null;
      };
      switch (row.kind) {
        case "appointment_update": {
          if (event.rescheduled) {
            void qc.invalidateQueries({ queryKey: ["bookedSlots"] });
            toast.info(`Appointment ${no} rescheduled`, {
              description: `New time: ${String(event.date ?? "")} at ${String(
                event.time ?? "Flexible",
              ).slice(0, 5)}.`,
            });
          } else if (typeof event.status === "string") {
            const label =
              APPOINTMENT_STATUS_LABELS[event.status as keyof typeof APPOINTMENT_STATUS_LABELS] ??
              prettyStatus(event.status);
            toast.info(`Appointment ${no}`, {
              description: `Your appointment is now ${label.toLowerCase()}.`,
            });
          }
          break;
        }
        case "payment_update": {
          toast.info(`Payment update for ${no}`, {
            description: `Status: ${prettyStatus(event.payment_status ?? "")}.`,
          });
          break;
        }
        case "video_ready": {
          toast.info(`Your video consultation ${no} is ready`, {
            description: "You can join the call now.",
          });
          break;
        }
        case "order_update": {
          toast.info(`Order ${no}`, {
            description: `Status: ${prettyStatus(event.status ?? "")}.`,
          });
          break;
        }
      }
    };

    const channel = client
      .channel("realtime-events-patient")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "realtime_events",
          filter: userId ? `user_id=eq.${userId}` : undefined,
        },
        listener,
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client, qc, userId]);
}

// ---------------------------------------------------------------------------
// Public content freshness
// ---------------------------------------------------------------------------

const CONTENT_TABLE_KEYS: Record<string, readonly (readonly unknown[])[]> = {
  availability: [["availability"], ["bookedSlots"], ["admin", "availability"]],
  custom_availability: [["customAvailability"], ["bookedSlots"], ["admin", "custom-availability"]],
  recurring_availability: [
    ["recurringAvailability"],
    ["bookedSlots"],
    ["admin", "recurring-availability"],
  ],
  services: [["services"], ["admin", "services"]],
  products: [["products", "published"], ["admin", "products"], ["product"]],
  store_settings: [["store-settings"], ["admin", "settings"]],
  delivery_areas: [["delivery-areas"], ["active-delivery-areas"]],
  conditions: [["conditions"], ["admin", "conditions"]],
  reviews: [["reviews"], ["admin", "reviews"]],
  videos: [
    ["videos", "published"],
    ["admin", "videos"],
  ],
  video_offers: [["video-offers", "public"], ["video-offers"]],
  faqs: [
    ["faqs", "public"],
    ["admin", "faqs"],
  ],
  doctor_profile: [
    ["doctor-profile", "public"],
    ["doctor-profile", "admin"],
  ],
  payment_methods: [["payment-methods"]],
};

export function usePublicContentRealtime(client: SupabaseClient) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = client.channel("realtime-content");

    for (const [table, keys] of Object.entries(CONTENT_TABLE_KEYS)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () =>
        invalidateMany(qc, keys),
      );
    }

    channel.subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client, qc]);
}

// ---------------------------------------------------------------------------
// Mountable render-null wrappers
// ---------------------------------------------------------------------------

export function AdminRealtimeSync({ client }: { client: SupabaseClient }) {
  useAdminRealtimeSync(client);
  return null;
}

export function PatientRealtimeSync({ client }: { client: SupabaseClient }) {
  const { user } = useAuth();
  usePatientRealtimeSync(client, user?.id);
  return null;
}

export function PublicContentRealtime({ client }: { client: SupabaseClient }) {
  usePublicContentRealtime(client);
  return null;
}
