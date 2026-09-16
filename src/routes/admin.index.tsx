import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { CalendarCheck, Clock, Users, Activity, Loader2, Truck, ArrowRight } from "lucide-react";
import {
  useAppointments,
  useDashboardStats,
  useRecentPatients,
  usePatientById,
} from "@/hooks/queries/useAdmin";
import { useStoreSettings } from "@/hooks/queries/useShop";
import { DEFAULT_STORE_SETTINGS } from "@/lib/delivery";
import { formatTimeDisplay } from "@/lib/bookings";
import { QueryError } from "@/components/admin/QueryError";
import { ChatUsagePanel } from "@/components/admin/ChatUsagePanel";
import { LiveKitUsagePanel } from "@/components/admin/LiveKitUsagePanel";
import { usePageFocus, useFocusHighlight } from "@/hooks/usePageFocus";

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
  const { data: recentPatients, isLoading: recentLoading } = useRecentPatients();
  const { data: storeSettings, isLoading: settingsLoading } = useStoreSettings();
  const delivery = storeSettings ?? DEFAULT_STORE_SETTINGS;

  // Deep-link focus: "New patient registration" notifications navigate to
  // /admin?focus=patient&id=<uuid> — the exact patient is pinned on top of the
  // Recent patients list and highlighted.
  const pageFocus = usePageFocus();
  const patientFocus = pageFocus?.focus === "patient" ? pageFocus : null;
  const { data: focusPatient } = usePatientById(patientFocus?.id ?? null);

  useFocusHighlight({ focus: patientFocus, ready: !recentLoading });

  const today = new Date().toISOString().split("T")[0];
  const todayAppts = (appointments ?? []).filter((a) => a.date === today).slice(0, 5);

  const recentPatientsList = useMemo(() => {
    const base = recentPatients ?? [];
    if (focusPatient && !base.some((p) => p.id === focusPatient.id)) {
      return [focusPatient, ...base];
    }
    return base;
  }, [recentPatients, focusPatient]);

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

      {/* Store delivery charges — status + shortcut to the settings page. */}
      <div className="mt-6 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Truck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Delivery Charges</div>
              <div className="text-xs text-muted-foreground">
                {settingsLoading
                  ? "Loading…"
                  : delivery.delivery_is_active
                    ? `Enabled — Rs. ${delivery.delivery_charge.toLocaleString()} per order${
                        delivery.free_delivery_threshold != null
                          ? ` · free over Rs. ${delivery.free_delivery_threshold.toLocaleString()}`
                          : ""
                      }`
                    : "No delivery charge is added to product orders"}
              </div>
            </div>
          </div>
          <Link
            to="/admin/settings"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-card transition hover:brightness-[1.05]"
          >
            Manage delivery charges <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
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

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Recent patients</h2>
        <div className="mt-3 rounded-xl border bg-card">
          {recentLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentPatientsList.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No patients yet</p>
          ) : (
            <div className="divide-y">
              {recentPatientsList.map((p) => (
                <div
                  key={p.id}
                  data-focus-id={p.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {p.full_name || "Unnamed patient"}
                    </div>
                    {p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Joined {format(new Date(p.created_at), "MMM d, yyyy")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <LiveKitUsagePanel />
      <ChatUsagePanel />
    </div>
  );
}
