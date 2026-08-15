import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Bell,
  CheckCheck,
  Video,
  CalendarX,
  Loader2,
  Calendar,
  Package,
  FolderOpen,
  Inbox,
  FlaskConical,
  Link2,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useMyAppointments,
  useMyNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useCancelMyAppointment,
  useRescheduleMyAppointment,
  useMyTestRecommendations,
  useMarkTestRecommendationCompleted,
} from "@/hooks/queries/usePatient";
import { formatTimeDisplay } from "@/lib/bookings";
import { scrollToHash } from "@/lib/scroll";
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

function TestRecommendationsPanel() {
  const { data: recommendations, isLoading, isError, error } = useMyTestRecommendations();
  const markCompleted = useMarkTestRecommendationCompleted();

  async function handleConfirm(id: string) {
    const result = await markCompleted.mutateAsync(id);
    if (result?.error) return;
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <FlaskConical className="h-4 w-4 text-primary" />
        <span className="font-display font-semibold text-foreground">Test Recommendations</span>
        {!isLoading && (recommendations ?? []).length > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
            {(recommendations ?? []).length}
          </span>
        )}
      </div>
      {isError && (
        <div className="p-4">
          <QueryError error={error} />
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (recommendations ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No test recommendations yet. Your doctor will add any recommended tests here.
          </p>
        </div>
      ) : (
        <div className="max-h-72 divide-y overflow-auto">
          {(recommendations ?? []).map((r) => (
            <div key={r.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{r.test_name}</span>
                  <Badge
                    className={
                      r.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }
                  >
                    {r.status === "completed" ? "Completed" : "Pending"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, yyyy")}
                  </span>
                  {r.status !== "completed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs text-primary"
                      disabled={markCompleted.isPending}
                      onClick={() => handleConfirm(r.id)}
                    >
                      {markCompleted.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCheck className="h-3.5 w-3.5" />
                      )}
                      Test done
                    </Button>
                  )}
                </div>
              </div>
              {r.notes && <p className="mt-0.5 text-xs text-muted-foreground">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Extract a VC-XXXXXX code from a full meeting link, path, or bare code. */
function extractVcCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Bare code: VC-4K7M92
  const bare = trimmed.match(/^VC-[A-Z0-9]{6}$/i);
  if (bare) return bare[0].toUpperCase();
  // URL or path: https://site/video/VC-4K7M92 or /video/VC-4K7M92
  const inPath = trimmed.match(/\/video\/(VC-[A-Z0-9]{6})/i);
  if (inPath) return inPath[1].toUpperCase();
  return null;
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

function JoinVideoDialog({
  appointment,
  onClose,
}: {
  appointment: import("@/lib/patient-data").PatientAppointment;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const prefillLink = appointment.vcNo ? `${window.location.origin}/video/${appointment.vcNo}` : "";
  const [link, setLink] = useState(prefillLink);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleJoin() {
    setError("");
    const vcNo = extractVcCode(link);
    if (!vcNo) {
      setError(
        "That link doesn't look right. Paste the full meeting link (e.g. https://your-site/video/VC-4K7M92) or the VC-XXXXXX code.",
      );
      return;
    }
    if (!name.trim()) {
      setError("Enter your name to join the call.");
      return;
    }
    navigate({
      to: "/video/$vcNo",
      params: { vcNo },
      search: { name: name.trim() },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Video Consultation</DialogTitle>
          <DialogDescription>
            Paste the meeting link your doctor shared and enter your name to join the same call.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="joinLink">Meeting link</Label>
            <Input
              id="joinLink"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste meeting link (…/video/VC-XXXXXX)"
              className="h-10"
            />
            {appointment.vcNo && (
              <p className="text-xs text-muted-foreground">
                Your appointment's link is pre-filled. You can paste a different link if the doctor
                shared one.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="joinName">Your name</Label>
            <Input
              id="joinName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="h-10"
            />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleJoin} className="gap-1.5">
              <Video className="h-4 w-4" /> Join Video Call
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PatientDashboard() {
  const router = useRouter();
  const { data: appointments, isLoading, isError, error } = useMyAppointments();
  const cancel = useCancelMyAppointment();
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [joiningVideo, setJoiningVideo] = useState<
    import("@/lib/patient-data").PatientAppointment | null
  >(null);

  async function goToBookingSection(e: React.MouseEvent) {
    e.preventDefault();
    if (window.location.pathname !== "/") {
      await router.navigate({ to: "/", hash: "booking" });
    }
    scrollToHash("booking");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Appointments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your upcoming and past consultations
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/#booking"
            onClick={goToBookingSection}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-glass active:scale-[0.97]"
          >
            <Calendar className="h-4 w-4" /> Book Appointment
          </a>
          <Link
            to="/booking"
            search={{ mode: "video" }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted hover:shadow-soft active:scale-[0.97]"
          >
            <Video className="h-4 w-4 text-primary" /> Video Consultation
          </Link>
        </div>
      </div>

      {isError && <QueryError error={error} />}

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
                  {a.isVideo && a.vcNo && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="text-xs text-muted-foreground">Meeting link:</span>
                      <code className="max-w-[14rem] truncate rounded bg-background px-2 py-0.5 font-mono text-xs text-foreground">
                        {window.location.origin}/video/{a.vcNo}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard.writeText(`${window.location.origin}/video/${a.vcNo}`)
                        }
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary transition hover:bg-primary/10"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.isVideo && (
                    <button
                      type="button"
                      onClick={() => setJoiningVideo(a)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                    >
                      <Video className="h-3.5 w-3.5" /> Join Video Consultation
                    </button>
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

      <TestRecommendationsPanel />

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

      {joiningVideo && (
        <JoinVideoDialog appointment={joiningVideo} onClose={() => setJoiningVideo(null)} />
      )}
    </div>
  );
}
