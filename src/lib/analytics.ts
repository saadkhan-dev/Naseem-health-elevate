import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Anonymous, privacy-first website activity tracking + live presence.
 *
 * Writes go to Supabase RPCs (record_analytics_event / heartbeat_presence),
 * which are security-definer functions: the server derives user type from the
 * session token and sanitizes metadata — this client can neither fake a role
 * nor store personal data. Every call is fire-and-forget and silently
 * best-effort so analytics never blocks or breaks the UI.
 *
 * Two clients exist so user type is classified correctly:
 *   * public browsing  -> `supabase`       (guest / signed-in patient)
 *   * admin panel      -> `staffSupabase`  (admin / doctor staff)
 */

const SESSION_KEY = "he_analytics_session";
const PAGE_VIEW_INTERVAL_MS = 30_000;

export const AnalyticsEvents = {
  pageView: "page_view",
  bookingStarted: "booking_started",
  bookingCompleted: "booking_completed",
  bookingAbandoned: "booking_abandoned",
  login: "login",
  signup: "signup",
  appointmentCreated: "appointment_created",
  paymentSubmitted: "payment_submitted",
  videoJoined: "video_joined",
  videoEnded: "video_ended",
  productView: "product_view",
  orderPlaced: "order_placed",
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export type AnalyticsMetadata = Record<string, string | number | boolean>;

let cachedSessionId: string | null = null;
let initialReferrer: string | null = null;
const lastPageViewSent = new Map<string, number>();

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

/** Stable anonymous session identity (client-generated UUID in localStorage). */
export function getAnalyticsSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (hasStorage()) {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
  }
  const id = crypto.randomUUID();
  cachedSessionId = id;
  if (hasStorage()) {
    try {
      window.localStorage.setItem(SESSION_KEY, id);
    } catch {
      // storage full / private mode — session id still lives for this tab
    }
  }
  return id;
}

function getReferrer(): string | null {
  if (initialReferrer !== null) return initialReferrer;
  initialReferrer = typeof document !== "undefined" && document.referrer ? document.referrer : "";
  return initialReferrer || null;
}

function detectDevice(): string {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

let device: string | null = null;
function getDevice(): string {
  if (!device) device = detectDevice();
  return device;
}

async function rpc(
  client: SupabaseClient,
  fn: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await client.rpc(fn, body);
  } catch {
    // best-effort: never break the page for analytics
  }
}

function emit(
  client: SupabaseClient,
  eventName: AnalyticsEventName,
  opts?: {
    path?: string;
    metadata?: AnalyticsMetadata;
  },
): void {
  if (typeof window === "undefined") return;
  const path = opts?.path ?? window.location.pathname;

  if (eventName === AnalyticsEvents.pageView) {
    const last = lastPageViewSent.get(path) ?? 0;
    const now = Date.now();
    if (now - last < PAGE_VIEW_INTERVAL_MS) return;
    lastPageViewSent.set(path, now);
  }

  void rpc(client, "record_analytics_event", {
    p_event_name: eventName,
    p_session_id: getAnalyticsSessionId(),
    p_path: path,
    p_referrer: getReferrer() ?? undefined,
    p_metadata: opts?.metadata ?? {},
  });
}

/** Record an analytics event using the given Supabase client. */
export function trackAnalyticsEventAs(
  client: SupabaseClient,
  eventName: AnalyticsEventName,
  opts?: {
    path?: string;
    metadata?: AnalyticsMetadata;
  },
): void {
  emit(client, eventName, opts);
}

/** Record an analytics event for the current (public) session. */
export function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  opts?: { path?: string; metadata?: AnalyticsMetadata },
): void {
  emit(supabase, eventName, opts);
}

/** Page-view tracking helper (path change aware), public client. */
export function trackPageView(path?: string): void {
  trackAnalyticsEvent(AnalyticsEvents.pageView, { path });
}

/** Heartbeat: keep this session "live" for the presence dashboard. */
export function sendHeartbeat(path?: string, client: SupabaseClient = supabase): void {
  if (typeof window === "undefined") return;
  try {
    void client.rpc("heartbeat_presence", {
      p_session_id: getAnalyticsSessionId(),
      p_path: path ?? window.location.pathname,
      p_device: getDevice(),
      p_referrer: getReferrer() ?? undefined,
    });
  } catch {
    // best-effort
  }
}
