import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Bell,
  CheckCheck,
  Video,
  CalendarX,
  Loader2,
  CalendarClock,
  Package,
  FolderOpen,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  useMyAppointments,
  useMyNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useCancelMyAppointment,
  useRescheduleMyAppointment,
  useClaimAppointment,
} from "@/hooks/queries/usePatient";
import { formatTimeDisplay } from "@/lib/bookings";
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatusValue } from "@/lib/notifications";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/patient/")({
  component: PatientDashboard,
});

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
  arrived: "bg-teal-100 text-teal-700",
  no_show: "bg-gray-100 text-gray-700",
};

function NotificationsPanel() {
  const { data: notifications, isError, error } = useMyNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = (notifications ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 font-display font-semibold text-foreground">
          <Bell className="h-4 w-4 text-primary" />
          Notifications
          {unread > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>
      {isError && (
        <div className="p-4">
          <QueryError error={error} />
        </div>
      )}
      <div className="max-h-72 overflow-auto">
        {(notifications ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          (notifications ?? []).map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read_at && markRead.mutate(n.id)}
              className={`block w-full border-b border-border/60 px-5 py-3 text-left last:border-0 ${
                n.read_at ? "opacity-60" : "bg-primary/5"
              }`}
            >
              <div className="text-sm font-medium text-foreground">{n.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {format(new Date(n.created_at), "MMM d, h:mm a")}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ClaimSection() {
  const [appointmentNo, setAppointmentNo] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const claim = useClaimAppointment();

  async function handleClaim() {
    setMsg("");
    const result = await claim.mutateAsync({
      appointmentId: appointmentNo.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    });
    setMsg(result.error ?? "Appointment linked to your account.");
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h3 className="font-display font-semibold text-foreground">Link an existing appointment</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Booked earlier without signing in? Enter your Appointment ID and the phone/email you used to
        link it to your account.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Input
          value={appointmentNo}
          onChange={(e) => setAppointmentNo(e.target.value)}
          placeholder="Appointment ID (e.g. AP-xxxx)"
        />
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
        />
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
        />
      </div>
      <Button
        onClick={handleClaim}
        disabled={claim.isPending || !appointmentNo.trim()}
        className="mt-3 h-9 rounded-xl text-xs"
        size="sm"
      >
        {claim.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Link appointment
      </Button>
      {msg && <p className="mt-2 text-xs font-medium text-primary">{msg}</p>}
    </div>
  );
}

function RescheduleDialog({
  appointment,
  onClose,
}: {
  appointment: import("@/lib/patient-data").PatientAppointment;
  onClose: () => void;
}) {
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(appointment.time ?? "");
  const [msg, setMsg] = useState("");
  const reschedule = useRescheduleMyAppointment();

  async function handleSave() {
    setMsg("");
    const result = await reschedule.mutateAsync({
      id: appointment.id,
      date,
      time: time || null,
    });
    setMsg(result.error ?? "Appointment rescheduled.");
    if (!result.error) onClose();
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="text-sm font-semibold text-foreground">Reschedule</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input
          type="date"
          value={date}
          min={format(new Date(), "yyyy-MM-dd")}
          onChange={(e) => setDate(e.target.value)}
        />
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Flexible"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={reschedule.isPending}
          className="h-8 text-xs"
        >
          {reschedule.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">
          Cancel
        </Button>
      </div>
      {msg && <p className="mt-2 text-xs font-medium text-primary">{msg}</p>}
    </div>
  );
}

function PatientDashboard() {
  const { data: appointments, isLoading, isError, error } = useMyAppointments();
  const cancel = useCancelMyAppointment();
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Appointments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your upcoming and past consultations
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/booking"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground shadow-card transition hover:brightness-[1.05]"
          >
            <CalendarClock className="h-4 w-4" /> Book New
          </Link>
        </div>
      </div>

      {isError && <QueryError error={error} />}
      {claimMsg && (
        <Alert>
          <AlertDescription>{claimMsg}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (appointments ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No appointments yet. Book one to get started.
            </p>
          </div>
        ) : (
          (appointments ?? []).map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold text-foreground">
                      {a.serviceName ?? "Appointment"}
                    </span>
                    <Badge className={`${statusStyles[a.status] ?? statusStyles.pending}`}>
                      {APPOINTMENT_STATUS_LABELS[a.status as AppointmentStatusValue] ?? a.status}
                    </Badge>
                    {a.isVideo && (
                      <Badge className="bg-purple-100 text-purple-700">
                        <Video className="mr-1 h-3 w-3" /> Video
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {format(new Date(`${a.date}T00:00:00`), "EEEE, MMMM d, yyyy")}
                    {a.time && <> at {formatTimeDisplay(a.time)}</>}
                  </div>
                  {a.appointmentNo && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      ID: {a.appointmentNo}
                    </div>
                  )}
                  {a.offerTitle && (
                    <div className="mt-0.5 text-xs font-medium text-primary">
                      Offer: {a.offerTitle}
                    </div>
                  )}
                  {a.notes && <div className="mt-1 text-xs text-muted-foreground">{a.notes}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.isVideo && a.vcNo && (
                    <Link
                      to="/video/$vcNo"
                      params={{ vcNo: a.vcNo }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                    >
                      <Video className="h-3.5 w-3.5" /> Join
                    </Link>
                  )}
                  {a.canCancel && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs text-red-600"
                      onClick={() => cancel.mutate(a.id)}
                    >
                      <CalendarX className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                  {a.canReschedule && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs"
                      onClick={() => setReschedulingId(reschedulingId === a.id ? null : a.id)}
                    >
                      Reschedule
                    </Button>
                  )}
                </div>
              </div>
              {reschedulingId === a.id && (
                <RescheduleDialog appointment={a} onClose={() => setReschedulingId(null)} />
              )}
            </div>
          ))
        )}
      </div>

      <ClaimSection />

      <div className="grid gap-6 lg:grid-cols-2">
        <NotificationsPanel />
        <div className="space-y-4">
          <Link
            to="/patient/documents"
            className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-primary" />
              <div>
                <div className="font-display font-semibold text-foreground">My Documents</div>
                <div className="text-xs text-muted-foreground">
                  Upload reports and prescriptions for your visits
                </div>
              </div>
            </div>
            <span className="text-muted-foreground">→</span>
          </Link>
          <Link
            to="/patient/orders"
            className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <div className="font-display font-semibold text-foreground">My Orders</div>
                <div className="text-xs text-muted-foreground">
                  Track your product and medicine orders
                </div>
              </div>
            </div>
            <span className="text-muted-foreground">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
