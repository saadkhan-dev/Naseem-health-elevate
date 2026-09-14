import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Video,
  CalendarX,
  Loader2,
  CheckCheck,
  Calendar,
  Package,
  FolderOpen,
  FlaskConical,
  Link2,
  Copy,
  MessageSquare,
  Wallet,
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
  useRespondRescheduleRequest,
  useMyTestRecommendations,
  useMarkTestRecommendationCompleted,
} from "@/hooks/queries/usePatient";
import { usePatientConsultationHistory } from "@/hooks/useConsultation";
import { ensureConsultationConversation } from "@/lib/consultation-data";
import {
  formatTimeDisplay,
  getAvailability,
  getBookedSlots,
  generateTimeSlots,
} from "@/lib/bookings";
import { scrollToHash } from "@/lib/scroll";
import { todayInClinic, nowTimeInClinic } from "@/lib/clinic";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatusValue } from "@/lib/notifications";
import { QueryError } from "@/components/admin/QueryError";
import { NotificationList } from "@/components/notifications/NotificationList";
import { VideoPaymentStep } from "@/components/site/VideoPaymentStep";
import { useAuth } from "@/hooks/useAuth";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/payment";

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

const paymentStatusStyles: Record<string, string> = {
  payment_pending: "bg-amber-100 text-amber-700",
  payment_submitted: "bg-sky-100 text-sky-700",
  payment_verified: "bg-emerald-100 text-emerald-700",
  payment_failed: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-700",
  waived: "bg-teal-100 text-teal-700",
};

