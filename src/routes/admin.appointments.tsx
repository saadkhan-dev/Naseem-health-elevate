import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, Video } from "lucide-react";
import {
  useAppointments,
  useUpdateAppointmentStatus,
  useRescheduleAppointment,
  useSetVideoPaymentStatus,
  useAdminAvailability,
} from "@/hooks/queries/useAdmin";
import { useCreateVideoSession } from "@/hooks/queries/useVideo";
import type { AppointmentWithDetails } from "@/lib/admin-data";
import { formatTimeDisplay, getBookedSlots, generateTimeSlots } from "@/lib/bookings";
import { todayInClinic, nowTimeInClinic } from "@/lib/clinic";
import { PAYMENT_STATUS_BADGES, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/appointments")({
  component: AdminAppointments,
});

type StatusFilter = "all" | "pending" | "confirmed" | "rejected" | "completed" | "cancelled";
type DateFilter = "all" | "today" | "upcoming" | "past" | "specific";
type TypeFilter = "normal" | "video" | "all";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "normal", label: "In Clinic" },
  { value: "video", label: "Video Consultation" },
  { value: "all", label: "All" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "specific", label: "Specific date" },
];

function statusBadgeClasses(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-green-100 text-green-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "rejected":
    case "cancelled":
      return "bg-red-100 text-red-700";
    case "completed":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function PaymentBadge({ status }: { status: string }) {
  const label = PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status;
  const badge = PAYMENT_STATUS_BADGES[status as PaymentStatus] ?? "bg-gray-100 text-gray-700";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge}`}>{label}</span>;
}

function AdminAppointments() {
  const { data: appointments, isLoading, isError, error } = useAppointments();
  const { data: availability } = useAdminAvailability();
  const updateStatus = useUpdateAppointmentStatus();
  const reschedule = useRescheduleAppointment();
  const setPayment = useSetVideoPaymentStatus();
  const createVideo = useCreateVideoSession();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("normal");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [specificDate, setSpecificDate] = useState("");

  const [videoDialog, setVideoDialog] = useState<{
    appointmentId: string;
    roomName: string;
    vcNo: string;
  } | null>(null);
  const [callDuration, setCallDuration] = useState(20);

  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentWithDetails | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);

  const today = todayInClinic();

  const filtered = useMemo(() => {
    let rows = appointments ?? [];
    if (typeFilter === "normal") rows = rows.filter((a) => !a.is_video);
    else if (typeFilter === "video") rows = rows.filter((a) => a.is_video);
    if (statusFilter !== "all") rows = rows.filter((a) => a.status === statusFilter);
    if (dateFilter === "today") rows = rows.filter((a) => a.date === today);
    else if (dateFilter === "upcoming") rows = rows.filter((a) => a.date >= today);
    else if (dateFilter === "past") rows = rows.filter((a) => a.date < today);
    else if (dateFilter === "specific" && specificDate)
      rows = rows.filter((a) => a.date === specificDate);
    return rows;
  }, [appointments, typeFilter, statusFilter, dateFilter, specificDate, today]);

  // Refresh the available time slots whenever the reschedule dialog's target
  // or chosen date changes. Reuses the same slot grid the patient sees, so the
  // admin never offers a time the booking layer would reject.
  useEffect(() => {
    if (!rescheduleTarget || !rescheduleDate) {
      setAvailableTimes([]);
      setLoadingTimes(false);
      return;
    }
    const duration = rescheduleTarget.duration_minutes;
    if (duration == null) {
      setAvailableTimes([]);
      setLoadingTimes(false);
      return;
    }
    let cancelled = false;
    setLoadingTimes(true);
    getBookedSlots(rescheduleDate)
      .then((booked) => {
        if (cancelled) return;
        const times = generateTimeSlots(
          availability ?? [],
          new Date(rescheduleDate + "T00:00:00"),
          booked,
          duration,
          today,
          nowTimeInClinic(),
        );
        setAvailableTimes(times);
        setRescheduleTime((cur) => (times.includes(cur) ? cur : (times[0] ?? "")));
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableTimes([]);
          setRescheduleTime("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTimes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rescheduleTarget, rescheduleDate, availability, today]);

  const busy =
    updateStatus.isPending || reschedule.isPending || setPayment.isPending || createVideo.isPending;

  async function changeStatus(
    id: string,
    status: "confirmed" | "rejected" | "completed" | "cancelled",
  ) {
    const result = await updateStatus.mutateAsync({ id, status });
    if (result.error) alert(result.error);
  }

  async function changePayment(
    appointmentId: string,
    status: "payment_verified" | "payment_failed" | "refunded" | "waived",
  ) {
    const result = await setPayment.mutateAsync({ appointmentId, status });
    if (result.error) alert(result.error);
  }

  async function handleStartVideo(appointmentId: string) {
    const result = await createVideo.mutateAsync({
      appointmentId,
      durationMinutes: callDuration,
    });
    if (result.error) {
      alert(result.error);
    } else if (result.session) {
      setVideoDialog({
        appointmentId,
        roomName: result.session.room_name,
        vcNo: result.session.vc_no ?? "",
      });
    }
  }

  function openReschedule(a: AppointmentWithDetails) {
    setRescheduleTarget(a);
    setRescheduleDate(a.date);
    setRescheduleTime(a.time ?? "");
  }

  async function submitReschedule() {
    if (!rescheduleTarget || !rescheduleDate) return;
    if (rescheduleTarget.duration_minutes != null && !rescheduleTime) {
      alert("Please pick a time slot.");
      return;
    }
    const result = await reschedule.mutateAsync({
      id: rescheduleTarget.id,
      date: rescheduleDate,
      time: rescheduleTarget.duration_minutes == null ? null : rescheduleTime,
    });
    if (result.error) {
      alert(result.error);
    } else {
      setRescheduleTarget(null);
    }
  }

  function renderActions(a: AppointmentWithDetails): ReactNode {
    if (a.is_video) return renderVideoActions(a);
    return renderNormalActions(a);
  }

  function renderNormalActions(a: AppointmentWithDetails): ReactNode {
    if (a.status === "pending") {
      return (
        <>
          <Button
            size="sm"
            variant="default"
            onClick={() => changeStatus(a.id, "confirmed")}
            disabled={busy}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600"
            onClick={() => changeStatus(a.id, "rejected")}
            disabled={busy}
          >
            Reject
          </Button>
          <Button size="sm" variant="outline" onClick={() => openReschedule(a)} disabled={busy}>
            Reschedule
          </Button>
        </>
      );
    }
    if (a.status === "confirmed") {
      return (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => changeStatus(a.id, "completed")}
            disabled={busy}
          >
            Complete
          </Button>
          <Button size="sm" variant="outline" onClick={() => openReschedule(a)} disabled={busy}>
            Reschedule
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600"
            onClick={() => changeStatus(a.id, "cancelled")}
            disabled={busy}
          >
            Cancel
          </Button>
        </>
      );
    }
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  function renderVideoActions(a: AppointmentWithDetails): ReactNode {
    if (a.status === "pending") {
      return (
        <>
          <Button
            size="sm"
            variant="default"
            onClick={() => changeStatus(a.id, "confirmed")}
            disabled={busy}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600"
            onClick={() => changeStatus(a.id, "rejected")}
            disabled={busy}
          >
            Reject
          </Button>
          <Button size="sm" variant="outline" onClick={() => openReschedule(a)} disabled={busy}>
            Reschedule
          </Button>
        </>
      );
    }
    if (a.status !== "confirmed") {
      return <span className="text-xs text-muted-foreground">—</span>;
    }

    const actions: ReactNode[] = [];
    const sessionDone = a.video_session_status === "completed";

    if (a.payment_status === "payment_submitted") {
      actions.push(
        <Button
          key="verify"
          size="sm"
          variant="default"
          onClick={() => changePayment(a.id, "payment_verified")}
          disabled={busy}
        >
          Verify Payment
        </Button>,
        <Button
          key="reject-payment"
          size="sm"
          variant="outline"
          className="text-red-600"
          onClick={() => changePayment(a.id, "payment_failed")}
          disabled={busy}
        >
          Reject Payment
        </Button>,
        <Button
          key="waive"
          size="sm"
          variant="outline"
          onClick={() => changePayment(a.id, "waived")}
          disabled={busy}
        >
          Waive / Free
        </Button>,
      );
    } else if (a.payment_status === "payment_pending") {
      actions.push(
        <Button
          key="waive"
          size="sm"
          variant="outline"
          onClick={() => changePayment(a.id, "waived")}
          disabled={busy}
        >
          Waive / Free
        </Button>,
      );
    } else if (a.payment_status === "payment_verified") {
      if (!sessionDone) {
        actions.push(
          <Button
            key="video"
            size="sm"
            variant="default"
            onClick={() => handleStartVideo(a.id)}
            disabled={busy}
          >
            {createVideo.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Video className="mr-1 h-3 w-3" />
            )}
            Video Call
          </Button>,
        );
      }
      actions.push(
        <Button
          key="refund"
          size="sm"
          variant="outline"
          onClick={() => changePayment(a.id, "refunded")}
          disabled={busy}
        >
          Refund
        </Button>,
        <Button
          key="complete"
          size="sm"
          variant="outline"
          onClick={() => changeStatus(a.id, "completed")}
          disabled={busy}
        >
          Complete
        </Button>,
      );
    } else if (a.payment_status === "waived") {
      if (!sessionDone) {
        actions.push(
          <Button
            key="video"
            size="sm"
            variant="default"
            onClick={() => handleStartVideo(a.id)}
            disabled={busy}
          >
            {createVideo.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Video className="mr-1 h-3 w-3" />
            )}
            Video Call
          </Button>,
        );
      }
      actions.push(
        <Button
          key="complete"
          size="sm"
          variant="outline"
          onClick={() => changeStatus(a.id, "completed")}
          disabled={busy}
        >
          Complete
        </Button>,
      );
    } else if (a.payment_status === "refunded") {
      actions.push(
        <Button
          key="complete"
          size="sm"
          variant="outline"
          onClick={() => changeStatus(a.id, "completed")}
          disabled={busy}
        >
          Complete
        </Button>,
      );
    }

    if (
      a.payment_status !== "payment_verified" &&
      a.payment_status !== "payment_failed" &&
      a.payment_status !== "refunded"
    ) {
      actions.push(
        <Button
          key="cancel"
          size="sm"
          variant="outline"
          className="text-red-600"
          onClick={() => changeStatus(a.id, "cancelled")}
          disabled={busy}
        >
          Cancel
        </Button>,
      );
    }

    actions.push(
      <Button
        key="reschedule"
        size="sm"
        variant="outline"
        onClick={() => openReschedule(a)}
        disabled={busy}
      >
        Reschedule
      </Button>,
    );

    return <div className="flex flex-wrap gap-1">{actions}</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1 sm:w-max">
        {TYPE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setTypeFilter(o.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              typeFilter === o.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Appointments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage all patient bookings</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {dateFilter === "specific" && (
        <div className="mt-3 flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Date</label>
          <Input
            type="date"
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            className="h-9 w-44"
          />
        </div>
      )}

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      <div className="mt-6 rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No appointments found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((a) => (
                  <tr key={a.id} className="text-foreground">
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.patient_name ?? "—"}</div>
                      {a.appointment_no && (
                        <div className="text-xs text-muted-foreground">{a.appointment_no}</div>
                      )}
                      {a.patient_phone && (
                        <div className="text-xs text-muted-foreground">{a.patient_phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{a.service_name ?? "—"}</div>
                      {a.is_video && a.offer_title && (
                        <div className="text-xs text-primary">{a.offer_title}</div>
                      )}
                      {typeFilter === "all" && (
                        <div className="mt-1">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              a.is_video
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {a.is_video ? "Video Consultation" : "Normal"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.date ? format(new Date(a.date + "T00:00:00"), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3">{formatTimeDisplay(a.time ?? "Flexible")}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeClasses(a.status)}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.is_video ? (
                        <PaymentBadge status={a.payment_status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">{renderActions(a)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={!!rescheduleTarget}
        onOpenChange={(open) => {
          if (!open) setRescheduleTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>
              {rescheduleTarget
                ? `${rescheduleTarget.patient_name ?? "Patient"} — ${rescheduleTarget.service_name ?? "Appointment"}`
                : "Pick a new date and time."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Date</label>
              <Input
                type="date"
                min={today}
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="mt-1"
              />
            </div>
            {rescheduleTarget?.duration_minutes == null ? (
              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                This service has no fixed slot — the doctor confirms the time after booking.
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium text-foreground">Time</label>
                {loadingTimes ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking slots...
                  </div>
                ) : availableTimes.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-600">
                    No open slots available for this date.
                  </p>
                ) : (
                  <Select value={rescheduleTime} onValueChange={setRescheduleTime}>
                    <SelectTrigger className="mt-1 w-full">
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
            )}
          </div>
          <DialogFooter className="shrink-0 -mx-6 -mb-6 gap-2 border-t bg-background px-6 py-4 sm:space-x-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={submitReschedule}
              disabled={busy || (rescheduleTarget?.duration_minutes != null && !rescheduleTime)}
            >
              {reschedule.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!videoDialog}
        onOpenChange={() => {
          setVideoDialog(null);
          setCallDuration(20);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Video Call</DialogTitle>
            <DialogDescription>
              Set the session duration, then join or share the link with the patient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <label className="text-xs font-medium text-muted-foreground">Session Duration</label>
              <div className="mt-2 flex gap-2">
                {[15, 20, 30, 45, 60].map((min) => (
                  <button
                    key={min}
                    onClick={() => setCallDuration(min)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      callDuration === min
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {min} min
                  </button>
                ))}
              </div>
            </div>
            {videoDialog?.vcNo && (
              <div className="rounded-lg bg-muted p-3">
                <label className="text-xs font-medium text-muted-foreground">
                  Patient Join Link
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/video/${videoDialog.vcNo}`}
                    className="flex-1 rounded border bg-background px-3 py-2 text-sm"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/video/${videoDialog.vcNo}`,
                      );
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}
            <Button
              className="w-full"
              disabled={!videoDialog?.vcNo}
              onClick={() => {
                window.open(`/video/${videoDialog?.vcNo}?as=doctor`, "_blank");
                setVideoDialog(null);
              }}
            >
              <Video className="mr-2 h-4 w-4" />
              Join as Doctor ({callDuration} min)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
