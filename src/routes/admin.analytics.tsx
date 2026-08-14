import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2,
  CalendarCheck,
  Clock,
  DollarSign,
  Users,
  Activity,
  TrendingUp,
} from "lucide-react";
import { useAnalytics } from "@/hooks/queries/useAdminExtra";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/analytics")({
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const { data: stats, isLoading, isError, error } = useAnalytics();

  if (isError) return <QueryError error={error} />;
  if (isLoading || !stats) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cards = [
    {
      label: "Total Appointments",
      value: stats.appointments.total,
      Icon: CalendarCheck,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      label: "Pending",
      value: stats.appointments.pending,
      Icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      label: "Completed",
      value: stats.appointments.completed,
      Icon: Activity,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      label: "Total Revenue",
      value: `Rs. ${stats.revenue.total.toLocaleString()}`,
      Icon: DollarSign,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
  ];

  const maxTrend = Math.max(1, ...stats.appointmentTrend.map((t) => t.count));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">Clinic performance overview</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, Icon, color, bg }) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg} ${color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            Appointment trend (this month)
          </div>
          {stats.appointmentTrend.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
          ) : (
            <div className="mt-4 flex h-40 items-end gap-1">
              {stats.appointmentTrend.map((t) => (
                <div key={t.date} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="hidden text-[10px] text-muted-foreground group-hover:block">
                    {t.count}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary/70 transition hover:bg-primary"
                    style={{ height: `${Math.max(4, (t.count / maxTrend) * 140)}px` }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            Patients
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/40 p-4">
              <div className="text-2xl font-bold text-foreground">{stats.patients.total}</div>
              <div className="text-xs text-muted-foreground">Total profiles</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-4">
              <div className="text-2xl font-bold text-foreground">{stats.patients.registered}</div>
              <div className="text-xs text-muted-foreground">Registered accounts</div>
            </div>
          </div>

          <div className="mt-5 font-semibold text-foreground">Top Services</div>
          {stats.topServices.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No service data yet</p>
          ) : (
            <div className="mt-2 space-y-2">
              {stats.topServices.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="text-foreground">{s.name}</span>
                  <span className="font-medium text-muted-foreground">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
