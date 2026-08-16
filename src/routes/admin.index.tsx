import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Clock, Users, Activity } from "lucide-react";
import { useAppointments, useDashboardStats } from "@/hooks/queries/useAdmin";
import { formatTimeDisplay } from "@/lib/bookings";
import { QueryError } from "@/components/admin/QueryError";
import { ChatUsagePanel } from "@/components/admin/ChatUsagePanel";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErr,
  } = useDashboardStats();
  const {
    data: appointments,
    isError: appointmentsError,
    error: appointmentsErr,
  } = useAppointments();

  const today = new Date().toISOString().split("T")[0];
  const todayAppts = (appointments ?? []).filter((a) => a.date === today).slice(0, 5);

  const cards = [
    {
      label: "Total Appointments",
      value: stats?.totalAppointments ?? 0,
      Icon: CalendarCheck,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      label: "Pending",
      value: stats?.pendingAppointments ?? 0,
      Icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      label: "Today",
      value: stats?.todayAppointments ?? 0,
      Icon: Activity,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      label: "Total Patients",
      value: stats?.totalPatients ?? 0,
      Icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Overview of your clinic</p>

      {(statsError || appointmentsError) && (
        <div className="mt-4">
          <QueryError error={statsErr ?? appointmentsErr} />
        </div>
      )}

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
                <div className="text-2xl font-bold text-foreground">
                  {statsLoading ? "—" : value}
                </div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Today's Appointments</h2>
        <div className="mt-3 rounded-xl border bg-card">
          {todayAppts.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No appointments today</p>
          ) : (
            <div className="divide-y">
              {todayAppts.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {a.patient_name ?? "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground">{a.service_name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {a.time ? formatTimeDisplay(a.time) : "Flexible"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                        a.status === "confirmed"
                          ? "bg-green-100 text-green-700"
                          : a.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : a.status === "rejected" || a.status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ChatUsagePanel />
    </div>
  );
}
