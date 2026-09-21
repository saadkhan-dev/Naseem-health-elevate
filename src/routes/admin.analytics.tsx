import { useEffect, useState } from "react";
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
  Radio,
  Globe,
  Link2,
  MousePointerClick,
  RefreshCw,
  UserRound,
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
import { useAnalytics, useLiveAnalytics } from "@/hooks/queries/useAdminExtra";
import { QueryError } from "@/components/admin/QueryError";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { AnalyticsStats, LiveAnalytics } from "@/lib/server/analytics";
import { staffSupabase } from "@/lib/supabase";

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
  const { data: live, refetch: refetchLive, isFetching: liveFetching } = useLiveAnalytics();

  useEffect(() => {
    const channel = staffSupabase
      .channel("admin-analytics-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions" }, () => {
        void refetchLive();
      })
      .subscribe();
    return () => {
      void staffSupabase.removeChannel(channel);
    };
  }, [refetchLive]);

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

      <LiveNow live={live} fetching={liveFetching} onRefresh={() => void refetchLive()} />

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

      <LiveTraffic live={live} />

      <LiveFunnel live={live} />

      <RecentActivity live={live} />
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  page_view: "Page view",
  booking_started: "Booking started",
  booking_completed: "Booking completed",
  booking_abandoned: "Booking abandoned",
  appointment_created: "Appointment created",
  order_placed: "Order placed",
  payment_submitted: "Payment submitted",
  login: "Login",
  signup: "Signup",
  video_joined: "Video joined",
  video_ended: "Video ended",
  product_view: "Product view",
};

function shortPath(path: string | null): string {
  const raw = path || "/";
  const withoutQuery = raw.split("?")[0];
  return withoutQuery.length > 40 ? `${withoutQuery.slice(0, 39)}…` : withoutQuery;
}

function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event.replace(/_/g, " ");
}

function isTodayOrRecent(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, HH:mm");
  } catch {
    return iso;
  }
}

