import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheck,
  Clock,
  DollarSign,
  Users,
  Activity,
  TrendingUp,
  Package,
  LifeBuoy,
  ShoppingBag,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { useAnalytics } from "@/hooks/queries/useAdminExtra";
import { QueryError } from "@/components/admin/QueryError";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { AnalyticsStats } from "@/lib/server/analytics";

export const Route = createFileRoute("/admin/analytics")({
  component: AdminAnalytics,
});

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
] as const;

const TREND_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6"];

function AdminAnalytics() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30d");
  const { data: stats, isLoading, isError, error } = useAnalytics(range);

  if (isError) return <QueryError error={error} />;
  if (isLoading || !stats) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const cards = [
    {
      label: "Appointments",
      value: stats.appointments.total.toLocaleString(),
      sub: `${stats.appointments.withinRange.toLocaleString()} in range`,
      Icon: CalendarCheck,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      label: "Pending appointments",
      value: stats.appointments.pending.toLocaleString(),
      sub: `${stats.appointments.confirmed.toLocaleString()} confirmed`,
      Icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      label: "Revenue (verified)",
      value: `Rs. ${stats.revenue.total.toLocaleString()}`,
      sub: `Rs. ${stats.revenue.withinRange.toLocaleString()} in range`,
      Icon: DollarSign,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
    {
      label: "Completed",
      value: stats.appointments.completed.toLocaleString(),
      sub: `${stats.appointments.cancelled.toLocaleString()} cancelled`,
      Icon: Activity,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      label: "Patients",
      value: stats.patients.total.toLocaleString(),
      sub: `${stats.patients.registered.toLocaleString()} registered`,
      Icon: Users,
      color: "text-teal-600",
      bg: "bg-teal-100",
    },
    {
      label: "Orders",
      value: stats.orders.total.toLocaleString(),
      sub: `${stats.orders.withinRange.toLocaleString()} in range`,
      Icon: Package,
      color: "text-indigo-600",
      bg: "bg-indigo-100",
    },
    {
      label: "Order revenue",
      value: `Rs. ${stats.orders.paidRevenue.toLocaleString()}`,
      sub: `${stats.orders.delivered.toLocaleString()} delivered`,
      Icon: ShoppingBag,
      color: "text-orange-600",
      bg: "bg-orange-100",
    },
    {
      label: "Support inbox",
      value: stats.support.total.toLocaleString(),
      sub: `${stats.support.new.toLocaleString()} new`,
      Icon: LifeBuoy,
      color: "text-rose-600",
      bg: "bg-rose-100",
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Clinic performance overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                range === r.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, sub, Icon, color, bg }) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg} ${color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xl font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-[10px] text-muted-foreground/70">{sub}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            Appointments trend
            <span className="text-xs font-normal text-muted-foreground">({rangeLabel(range)})</span>
          </div>
          {trendEmpty(stats) ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No data in this range</p>
          ) : (
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.appointmentTrend}
                  margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="apptFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-border"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip content={<TrendTooltip metric="Appointments" />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    fill="url(#apptFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ShoppingBag className="h-4 w-4 text-primary" />
            Orders trend
            <span className="text-xs font-normal text-muted-foreground">({rangeLabel(range)})</span>
          </div>
          {orderTrendEmpty(stats) ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No data in this range</p>
          ) : (
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.orderTrend}
                  margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="orderFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-border"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip content={<TrendTooltip metric="Orders" />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#orderFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Activity className="h-4 w-4 text-primary" />
            Top services
          </div>
          {stats.topServices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No service data yet</p>
          ) : (
            <div className="mt-4 space-y-2">
              {stats.topServices.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="truncate text-foreground">{s.name}</span>
                  <span className="ml-2 shrink-0 font-medium text-muted-foreground">{s.count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Appointment status
            </div>
            <div className="mt-3 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Pending", value: stats.appointments.pending },
                    { name: "Confirmed", value: stats.appointments.confirmed },
                    { name: "Completed", value: stats.appointments.completed },
                    { name: "Cancelled", value: stats.appointments.cancelled },
                    { name: "Rejected", value: stats.appointments.rejected },
                  ]}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-border"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={82}
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip content={<StatusTooltip />} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {TREND_COLORS.map((c) => (
                      <Cell key={c} fill={c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            Patients
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/40 p-4">
              <div className="text-2xl font-bold text-foreground">
                {stats.patients.total.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Total profiles</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-4">
              <div className="text-2xl font-bold text-foreground">
                {stats.patients.registered.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Registered</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-4">
              <div className="text-2xl font-bold text-foreground">
                {stats.patients.newInRange.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">New {rangeLabel(range)}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <LifeBuoy className="h-4 w-4 text-primary" />
              Support inbox
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "New", value: stats.support.new, color: "text-amber-600" },
                { label: "In progress", value: stats.support.inProgress, color: "text-blue-600" },
                { label: "Resolved", value: stats.support.resolved, color: "text-green-600" },
                { label: "Closed", value: stats.support.closed, color: "text-muted-foreground" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-muted/40 p-3">
                  <div className={cn("text-xl font-bold", s.color)}>{s.value.toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Package className="h-4 w-4 text-primary" />
              Order status
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: "Pending", value: stats.orders.pending },
                { label: "Confirmed", value: stats.orders.confirmed },
                { label: "Shipped", value: stats.orders.shipped },
                { label: "Delivered", value: stats.orders.delivered },
                { label: "Cancelled", value: stats.orders.cancelled },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xl font-bold text-foreground">
                    {s.value.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function rangeLabel(range: (typeof RANGES)[number]["key"]): string {
  return RANGES.find((r) => r.key === range)?.label ?? "";
}

function trendEmpty(stats: AnalyticsStats): boolean {
  return (stats.appointmentTrend ?? []).every((t) => t.count === 0);
}

function orderTrendEmpty(stats: AnalyticsStats): boolean {
  return (stats.orderTrend ?? []).every((t) => t.count === 0);
}

function shortDate(value: string): string {
  try {
    return format(new Date(`${value}T00:00:00Z`), "MMM d");
  } catch {
    return value;
  }
}

function TrendTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  metric: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-soft">
      <div className="font-semibold text-foreground">
        {metric}: <span className="text-primary">{payload[0]?.value?.toLocaleString()}</span>
      </div>
      <div className="mt-0.5 text-muted-foreground">{label ? shortDate(String(label)) : ""}</div>
    </div>
  );
}

function StatusTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-soft">
      <div className="font-semibold text-foreground">
        {label}: <span className="text-primary">{payload[0]?.value?.toLocaleString()}</span>
      </div>
    </div>
  );
}