function NotificationsPanel() {
  const { data: notifications, isLoading, isError, error } = useMyNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = (notifications ?? []).filter((n) => !n.read_at).length;

  return (
    <NotificationList
      className="rounded-2xl border border-border bg-card shadow-soft"
      notifications={notifications ?? []}
      unread={unread}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onMarkRead={(id) => markRead.mutate(id)}
      onMarkAll={() => markAll.mutate()}
    />
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
        <div className="max-h-48 divide-y overflow-auto lg:max-h-72">
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
                  <span className="text-xs text-muted-foreground">
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
  const [loading, setLoading] = useState(false);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const reschedule = useRescheduleMyAppointment();
  const duration = appointment.durationMinutes;

  // Same slot grid the admin (and the booking page) use, so the patient only
  // ever picks times that are actually available and can't double-book.
  useEffect(() => {
    if (!date) {
      setAvailableTimes([]);
      setLoading(false);
      return;
    }
    if (duration == null) {
      // Flexible timing service (e.g. Home Visit) — no fixed slot grid.
      setAvailableTimes([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([getAvailability(), getBookedSlots(date)])
      .then(([availability, booked]) => {
        if (cancelled) return;
        const times = generateTimeSlots(
          availability,
          new Date(date + "T00:00:00"),
          booked,
          duration,
          todayInClinic(),
          nowTimeInClinic(),
        );
        setAvailableTimes(times);
        setTime((cur) => (times.includes(cur) ? cur : (times[0] ?? "")));
      })
      .catch(() => {
        if (!cancelled) setAvailableTimes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, duration]);

  async function handleSave() {
    setMsg("");
    if (duration != null && !time) {
      setMsg("Please pick a time slot.");
      return;
    }
    const result = await reschedule.mutateAsync({
      id: appointment.id,
      date,
      time: duration == null ? null : time,
    });
    if (result.error) {
      setMsg(result.error);
    } else {
      onClose();
    }
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
        {duration == null ? (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            This service has no fixed slot — the doctor confirms the time.
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking slots...
          </div>
        ) : availableTimes.length === 0 ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No open slots available for this date.
          </div>
        ) : (
          <Select value={time} onValueChange={setTime}>
            <SelectTrigger>
              <SelectValue placeholder="Select a time" />
            </SelectTrigger>
            <SelectContent>
              {availableTimes.map((t) => (
                <SelectItem key={t} value={t}>
                  {formatTimeDisplay(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        The clinic will confirm your requested time before it is applied to your appointment.
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={reschedule.isPending}
          className="h-8 text-xs"
        >
          {reschedule.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Send Request
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
    navigate({
      to: "/video/$vcNo",
      params: { vcNo },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Video Consultation</DialogTitle>
          <DialogDescription>
            Paste the meeting link your doctor shared to join the same call.
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
              className="h-11 md:h-10"
            />
            {appointment.vcNo && (
              <p className="text-xs text-muted-foreground">
                Your appointment's link is pre-filled. You can paste a different link if the doctor
                shared one.
              </p>
            )}
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="button" onClick={handleJoin} className="w-full gap-1.5 sm:w-auto">
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const { data: appointments, isLoading, isError, error } = useMyAppointments();
  const { data: consultationHistory } = usePatientConsultationHistory();
  const cancel = useCancelMyAppointment();
  const respondReschedule = useRespondRescheduleRequest();
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [paymentAppointment, setPaymentAppointment] = useState<
    import("@/lib/patient-data").PatientAppointment | null
  >(null);
  const [joiningVideo, setJoiningVideo] = useState<
    import("@/lib/patient-data").PatientAppointment | null
  >(null);
  const [joiningAppointmentId, setJoiningAppointmentId] = useState<string | null>(null);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);

  /** Map the SAME conversation that history/realtime use to each appointment. */
  const convoByAppointment = useMemo(
    () => new Map((consultationHistory ?? []).map((c) => [c.appointmentId, c.conversationId])),
    [consultationHistory],
  );

  /** Patient accepts or declines a reschedule request raised by the clinic. */
  async function handleRespondReschedule(
    a: import("@/lib/patient-data").PatientAppointment,
    action: "accept" | "decline",
  ) {
    const result = await respondReschedule.mutateAsync({ id: a.id, action });
    setReschedulingId(null);
  }

  async function handleJoinVideo(a: import("@/lib/patient-data").PatientAppointment) {
    const vcNo = a.vcNo;
    if (!vcNo) {
      setJoiningVideo(a);
      return;
    }
    setJoiningAppointmentId(a.id);
    try {
      const conversationId = convoByAppointment.get(a.id);
      const id =
        conversationId ?? (await ensureConsultationConversation(a.id, "public")).conversationId;
      // Open the video page in a new tab (it contains the LiveKit room)…
      window.open(`/video/${vcNo}`, "_blank", "noopener,noreferrer");
      // …and bring the SAME appointment's chat into the current tab.
      navigate({
        to: "/patient/consultations/$id",
        params: { id },
      });
    } catch {
      setJoiningVideo(a);
    } finally {
      setJoiningAppointmentId(null);
    }
  }

  async function handleOpenChat(a: import("@/lib/patient-data").PatientAppointment) {
    setOpeningChatId(a.id);
    try {
      const conversationId = convoByAppointment.get(a.id);
      const id =
        conversationId ?? (await ensureConsultationConversation(a.id, "public")).conversationId;
      navigate({ to: "/patient/consultations/$id", params: { id } });
    } catch {
      navigate({ to: "/patient/consultations" });
    } finally {
      setOpeningChatId(null);
    }
  }

  async function goToBookingSection(e: React.MouseEvent) {
    e.preventDefault();
    if (window.location.pathname !== "/") {
      await router.navigate({ to: "/", hash: "booking" });
    }
    scrollToHash("booking");
  }

  /** Same destination as the "Video Consultation" button on the home section. */
  async function goToVideoConsultationSection(e: React.MouseEvent) {
    e.preventDefault();
    if (window.location.pathname !== "/") {
      await router.navigate({ to: "/", hash: "video-consultation" });
    }
    scrollToHash("video-consultation");
  }

  return (
    <div className="space-y-6 overflow-x-clip">
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
            <div
              key={a.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold text-foreground">
                      {a.serviceName ?? "Appointment"}
                    </span>
                    <Badge className={`${statusStyles[a.status] ?? statusStyles.pending}`}>
                      {APPOINTMENT_STATUS_LABELS[a.status as AppointmentStatusValue] ?? a.status}
                    </Badge>
                    {a.rescheduleStatus === "pending" && a.rescheduleRequestedBy === "staff" && (
                      <Badge className="bg-sky-100 text-sky-700">
                        Reschedule Pending — Confirm
                      </Badge>
                    )}
                    {a.rescheduleStatus === "pending" && a.rescheduleRequestedBy === "patient" && (
                      <Badge className="bg-amber-100 text-amber-700">Reschedule Requested</Badge>
                    )}
                    {a.rescheduleStatus === "none" && a.lastRescheduledAt && (
                      <Badge className="bg-emerald-100 text-emerald-700">Rescheduled</Badge>
                    )}
                    {a.isVideo && (
                      <Badge className="bg-purple-100 text-purple-700">
                        <Video className="mr-1 h-3 w-3" /> Video
                      </Badge>
                    )}
                  </div>
                  {a.rescheduleStatus === "pending" && a.rescheduleRequestedBy === "staff" && (
                    <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                      <div className="text-xs font-semibold text-sky-800">
                        The clinic rescheduled your appointment
                      </div>
                      <div className="mt-1 text-sm text-foreground">
                        {a.rescheduleDate &&
                          format(new Date(`${a.rescheduleDate}T00:00:00`), "EEEE, MMMM d, yyyy")}
                        {a.rescheduleTime && <> at {formatTimeDisplay(a.rescheduleTime)}</>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Confirm the new time to apply it, or decline to keep your current slot.
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={respondReschedule.isPending}
                          onClick={() => handleRespondReschedule(a, "accept")}
                        >
                          {respondReschedule.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCheck className="h-3.5 w-3.5" />
                          )}
                          Accept / OK
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-red-600"
                          disabled={respondReschedule.isPending}
                          onClick={() => handleRespondReschedule(a, "decline")}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  )}
                  {a.rescheduleStatus === "pending" && a.rescheduleRequestedBy === "patient" && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs font-semibold text-amber-800">
                        Reschedule request sent — awaiting clinic approval
                      </div>
                      <div className="mt-1 text-sm text-foreground">
                        {a.rescheduleDate &&
                          format(new Date(`${a.rescheduleDate}T00:00:00`), "EEEE, MMMM d, yyyy")}
                        {a.rescheduleTime && <> at {formatTimeDisplay(a.rescheduleTime)}</>}
                      </div>
                    </div>
                  )}
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
                      <code className="min-w-0 max-w-full truncate rounded bg-background px-2 py-0.5 font-mono text-xs text-foreground sm:max-w-[14rem]">
                        {window.location.origin}/video/{a.vcNo}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard.writeText(`${window.location.origin}/video/${a.vcNo}`)
                        }
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    </div>
                  )}
                  {a.isVideo && a.paymentStatus && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            paymentStatusStyles[a.paymentStatus] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {PAYMENT_STATUS_LABELS[a.paymentStatus as PaymentStatus] ??
                            a.paymentStatus}
                        </span>
                        {a.paymentAmount != null && (
                          <span className="text-xs text-foreground">
                            Amount:{" "}
                            <span className="font-semibold">
                              Rs. {Number(a.paymentAmount).toLocaleString()}
                            </span>
                          </span>
                        )}
                        {a.paymentMethod && (
                          <span className="text-xs text-muted-foreground">
                            Method: <span className="font-medium">{a.paymentMethod}</span>
                          </span>
                        )}
                        {a.paymentReference && (
                          <span className="text-xs text-muted-foreground">
                            Ref:{" "}
                            <code className="rounded bg-background px-1 py-0.5 font-mono">
                              {a.paymentReference}
                            </code>
                          </span>
                        )}
                        {a.paymentVerifiedAt && (
                          <span className="text-xs text-muted-foreground">
                            Verified:{" "}
                            <span className="font-medium">
                              {format(new Date(a.paymentVerifiedAt), "MMM d, h:mm a")}
                            </span>
                          </span>
                        )}
                      </div>
                      {(a.paymentStatus === "payment_pending" ||
                        a.paymentStatus === "payment_failed") && (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPaymentAppointment(a)}
                          >
                            <Wallet className="mr-1 h-3.5 w-3.5" />
                            {a.paymentStatus === "payment_failed"
                              ? "Resubmit Payment"
                              : "Submit Payment"}
                          </Button>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                            {a.paymentStatus === "payment_failed"
                              ? "Your previous payment was not accepted. Please resubmit your payment proof so the clinic can verify it."
                              : "Complete the prepaid payment so the clinic can verify and unlock your video call."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.isVideo && a.status === "completed" && (
                    <a
                      href="/#video-consultation"
                      onClick={goToVideoConsultationSection}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                    >
                      <Video className="h-3.5 w-3.5" /> Book New Video Consultation
                    </a>
                  )}
                  {a.isVideo &&
                    a.status !== "completed" &&
                    a.status !== "cancelled" &&
                    a.status !== "rejected" &&
                    a.status !== "no_show" && (
                      <button
                        type="button"
                        onClick={() => void handleJoinVideo(a)}
                        disabled={joiningAppointmentId === a.id}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                      >
                        {joiningAppointmentId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Video className="h-3.5 w-3.5" />
                        )}
                        {joiningAppointmentId === a.id ? "Opening…" : "Join Video Consultation"}
                      </button>
                    )}
                  {a.status !== "cancelled" &&
                    a.status !== "rejected" &&
                    a.status !== "no_show" &&
                    (convoByAppointment.get(a.id) ? (
                      <Link
                        to="/patient/consultations/$id"
                        params={{ id: convoByAppointment.get(a.id)! }}
                        title="Open the chat for this appointment"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-primary" /> Chat
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleOpenChat(a)}
                        disabled={openingChatId === a.id}
                        title="Open the chat for this appointment"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted"
                      >
                        {openingChatId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        )}
                        Chat
                      </button>
                    ))}
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
                  {a.canReschedule && (!a.rescheduleStatus || a.rescheduleStatus === "none") && (
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

      <ConsultationHistorySection />

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

      {paymentAppointment && (
        <PaymentDialog
          appointment={paymentAppointment}
          patientName={profile?.full_name ?? "Patient"}
          phone={profile?.phone ?? undefined}
          email={user?.email ?? undefined}
          onClose={() => {
            setPaymentAppointment(null);
            void qc.invalidateQueries({ queryKey: ["patient", "appointments"] });
          }}
        />
      )}
    </div>
  );
}

/** Patient-side payment submission/resubmission for a video consultation —
 *  reuses the same Option 1 / Option 2 flow shown right after booking. */
function PaymentDialog({
  appointment,
  patientName,
  phone,
  email,
  onClose,
}: {
  appointment: import("@/lib/patient-data").PatientAppointment;
  patientName: string;
  phone?: string;
  email?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete Your Prepaid Payment</DialogTitle>
          <DialogDescription>
            Submit your payment proof so the clinic can verify and unlock your video consultation.
          </DialogDescription>
        </DialogHeader>
        <VideoPaymentStep
          appointmentId={appointment.id}
          appointmentNo={appointment.appointmentNo}
          amount={appointment.paymentAmount ?? 0}
          offerTitle={appointment.offerTitle}
          isWaived={appointment.paymentStatus === "waived"}
          date={new Date(`${appointment.date}T00:00:00`)}
          time={appointment.time ?? ""}
          patientName={patientName}
          phone={phone}
          email={email}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function ConsultationHistorySection() {
  const {
    data: conversations,
    isLoading,
    isError,
    error,
    refetch,
  } = usePatientConsultationHistory();
  const recent = (conversations ?? []).slice(0, 3);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-primary" />
          <div>
            <div className="font-display font-semibold text-foreground">Consultation History</div>
            <div className="text-xs text-muted-foreground">
              Chat and records from your appointments
            </div>
          </div>
        </div>
        <Link
          to="/patient/consultations"
          className="text-sm font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-destructive">
              Could not load your consultation history.
            </p>
            <p className="mt-1 break-all text-xs text-destructive/80">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <button
              onClick={() => void refetch()}
              className="mt-2 text-sm font-medium text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No consultations yet. After a video or clinic visit, your conversations will appear
            here.
          </p>
        ) : (
          recent.map((c) => (
            <Link
              key={c.conversationId}
              to="/patient/consultations/$id"
              params={{ id: c.conversationId }}
              className="block rounded-xl border border-border bg-background/50 p-3 transition hover:border-primary/40 hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {c.serviceName ?? "Consultation"}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {format(new Date(`${c.appointmentDate}T00:00:00`), "MMM d, yyyy")}
                    {c.appointmentTime && <> at {formatTimeDisplay(c.appointmentTime)}</>}
                  </div>
                  {c.lastBody && (
                    <div className="mt-1 truncate text-xs text-muted-foreground">{c.lastBody}</div>
                  )}
                </div>
                <span className="shrink-0 text-muted-foreground">→</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
