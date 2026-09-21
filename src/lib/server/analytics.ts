import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInClinic } from "@/lib/clinic";

/**
 * Admin analytics aggregations (server-side, service-role). Reads only —
 * computed on demand for the admin Analytics dashboard. All ranges are
 * day-based (`rangeDays`): the "since" date is computed as
 * today - (rangeDays - 1), so rangeDays=30 covers the last 30 days
 * including today.
 */

type AnalyticsRangeKey = "today" | "7d" | "30d" | "90d";

const ANALYTICS_RANGES: { key: AnalyticsRangeKey; days: number; label: string }[] = [
  { key: "today", days: 1, label: "Today" },
  { key: "7d", days: 7, label: "7 days" },
  { key: "30d", days: 30, label: "30 days" },
  { key: "90d", days: 90, label: "90 days" },
];

function analyticsRangeDays(range: unknown): number {
  const found = ANALYTICS_RANGES.find((r) => r.key === range);
  return found ? found.days : 30;
}

export interface AnalyticsStats {
  ok: boolean;
  rangeDays: number;
  appointments: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    rejected: number;
    /** Created within the chosen range. */
    withinRange: number;
  };
  /** Day buckets "yyyy-MM-dd" -> count, ascending, within the chosen range. */
  appointmentTrend: Array<{ date: string; count: number }>;
  revenue: {
    /** Sum of payment_amount for verified/waived video consultations. */
    total: number;
    thisMonth: number;
    verifiedPayments: number;
    /** Verified/waived consultations within the chosen range. */
    withinRange: number;
  };
  topServices: Array<{ name: string; count: number }>;
  patients: {
    total: number;
    /** Rows with a linked patient_id (registered users). */
    registered: number;
    /** Registered accounts created within the chosen range. */
    newInRange: number;
  };
  orders: {
    total: number;
    pending: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    cancelled: number;
    /** Sum of `total` for orders whose payment is verified/waived. */
    paidRevenue: number;
    /** Orders created within the chosen range. */
    withinRange: number;
  };
  orderTrend: Array<{ date: string; count: number }>;
  support: {
    total: number;
    new: number;
    inProgress: number;
    resolved: number;
    closed: number;
  };
}

function emptyStats(rangeDays: number): AnalyticsStats {
  const base = {
    total: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    rejected: 0,
    withinRange: 0,
  };
  return {
    ok: false,
    rangeDays,
    appointments: { ...base },
    appointmentTrend: [],
    revenue: { total: 0, thisMonth: 0, verifiedPayments: 0, withinRange: 0 },
    topServices: [],
    patients: { total: 0, registered: 0, newInRange: 0 },
    orders: {
      total: 0,
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      paidRevenue: 0,
      withinRange: 0,
    },
    orderTrend: [],
    support: { total: 0, new: 0, inProgress: 0, resolved: 0, closed: 0 },
  };
}

/** Inclusive "yyyy-MM-dd" start date for the given range. */
function sinceDate(today: string, rangeDays: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (rangeDays - 1));
  return d.toISOString().slice(0, 10);
}

function pairDayBuckets(
  rawTrend: Array<{ date: string | null }>,
  since: string,
  today: string,
): Array<{ date: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rawTrend) {
    const key = (r.date ?? "").slice(0, 10);
    if (key && key >= since && key <= today) map.set(key, (map.get(key) ?? 0) + 1);
  }
  // Fill empty days so the chart x-axis is continuous.
  const day = new Date(`${since}T00:00:00Z`);
  const last = new Date(`${today}T00:00:00Z`);
  const out: Array<{ date: string; count: number }> = [];
  const cursor = new Date(day);
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  // Keep sorted ascending.
  return out;
}

