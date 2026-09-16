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