function LiveNow({
  live,
  fetching,
  onRefresh,
}: {
  live: LiveAnalytics | undefined;
  fetching: boolean;
  onRefresh: () => void;
}) {
  const present = live && live.live.onlineNow > 0;
  return (
    <div className="mt-6 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Radio className="h-4 w-4 text-emerald-500" />
          Live now
          {present && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          )}
          <span className="ml-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
            {present ? live.live.onlineNow : 0} online
          </span>
        </div>
        <div className="flex items-center gap-3">
          {live?.live.updatedAt && (
            <span className="text-xs text-muted-foreground">
              Updated {isTodayOrRecent(live.live.updatedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={fetching}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LiveMetric label="Staff" value={live?.live.staff ?? 0} />
        <LiveMetric label="Patients" value={live?.live.patients ?? 0} />
        <LiveMetric label="Guests" value={live?.live.guests ?? 0} />
      </div>

      {present && (
        <div className="mt-4 space-y-1.5">
          {live.live.active.slice(0, 10).map((s) => (
            <div
              key={s.session_id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-1.5 text-xs"
            >
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <UserRound className="h-3 w-3 text-muted-foreground" />
                {s.userType === "staff" ? s.role || "Staff" : s.userType}
              </span>
              <span className="truncate font-mono text-muted-foreground">{shortPath(s.path)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-xl font-bold text-foreground">{value.toLocaleString()}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function LiveTraffic({ live }: { live: LiveAnalytics | undefined }) {
  const t = live?.traffic;
  const peakData =
    t?.peakHours?.map((p) => ({ hour: `${String(p.hour).padStart(2, "0")}:00`, views: p.views })) ??
    [];
  const maxViews = Math.max(1, ...peakData.map((p) => p.views));
  return (
    <div className="mt-8 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <Globe className="h-4 w-4 text-primary" />
        Website traffic
        <span className="text-xs font-normal text-muted-foreground">(last 7 days)</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LiveMetric label="Views today" value={t?.viewsToday ?? 0} />
        <LiveMetric label="Visitors today" value={t?.visitorsToday ?? 0} />
        <LiveMetric label="Views (7d)" value={t?.views7d ?? 0} />
        <LiveMetric label="Visitors (7d)" value={t?.visitors7d ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MousePointerClick className="h-4 w-4 text-primary" />
            Top pages
          </div>
          <div className="mt-3 space-y-2">
            {(t?.topPages ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No page views yet</p>
            ) : (
              t!.topPages.map((p) => (
                <div key={p.path} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs text-foreground">
                      {shortPath(p.path)}
                    </span>
                    <span className="shrink-0 font-medium text-muted-foreground">{p.views}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, (p.views / Math.max(1, t!.topPages[0].views)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Link2 className="h-4 w-4 text-primary" />
            Top referrers
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(t?.topReferrers ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No referrer data</p>
            ) : (
              t!.topReferrers.map((r) => (
                <div key={r.referrer} className="rounded-lg bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-foreground">
                      {r.referrer}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.views}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-primary" />
            Peak hours
          </div>
          <div className="mt-3 h-40">
            {peakData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-border"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="hour"
                    interval={3}
                    tick={{ fontSize: 9 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 9 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    content={(props) =>
                      props.active && props.payload?.length ? (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-soft">
                          <span className="font-semibold text-foreground">{props.label}</span>:{" "}
                          <span className="text-primary">{props.payload[0]?.value}</span>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="views" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity className="h-4 w-4 text-primary" />
            Live device split
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(t?.devices ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No live sessions right now
              </p>
            ) : (
              t!.devices.map((d) => {
                const total = Math.max(1, ...t!.devices.map((x) => x.count));
                return (
                  <div key={d.device} className="rounded-lg bg-muted/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium capitalize text-foreground">
                        {d.device}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{d.count}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${(d.count / total) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveFunnel({ live }: { live: LiveAnalytics | undefined }) {
  const f = live?.funnel;
  return (
    <div className="mt-6 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <TrendingUp className="h-4 w-4 text-primary" />
        Booking funnel
        <span className="text-xs font-normal text-muted-foreground">(last 30 days)</span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FunnelStep
          label="Started booking"
          value={f?.bookingStarted ?? 0}
          highlight
          hint={`${f?.startedToCompletedPct ?? 0}% completed`}
        />
        <FunnelStep
          label="Completed form"
          value={f?.bookingCompleted ?? 0}
          hint={`${f?.completedToCreatedPct ?? 0}% created`}
        />
        <FunnelStep label="Appointments created" value={f?.appointmentCreated ?? 0} />
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 lg:col-span-1">
          <div>
            <div className="text-lg font-bold text-foreground">
              {(f?.orderPlaced ?? 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground">Orders placed</div>
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">
              {(f?.paymentSubmitted ?? 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground">Payments submitted</div>
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">
              {(f?.login ?? 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground">Logins</div>
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">
              {(f?.signup ?? 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground">Signups</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-lg p-3", highlight ? "bg-emerald-500/10" : "bg-muted/40")}>
      <div className={cn("text-2xl font-bold", highlight ? "text-emerald-600" : "text-foreground")}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

function RecentActivity({ live }: { live: LiveAnalytics | undefined }) {
  const recent = live?.recent ?? [];
  return (
    <div className="mt-6 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <Activity className="h-4 w-4 text-primary" />
        Recent activity
        <span className="text-xs font-normal text-muted-foreground">(last 7 days)</span>
      </div>
      {recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No tracked events yet</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {recent.slice(0, 20).map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-1.5 text-xs"
            >
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="h-3 w-3 text-primary" />
                {eventLabel(e.event)}
              </span>
              <span className="truncate font-mono text-muted-foreground">{shortPath(e.path)}</span>
              <span className="ml-auto shrink-0 pl-3 text-muted-foreground/70">
                {e.userType} · {isTodayOrRecent(e.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
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