export async function getAnalytics(
  admin: SupabaseClient,
  range: unknown = "30d",
): Promise<AnalyticsStats> {
  const rangeDays = analyticsRangeDays(range);
  const today = todayInClinic();
  const since = sinceDate(today, rangeDays);
  const monthStart = `${today.slice(0, 7)}-01`;

  try {
    const [
      totalRes,
      pendingRes,
      confirmedRes,
      completedRes,
      cancelledRes,
      rejectedRes,
      rangeCountRes,
      revRes,
      topRes,
      patientsRes,
      registeredRes,
      trendRes,
      ordersTotalRes,
      ordersPending,
      ordersConfirmed,
      ordersShipped,
      ordersDelivered,
      ordersCancelled,
      ordersPaidRes,
      ordersTrendRes,
      ordersRangeRes,
      supportRes,
    ] = await Promise.all([
      admin.from("appointments").select("id", { count: "exact", head: true }),
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed"),
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled"),
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected"),
      admin.from("appointments").select("id", { count: "exact", head: true }).gte("date", since),
      admin
        .from("appointments")
        .select("payment_amount, date")
        .in("payment_status", ["payment_verified", "waived"])
        .order("date", { ascending: false })
        .limit(10000),
      admin
        .from("appointments")
        .select("services:service_id (name)")
        .not("status", "in", ["cancelled", "rejected", "no_show"])
        .order("date", { ascending: false })
        .limit(5000),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin
        .from("appointments")
        .select("patient_id, created_at")
        .not("patient_id", "is", null)
        .limit(10000),
      admin.from("appointments").select("id, date").gte("date", since).limit(10000),
      admin.from("orders").select("id", { count: "exact", head: true }),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("status", "shipped"),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("status", "delivered"),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
      admin
        .from("orders")
        .select("total, created_at")
        .in("payment_status", ["payment_verified", "waived"])
        .order("created_at", { ascending: false })
        .limit(10000),
      admin.from("orders").select("id, created_at").gte("created_at", since).limit(10000),
      admin.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
      admin.from("support_messages").select("status"),
    ]);

    const stats = emptyStats(rangeDays);
    stats.ok = true;
    stats.appointments = {
      total: totalRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      confirmed: confirmedRes.count ?? 0,
      completed: completedRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
      rejected: rejectedRes.count ?? 0,
      withinRange: rangeCountRes.count ?? 0,
    };

    const revRows = (revRes.data ?? []) as Array<{
      payment_amount: number | null;
      date: string | null;
    }>;
    const currentMonth = `${today.slice(0, 7)}-`;
    let revenueTotal = 0;
    let revenueThisMonth = 0;
    let revenueWithinRange = 0;
    for (const r of revRows) {
      const amount = Number(r.payment_amount ?? 0);
      revenueTotal += amount;
      const d = r.date ?? "";
      if (d.slice(0, 7) === today.slice(0, 7)) revenueThisMonth += amount;
      if (d.slice(0, 10) >= since) revenueWithinRange += amount;
    }
    stats.revenue = {
      total: revenueTotal,
      thisMonth: revenueThisMonth,
      verifiedPayments: revRows.length,
      withinRange: revenueWithinRange,
    };

    const topMap = new Map<string, number>();
    for (const r of (topRes.data ?? []) as Array<{ services?: { name?: string | null } | null }>) {
      const name = r.services?.name ?? "Unknown";
      topMap.set(name, (topMap.get(name) ?? 0) + 1);
    }
    stats.topServices = [...topMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    stats.appointmentTrend = pairDayBuckets(
      (trendRes.data ?? []).map((r) => ({ date: r.date as string | null })),
      since,
      today,
    );

    const registeredSet = new Set(
      (registeredRes.data ?? []).map((r) => r.patient_id as string).filter(Boolean),
    );
    const createdInRange = new Set(
      (registeredRes.data ?? [])
        .filter((r) => (r.created_at ?? "").slice(0, 10) >= since)
        .map((r) => r.patient_id as string)
        .filter(Boolean),
    );
    stats.patients = {
      total: patientsRes.count ?? 0,
      registered: registeredSet.size,
      newInRange: createdInRange.size,
    };

    const paidRows = (ordersPaidRes.data ?? []) as Array<{ total: number | null }>;
    let paidRevenue = 0;
    for (const o of paidRows) paidRevenue += Number(o.total ?? 0);
    stats.orders = {
      total: ordersTotalRes.count ?? 0,
      pending: ordersPending.count ?? 0,
      confirmed: ordersConfirmed.count ?? 0,
      shipped: ordersShipped.count ?? 0,
      delivered: ordersDelivered.count ?? 0,
      cancelled: ordersCancelled.count ?? 0,
      paidRevenue,
      withinRange: ordersRangeRes.count ?? 0,
    };
    stats.orderTrend = pairDayBuckets(
      (ordersTrendRes.data ?? []).map((r) => ({ date: r.created_at as string | null })),
      since,
      today,
    );

    const supportStatus = new Map<string, number>();
    for (const r of (supportRes.data ?? []) as Array<{ status: string }>) {
      supportStatus.set(r.status, (supportStatus.get(r.status) ?? 0) + 1);
    }
    const supportTotal = supportStatus.get("new") ?? 0;
    stats.support = {
      total: (supportStatus.get("new") ?? 0) + (supportStatus.get("in_progress") ?? 0),
      new: supportTotal,
      inProgress: supportStatus.get("in_progress") ?? 0,
      resolved: supportStatus.get("resolved") ?? 0,
      closed: supportStatus.get("closed") ?? 0,
    };

    return stats;
  } catch (e) {
    const stats = emptyStats(rangeDays);
    console.error("[analytics] getAnalytics failed:", e instanceof Error ? e.message : "unknown");
    return stats;
  }
}

// ---------------------------------------------------------------------------
// Live analytics: realtime presence + website traffic from the
// public.website_events / public.live_sessions tables written by the
// tracking RPCs (record_analytics_event / heartbeat_presence).
// ---------------------------------------------------------------------------

export interface LiveAnalytics {
  ok: boolean;
  live: {
    onlineNow: number;
    staff: number;
    patients: number;
    guests: number;
    /** ISO timestamp of the last live_sessions heartbeat. */
    updatedAt: string | null;
    active: Array<{ session_id: string; userType: string; role: string; path: string }>;
  };
  traffic: {
    viewsToday: number;
    visitorsToday: number;
    views7d: number;
    visitors7d: number;
    topPages: Array<{ path: string; views: number }>;
    topReferrers: Array<{ referrer: string; views: number }>;
    devices: Array<{ device: string; count: number }>;
    peakHours: Array<{ hour: number; views: number }>;
  };
  funnel: {
    bookingStarted: number;
    bookingCompleted: number;
    appointmentCreated: number;
    orderPlaced: number;
    login: number;
    signup: number;
    paymentSubmitted: number;
    /** Started -> Completed conversion (0-100). */
    startedToCompletedPct: number;
    /** Completed -> Appointment-created conversion (0-100). */
    completedToCreatedPct: number;
  };
  recent: Array<{
    id: string;
    event: string;
    path: string | null;
    userType: string;
    createdAt: string;
  }>;
}

const LIVE_WINDOW_MIN = 2;
const TRAFFIC_DAYS = 7;
const FUNNEL_DAYS = 30;

function emptyLiveAnalytics(): LiveAnalytics {
  return {
    ok: false,
    live: { onlineNow: 0, staff: 0, patients: 0, guests: 0, updatedAt: null, active: [] },
    traffic: {
      viewsToday: 0,
      visitorsToday: 0,
      views7d: 0,
      visitors7d: 0,
      topPages: [],
      topReferrers: [],
      devices: [],
      peakHours: [],
    },
    funnel: {
      bookingStarted: 0,
      bookingCompleted: 0,
      appointmentCreated: 0,
      orderPlaced: 0,
      login: 0,
      signup: 0,
      paymentSubmitted: 0,
      startedToCompletedPct: 0,
      completedToCreatedPct: 0,
    },
    recent: [],
  };
}

/** Clinic hour (UTC+5) of a UTC ISO timestamp, for peak-hours bucketing. */
function clinicHour(iso: string): number {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.floor(((ms + 5 * 3600 * 1000) % 86400000) / 3600000);
}

export async function getLiveAnalytics(admin: SupabaseClient): Promise<LiveAnalytics> {
  const stats = emptyLiveAnalytics();
  try {
    // Opportunistic sweep so "online now" stays truthful.
    await admin.rpc("purge_stale_sessions", { p_minutes: LIVE_WINDOW_MIN });

    const today = todayInClinic().slice(0, 10);
    const since7 = sinceDate(today, TRAFFIC_DAYS);
    const since30 = sinceDate(today, FUNNEL_DAYS);

    const [
      liveRes,
      tViews,
      tVisitors,
      v7Views,
      v7Visitors,
      topPagesRes,
      referrersRes,
      peakRes,
      funnelRes,
      recentRes,
    ] = await Promise.all([
      admin
        .from("live_sessions")
        .select("session_id, user_type, role, path, device")
        .gte("last_seen_at", new Date(Date.now() - LIVE_WINDOW_MIN * 60 * 1000).toISOString())
        .order("last_seen_at", { ascending: false }),
      admin
        .from("website_events")
        .select("id", { count: "exact", head: true })
        .eq("event_name", "page_view")
        .gte("created_at", `${today}T00:00:00Z`),
      admin
        .from("website_events")
        .select("session_id")
        .eq("event_name", "page_view")
        .gte("created_at", `${today}T00:00:00Z`),
      admin
        .from("website_events")
        .select("id", { count: "exact", head: true })
        .eq("event_name", "page_view")
        .gte("created_at", `${since7}T00:00:00Z`),
      admin
        .from("website_events")
        .select("session_id")
        .eq("event_name", "page_view")
        .gte("created_at", `${since7}T00:00:00Z`),
      admin
        .from("website_events")
        .select("path")
        .eq("event_name", "page_view")
        .gte("created_at", `${since7}T00:00:00Z`)
        .order("created_at", { ascending: false })
        .limit(20000),
      admin
        .from("website_events")
        .select("referrer")
        .eq("event_name", "page_view")
        .gte("created_at", `${since7}T00:00:00Z`)
        .limit(20000),
      admin
        .from("website_events")
        .select("created_at")
        .eq("event_name", "page_view")
        .gte("created_at", `${since7}T00:00:00Z`)
        .order("created_at", { ascending: false })
        .limit(50000),
      admin
        .from("website_events")
        .select("event_name, created_at")
        .in("event_name", [
          "booking_started",
          "booking_completed",
          "appointment_created",
          "order_placed",
          "login",
          "signup",
          "payment_submitted",
        ])
        .gte("created_at", `${since30}T00:00:00Z`)
        .order("created_at", { ascending: false })
        .limit(50000),
      admin
        .from("website_events")
        .select("id, event_name, path, user_type, created_at")
        .gte("created_at", `${since7}T00:00:00Z`)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const liveRows = (liveRes.data ?? []) as Array<{
      session_id: string;
      user_type: string;
      role: string;
      path: string;
      device: string | null;
    }>;
    stats.live.onlineNow = liveRows.length;
    stats.live.staff = liveRows.filter((r) => r.user_type === "staff").length;
    stats.live.patients = liveRows.filter((r) => r.user_type === "patient").length;
    stats.live.guests = liveRows.filter((r) => r.user_type === "guest").length;
    stats.live.active = liveRows.map((r) => ({
      session_id: r.session_id,
      userType: r.user_type,
      role: r.role,
      path: r.path,
    }));
    if (liveRows.length > 0) stats.live.updatedAt = new Date().toISOString();

    const todayVisitorsSet = new Set((tVisitors.data ?? []).map((r) => r.session_id as string));
    const v7VisitorsSet = new Set((v7Visitors.data ?? []).map((r) => r.session_id as string));
    stats.traffic = {
      viewsToday: tViews.count ?? 0,
      visitorsToday: todayVisitorsSet.size,
      views7d: v7Views.count ?? 0,
      visitors7d: v7VisitorsSet.size,
      topPages: [],
      topReferrers: [],
      devices: [],
      peakHours: [],
    };

    const pageMap = new Map<string, number>();
    for (const r of (topPagesRes.data ?? []) as Array<{ path: string | null }>) {
      const path = (r.path ?? "/").slice(0, 120);
      pageMap.set(path, (pageMap.get(path) ?? 0) + 1);
    }
    stats.traffic.topPages = [...pageMap.entries()]
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);

    const refMap = new Map<string, number>();
    for (const r of (referrersRes.data ?? []) as Array<{ referrer: string | null }>) {
      const ref = r.referrer ? new URL(r.referrer).hostname : "direct";
      refMap.set(ref, (refMap.get(ref) ?? 0) + 1);
    }
    stats.traffic.topReferrers = [...refMap.entries()]
      .map(([referrer, views]) => ({ referrer, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);

    const hourMap = new Map<number, number>();
    for (const r of (peakRes.data ?? []) as Array<{ created_at: string }>) {
      const h = clinicHour(r.created_at);
      hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
    }
    for (let h = 0; h < 24; h++) hourMap.set(h, hourMap.get(h) ?? 0);
    stats.traffic.peakHours = [...hourMap.entries()]
      .map(([hour, views]) => ({ hour, views }))
      .sort((a, b) => a.hour - b.hour);

    // Devices come from live sessions (device is only known while live).
    const deviceMap = new Map<string, number>();
    for (const r of liveRows) {
      const d = (r.device || "unknown").toLowerCase();
      deviceMap.set(d, (deviceMap.get(d) ?? 0) + 1);
    }
    stats.traffic.devices = [...deviceMap.entries()].map(([device, count]) => ({ device, count }));

    const funnelCounts = new Map<string, number>();
    for (const r of (funnelRes.data ?? []) as Array<{ event_name: string }>) {
      funnelCounts.set(r.event_name, (funnelCounts.get(r.event_name) ?? 0) + 1);
    }
    const bookingStarted = funnelCounts.get("booking_started") ?? 0;
    const bookingCompleted = funnelCounts.get("booking_completed") ?? 0;
    const appointmentCreated = funnelCounts.get("appointment_created") ?? 0;
    stats.funnel = {
      bookingStarted,
      bookingCompleted,
      appointmentCreated,
      orderPlaced: funnelCounts.get("order_placed") ?? 0,
      login: funnelCounts.get("login") ?? 0,
      signup: funnelCounts.get("signup") ?? 0,
      paymentSubmitted: funnelCounts.get("payment_submitted") ?? 0,
      startedToCompletedPct:
        bookingStarted > 0 ? Math.round((bookingCompleted / bookingStarted) * 100) : 0,
      completedToCreatedPct:
        bookingCompleted > 0 ? Math.round((appointmentCreated / bookingCompleted) * 100) : 0,
    };

    stats.recent = (
      (recentRes.data ?? []) as Array<{
        id: string;
        event_name: string;
        path: string | null;
        user_type: string;
        created_at: string;
      }>
    ).map((r) => ({
      id: r.id,
      event: r.event_name,
      path: r.path,
      userType: r.user_type,
      createdAt: r.created_at,
    }));

    stats.ok = true;
    return stats;
  } catch (e) {
    console.error(
      "[analytics] getLiveAnalytics failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return stats;
  }
}
