import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInClinic } from "@/lib/clinic";

/**
 * Admin analytics aggregations (server-side, service-role). Reads only —
 * computed on demand for the admin Analytics dashboard.
 */

export interface AnalyticsStats {
  ok: boolean;
  appointments: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    rejected: number;
  };
  /** Last 30 days, keyed "yyyy-MM-dd" -> count, ascending. */
  appointmentTrend: Array<{ date: string; count: number }>;
  revenue: {
    /** Sum of payment_amount for verified/waived video consultations. */
    total: number;
    thisMonth: number;
    verifiedPayments: number;
  };
  topServices: Array<{ name: string; count: number }>;
  patients: {
    total: number;
    /** Rows with a linked patient_id (registered users). */
    registered: number;
  };
}

function emptyStats(): AnalyticsStats {
  return {
    ok: false,
    appointments: {
      total: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
    },
    appointmentTrend: [],
    revenue: { total: 0, thisMonth: 0, verifiedPayments: 0 },
    topServices: [],
    patients: { total: 0, registered: 0 },
  };
}

export async function getAnalytics(admin: SupabaseClient): Promise<AnalyticsStats> {
  const today = todayInClinic();
  const monthStart = `${today.slice(0, 7)}-01`;

  try {
    const [
      totalRes,
      pendingRes,
      confirmedRes,
      completedRes,
      cancelledRes,
      rejectedRes,
      revRes,
      topRes,
      patientsRes,
      trendRes,
      registeredRes,
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
      admin
        .from("appointments")
        .select("payment_amount, date")
        .in("payment_status", ["payment_verified", "waived"])
        .order("date", { ascending: false })
        .limit(10000),
      admin
        .from("appointments")
        .select("services:service_id (name)")
        .not("status", "in", '("cancelled","rejected","no_show")')
        .order("date", { ascending: false })
        .limit(5000),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("appointments").select("id, date").gte("date", monthStart).limit(10000),
      admin.from("appointments").select("patient_id").not("patient_id", "is", null).limit(10000),
    ]);

    const total = totalRes.count ?? 0;
    const stats = emptyStats();
    stats.ok = true;
    stats.appointments = {
      total,
      pending: pendingRes.count ?? 0,
      confirmed: confirmedRes.count ?? 0,
      completed: completedRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
      rejected: rejectedRes.count ?? 0,
    };

    const revRows = (revRes.data ?? []) as Array<{
      payment_amount: number | null;
      date: string | null;
    }>;
    const currentMonth = `${today.slice(0, 7)}-`;
    let revenueTotal = 0;
    let revenueThisMonth = 0;
    for (const r of revRows) {
      const amount = Number(r.payment_amount ?? 0);
      revenueTotal += amount;
      if ((r.date ?? "").slice(0, 7) === today.slice(0, 7)) revenueThisMonth += amount;
    }
    stats.revenue = {
      total: revenueTotal,
      thisMonth: revenueThisMonth,
      verifiedPayments: revRows.length,
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

    const trendMap = new Map<string, number>();
    for (const r of (trendRes.data ?? []) as Array<{ date: string }>) {
      const key = (r.date ?? "").slice(0, 10);
      if (!key) continue;
      trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    }
    stats.appointmentTrend = [...trendMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const registered = new Set(
      (registeredRes.data ?? []).map((r) => r.patient_id as string).filter(Boolean),
    ).size;

    stats.patients = { total: patientsRes.count ?? 0, registered };

    return stats;
  } catch {
    return emptyStats();
  }
}
