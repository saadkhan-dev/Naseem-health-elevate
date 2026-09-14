import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Banknote,
  Loader2,
  Video,
  ExternalLink,
  FileImage,
  X,
  Search,
  CornerDownLeft,
} from "lucide-react";
import {
  useAppointments,
  useUpdateAppointmentStatus,
  useRescheduleAppointment,
  useApplyReschedule,
  useSetVideoPaymentStatus,
  useAdminAvailability,
} from "@/hooks/queries/useAdmin";
import { useCreateVideoSession } from "@/hooks/queries/useVideo";
import type { AppointmentWithDetails } from "@/lib/admin-data";
import { formatTimeDisplay, getBookedSlots, generateTimeSlots } from "@/lib/bookings";
import { todayInClinic, nowTimeInClinic } from "@/lib/clinic";
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatusValue } from "@/lib/notifications";
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
import { staffSupabase } from "@/lib/supabase";
import { appointmentMatchesQuery, normalizeSearchTerm } from "@/lib/appointments-search";
import { usePageFocus, useFocusHighlight } from "@/hooks/usePageFocus";

export const Route = createFileRoute("/admin/appointments")({
  component: AdminAppointments,
});

type StatusFilter =
  "all" | "pending" | "confirmed" | "rejected" | "completed" | "cancelled" | "arrived" | "no_show";
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
  { value: "arrived", label: "Arrived" },
  { value: "no_show", label: "No-Show" },
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
    case "arrived":
      return "bg-teal-100 text-teal-700";
    case "no_show":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function PaymentBadge({ status }: { status: string }) {
  const label = PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status;
  const badge = PAYMENT_STATUS_BADGES[status as PaymentStatus] ?? "bg-gray-100 text-gray-700";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge}`}>{label}</span>;
}

/**
 * Renders `text` with the search tokens wrapped in a subtle highlight so the
 * admin can see exactly why a row/suggestion matched (Google-style).
 */
function Highlighted({ text, query }: { text: string; query: string }) {
  const tokens = normalizeSearchTerm(query).split(" ").filter(Boolean);
  if (!text || tokens.length === 0) return <>{text}</>;

  let nodes: ReactNode[] = [text];
  let key = 0;
  for (const token of tokens) {
    const next: ReactNode[] = [];
    for (const node of nodes) {
      if (typeof node !== "string") {
        next.push(node);
        continue;
      }
      const idx = node.toLowerCase().indexOf(token);
      if (idx === -1) {
        next.push(node);
        continue;
      }
      next.push(
        node.slice(0, idx),
        <span key={key++} className="rounded bg-primary/15 font-semibold text-primary" aria-hidden>
          {node.slice(idx, idx + token.length)}
        </span>,
        node.slice(idx + token.length),
      );
    }
    nodes = next;
  }
  return <>{nodes}</>;
}

/** Admin view of a video consultation's payment proof (Option 1 details +
 *  Option 2 receipt screenshot). The receipt is a private-storage path, so it
 *  is opened through a short-lived signed URL generated with the staff client —
 *  storage RLS still applies (admin/doctor only). */
function PaymentProofDialog({
  appointment,
  onClose,
}: {
  appointment: AppointmentWithDetails;
  onClose: () => void;
}) {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReceiptUrl(null);
    if (appointment.payment_receipt_url) {
      setReceiptLoading(true);
      staffSupabase.storage
        .from("payment-receipts")
        .createSignedUrl(appointment.payment_receipt_url, 300)
        .then(({ data }) => {
          if (!cancelled) setReceiptUrl(data?.signedUrl ?? null);
        })
        .finally(() => {
          if (!cancelled) setReceiptLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [appointment.id, appointment.payment_receipt_url]);

  const row = (label: string, value: ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-foreground">{value}</span>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment details</DialogTitle>
          <DialogDescription>
            Prepaid video consultation proof — verify before unlocking the session.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {row("Patient", appointment.patient_name ?? "—")}
          {row(
            "Service",
            <div className="text-right">
              <div>{appointment.service_name ?? "—"}</div>
              {appointment.offer_title && (
                <div className="text-xs text-primary">{appointment.offer_title}</div>
              )}
            </div>,
          )}
          {row(
            "Date",
            appointment.date
              ? format(new Date(appointment.date + "T00:00:00"), "MMM d, yyyy")
              : "—",
          )}
          {row("Time", formatTimeDisplay(appointment.time ?? "Flexible"))}
          {row(
            "Status",
            <span className="inline-flex items-center gap-1.5">
              <PaymentBadge status={appointment.payment_status} />
            </span>,
          )}
          {appointment.payment_amount != null &&
            row("Amount", `Rs. ${Number(appointment.payment_amount).toLocaleString()}`)}
          {row("Method", appointment.payment_method ?? "—")}
          {row(
            "Reference / Transaction ID",
            appointment.payment_reference ? (
              <span className="font-mono">{appointment.payment_reference}</span>
            ) : (
              "—"
            ),
          )}
          {row("Payer name", appointment.payment_payer_name ?? "—")}
          {row(
            "Submitted",
            appointment.payment_submitted_at
              ? format(new Date(appointment.payment_submitted_at), "MMM d, yyyy, h:mm a")
              : "—",
          )}
          {row(
            "Verified",
            appointment.payment_verified_at
              ? format(new Date(appointment.payment_verified_at), "MMM d, yyyy, h:mm a")
              : "—",
          )}
        </div>

        {appointment.payment_receipt_url && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                <FileImage className="h-4 w-4 text-primary" /> Uploaded receipt screenshot
              </span>
              {receiptUrl && (
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
                </a>
              )}
            </div>
            <div className="flex max-h-[45vh] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
              {receiptLoading ? (
                <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : receiptUrl ? (
                <img
                  src={receiptUrl}
                  alt="Payment receipt"
                  className="max-h-[45vh] w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 p-8 text-sm text-muted-foreground">
                  <X className="h-6 w-6" /> Could not load the receipt.
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdminAppointments() {
  const { data: appointments, isLoading, isError, error } = useAppointments();
  const { data: availability } = useAdminAvailability();
  const updateStatus = useUpdateAppointmentStatus();
  const reschedule = useRescheduleAppointment();
  const applyReschedule = useApplyReschedule();
  const setPayment = useSetVideoPaymentStatus();
  const createVideo = useCreateVideoSession();
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("normal");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [specificDate, setSpecificDate] = useState("");

  // Google-style unified search: across clinic AND video consultations.
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestActive, setSuggestActive] = useState(-1);

  const [videoDialog, setVideoDialog] = useState<{
    appointmentId: string;
    roomName: string;
    vcNo: string;
  } | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<AppointmentWithDetails | null>(null);
  const [callDuration, setCallDuration] = useState(20);
  const [joinLinkInput, setJoinLinkInput] = useState("");
  const [videoError, setVideoError] = useState("");
  const [rowFeedback, setRowFeedback] = useState<
    Record<string, { kind: "success" | "error"; message: string }>
  >({});

  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentWithDetails | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);

  const patientJoinLink = videoDialog?.vcNo
    ? `${window.location.origin}/video/${videoDialog.vcNo}`
    : "";
  useEffect(() => {
    setJoinLinkInput(patientJoinLink);
  }, [patientJoinLink]);

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
    if (searchQuery.trim()) rows = rows.filter((a) => appointmentMatchesQuery(a, searchQuery));
    return rows;
  }, [appointments, typeFilter, statusFilter, dateFilter, specificDate, today, searchQuery]);

  // Live suggestion dropdown (first rows of the current result set).
  const suggestions = useMemo(() => filtered.slice(0, 10), [filtered]);

  // Deep-link focus: a notification / suggestion navigates here with
  // ?focus=appointment&id=<uuid> — scroll to and highlight that exact row.
  const pageFocus = usePageFocus();
  useFocusHighlight({
    focus: pageFocus?.focus === "appointment" ? pageFocus : null,
    ready: !isLoading,
    ensureVisible: (f) => {
      const row = (appointments ?? []).find((a) => a.id === f.id);
      if (!row) return;
      if (typeFilter !== "all") setTypeFilter("all");
      if (statusFilter !== "all") setStatusFilter("all");
      if (dateFilter !== "all") setDateFilter("all");
      if (searchQuery.trim() && !appointmentMatchesQuery(row, searchQuery)) setSearchQuery("");
      setSuggestOpen(false);
    },
  });

  function pickSuggestion(a: AppointmentWithDetails) {
    setSuggestOpen(false);
    setSuggestActive(-1);
    void navigate({
      to: "/admin/appointments",
      search: { focus: "appointment", id: a.id },
    } as never);
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSuggestOpen(false);
      setSuggestActive(-1);
      e.currentTarget.blur();
      return;
    }
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestActive((cur) => (cur + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestActive((cur) => (cur <= 0 ? suggestions.length - 1 : cur - 1));
    } else if (e.key === "Enter" && suggestActive >= 0) {
      const target = suggestions[suggestActive];
      if (target) {
        e.preventDefault();
        pickSuggestion(target);
      }
    }
  }

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
    updateStatus.isPending ||
    reschedule.isPending ||
    applyReschedule.isPending ||
    setPayment.isPending ||
    createVideo.isPending;

  /** Shows a short-lived success/error message under the appointment's actions. */
  function flashRow(id: string, kind: "success" | "error", message: string) {
    setRowFeedback((prev) => ({ ...prev, [id]: { kind, message } }));
    window.setTimeout(() => {
      setRowFeedback((prev) => {
        if (prev[id]?.message !== message) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 6000);
  }

  const STATUS_DONE_LABELS: Record<string, string> = {
    confirmed: "Appointment approved",
    rejected: "Appointment rejected",
    completed: "Appointment completed",
    cancelled: "Appointment cancelled",
    arrived: "Marked as arrived",
    no_show: "Marked as no-show",
  };

  const PAYMENT_DONE_LABELS: Record<string, string> = {
    payment_verified: "Payment verified",
    payment_failed: "Payment marked not received",
    refunded: "Payment refunded",
    waived: "Marked as free (payment waived)",
  };

  async function changeStatus(
    id: string,
    status: "confirmed" | "rejected" | "completed" | "cancelled" | "arrived" | "no_show",
  ) {
    const result = await updateStatus.mutateAsync({ id, status });
    if (result.error) {
      flashRow(id, "error", result.error);
      alert(result.error);
    } else {
      flashRow(id, "success", STATUS_DONE_LABELS[status] ?? "Updated");
    }
  }

  async function changePayment(
    appointmentId: string,
    status: "payment_verified" | "payment_failed" | "refunded" | "waived",
  ) {
    const result = await setPayment.mutateAsync({ appointmentId, status });
    if (result.error) {
      flashRow(appointmentId, "error", result.error);
      alert(result.error);
    } else {
      flashRow(appointmentId, "success", PAYMENT_DONE_LABELS[status] ?? "Payment updated");
    }
  }

  /** Confirmation wrapper for destructive status changes. */
  function confirmAndChangeStatus(
    a: AppointmentWithDetails,
    status: "confirmed" | "rejected" | "completed" | "cancelled" | "arrived" | "no_show",
  ) {
    if (status === "rejected") {
      if (!window.confirm("Reject this appointment? This cannot be undone.")) return;
    } else if (status === "no_show") {
      if (!window.confirm("Mark this appointment as a no-show? This cannot be undone.")) return;
    }
    void changeStatus(a.id, status);
  }

  /** Confirmation wrapper for destructive payment changes. */
  function confirmAndChangePayment(
    a: AppointmentWithDetails,
    status: "payment_verified" | "payment_failed" | "refunded" | "waived",
  ) {
    if (status === "payment_failed") {
      if (
        !window.confirm(
          "Mark this payment as NOT received? The patient's payment will be marked failed.",
        )
      )
        return;
    } else if (status === "refunded") {
      if (!window.confirm("Refund this payment? This action cannot be undone.")) return;
    }
    void changePayment(a.id, status);
  }

  /** Admin responds to a reschedule request raised by the patient. */
  async function handleApplyReschedule(id: string, action: "approve" | "reject") {
    const result = await applyReschedule.mutateAsync({ id, action });
    if (result.error) {
      flashRow(id, "error", result.error);
      alert(result.error);
    } else {
      flashRow(
        id,
        "success",
        action === "approve" ? "Reschedule approved" : "Reschedule request rejected",
      );
    }
  }

  function openVideoDialog(appointmentId: string) {
    setCallDuration(20);
    setVideoError("");
    setVideoDialog({ appointmentId, roomName: "", vcNo: "" });
  }

  async function startVideoSession() {
    if (!videoDialog) return;
    setVideoError("");
    const result = await createVideo.mutateAsync({
      appointmentId: videoDialog.appointmentId,
      durationMinutes: callDuration,
    });
    if (result.error) {
      setVideoError(result.error);
    } else if (result.session) {
      setVideoDialog({
        appointmentId: videoDialog.appointmentId,
        roomName: result.session.room_name,
        vcNo: result.session.vc_no ?? "",
      });
      if (!result.livekitConfigured) {
        setVideoError(
          "The session was created but LiveKit is not configured on the server yet — patients will not be able to join. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET, then try joining.",
        );
      }
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

  /** A video payment counts as settled once verified or waived (free). */
  function paymentSettled(paymentStatus: string): boolean {
    return paymentStatus === "payment_verified" || paymentStatus === "waived";
  }

  function renderActions(a: AppointmentWithDetails): ReactNode {
    // Pending reschedule request raised by the patient → admin decides.
    if (
      a.status !== "cancelled" &&
      a.status !== "rejected" &&
      a.reschedule_status === "pending" &&
      a.reschedule_requested_by === "patient"
    ) {
      return (
        <>
          <Button
            size="sm"
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={busy}
            onClick={() => handleApplyReschedule(a.id, "approve")}
          >
            Approve Reschedule
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600"
            disabled={busy}
            onClick={() => handleApplyReschedule(a.id, "reject")}
          >
            Reject
          </Button>
        </>
      );
    }

    const actions: ReactNode[] = [];
    const sessionDone = a.video_session_status === "completed";
    const settled = paymentSettled(a.payment_status);
    const canReschedule = !a.reschedule_status || a.reschedule_status === "none";

    // ── Video Consultation: payment gate → approval → operations ───────────
    if (a.is_video) {
      // Stage 1 — payment not settled yet: proof + verification only.
      if (a.status === "pending" && !settled) {
        actions.push(
          <Button
            key="proof"
            size="sm"
            variant="outline"
            onClick={() => setPaymentDialog(a)}
            disabled={busy}
          >
            <Banknote className="mr-1 h-3 w-3" /> View Payment Proof
          </Button>,
        );
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
              key="not-received"
              size="sm"
              variant="outline"
              className="text-red-600"
              onClick={() => confirmAndChangePayment(a, "payment_failed")}
              disabled={busy}
            >
              Payment Not Received
            </Button>,
          );
        } else {
          actions.push(
            <Button
              key="waive"
              size="sm"
              variant="outline"
              onClick={() => confirmAndChangePayment(a, "waived")}
              disabled={busy}
            >
              Waive / Free
            </Button>,
          );
        }
        return <div className="flex flex-wrap gap-1">{actions}</div>;
      }

      // Stage 2 — payment settled: approve or reject.
      if (a.status === "pending" && settled) {
        actions.push(
          <Button
            key="approve"
            size="sm"
            variant="default"
            onClick={() => changeStatus(a.id, "confirmed")}
            disabled={busy}
          >
            Approve
          </Button>,
          <Button
            key="reject"
            size="sm"
            variant="outline"
            className="text-red-600"
            onClick={() => confirmAndChangeStatus(a, "rejected")}
            disabled={busy}
          >
            Reject
          </Button>,
        );
        if (a.payment_status === "payment_verified") {
          actions.push(
            <Button
              key="refund"
              size="sm"
              variant="outline"
              onClick={() => confirmAndChangePayment(a, "refunded")}
              disabled={busy}
            >
              Refund Payment
            </Button>,
          );
        }
        return <div className="flex flex-wrap gap-1">{actions}</div>;
      }

      // Stage 3 — approved: start the call and finish the visit.
      if (a.status === "confirmed" || a.status === "arrived") {
        if (!settled) {
          // Legacy rows confirmed before the payment gate — finish payment first.
          actions.push(
            <Button
              key="proof"
              size="sm"
              variant="outline"
              onClick={() => setPaymentDialog(a)}
              disabled={busy}
            >
              <Banknote className="mr-1 h-3 w-3" /> View Payment Proof
            </Button>,
          );
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
                key="not-received"
                size="sm"
                variant="outline"
                className="text-red-600"
                onClick={() => confirmAndChangePayment(a, "payment_failed")}
                disabled={busy}
              >
                Payment Not Received
              </Button>,
            );
          }
        } else if (!sessionDone) {
          actions.push(
            <Button
              key="video"
              size="sm"
              variant="default"
              onClick={() => openVideoDialog(a.id)}
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
        if (a.status === "confirmed") {
          actions.push(
            <Button
              key="no-show"
              size="sm"
              variant="outline"
              className="text-red-600"
              onClick={() => confirmAndChangeStatus(a, "no_show")}
              disabled={busy}
            >
              No-Show
            </Button>,
          );
          if (canReschedule) {
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
          }
        }
        return <div className="flex flex-wrap gap-1">{actions}</div>;
      }

      return <span className="text-xs text-muted-foreground">—</span>;
    }

    // ── In-Clinic: previous behaviour (no payment gate) ────────────────────
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
            onClick={() => confirmAndChangeStatus(a, "rejected")}
            disabled={busy}
          >
            Reject
          </Button>
          {canReschedule ? (
            <Button size="sm" variant="outline" onClick={() => openReschedule(a)} disabled={busy}>
              Reschedule
            </Button>
          ) : null}
        </>
      );
    }
    if (a.status === "confirmed") {
      return (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => changeStatus(a.id, "arrived")}
            disabled={busy}
          >
            Arrived
          </Button>
          {canReschedule ? (
            <Button size="sm" variant="outline" onClick={() => openReschedule(a)} disabled={busy}>
              Reschedule
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="text-red-600"
            onClick={() => confirmAndChangeStatus(a, "no_show")}
            disabled={busy}
          >
            No-Show
          </Button>
        </>
      );
    }
    if (a.status === "arrived") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => changeStatus(a.id, "completed")}
          disabled={busy}
        >
          Complete
        </Button>
      );
    }
    return <span className="text-xs text-muted-foreground">—</span>;
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

      {/* Google-style unified search across clinic + video appointments */}
      <div className="relative mt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSuggestOpen(true);
              setSuggestActive(-1);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setSuggestOpen(false), 120);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search by patient name, phone, email, appointment ID…"
            role="combobox"
            aria-label="Search appointments"
            aria-expanded={suggestOpen}
            aria-controls="appointment-search-suggestions"
            className="h-12 pl-11 pr-9 text-base"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSuggestOpen(false);
                setSuggestActive(-1);
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {suggestOpen && searchQuery.trim() && (
          <div
            id="appointment-search-suggestions"
            role="listbox"
            aria-label="Appointment suggestions"
            className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
          >
            {suggestions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                No appointments or patients found
              </div>
            ) : (
              <>
                {suggestions.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    role="option"
                    aria-selected={i === suggestActive}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickSuggestion(a);
                    }}
                    onMouseEnter={() => setSuggestActive(i)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      i === suggestActive ? "bg-accent" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        <Highlighted
                          text={a.patient_name ?? "Unknown patient"}
                          query={searchQuery}
                        />
                        {a.appointment_no ? (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            <Highlighted text={a.appointment_no} query={searchQuery} />
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <Highlighted text={a.service_name ?? "Service"} query={searchQuery} /> ·{" "}
                        {a.date ? format(new Date(a.date + "T00:00:00"), "MMM d, yyyy") : "—"} ·{" "}
                        {formatTimeDisplay(a.time ?? null)} · {a.is_video ? "Video" : "In Clinic"}
                        {a.patient_phone ? (
                          <span>
                            {" "}
                            · <Highlighted text={a.patient_phone} query={searchQuery} />
                          </span>
                        ) : (
                          ""
                        )}
                      </span>
                    </span>
                    {i === suggestActive && (
                      <CornerDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                ))}
                {filtered.length > suggestions.length && (
                  <div className="px-4 pb-2 pt-1 text-xs text-muted-foreground">
                    {filtered.length} results — scroll to see them all
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Appointments</h1>
          {searchQuery.trim() ? (
            <p className="mt-1 text-sm" data-testid="appointments-result-count">
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
              <span className="text-muted-foreground"> · Manage all patient bookings</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Manage all patient bookings</p>
          )}
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
          <p className="p-8 text-center text-sm text-muted-foreground">
            {searchQuery.trim() ? "No appointments or patients found" : "No appointments found"}
          </p>
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
                  <tr key={a.id} className="text-foreground" data-focus-id={a.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        <Highlighted text={a.patient_name ?? "—"} query={searchQuery} />
                      </div>
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
                      {a.reschedule_status === "pending" && a.reschedule_date ? (
                        <div className="text-xs">
                          <span className="text-muted-foreground line-through">
                            {a.date ? format(new Date(a.date + "T00:00:00"), "MMM d, yyyy") : "—"}
                          </span>
                          <span className="ml-1 font-medium text-amber-600">
                            → {format(new Date(a.reschedule_date + "T00:00:00"), "MMM d, yyyy")}
                          </span>
                        </div>
                      ) : a.date ? (
                        format(new Date(a.date + "T00:00:00"), "MMM d, yyyy")
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.reschedule_status === "pending" && a.reschedule_date ? (
                        <span className="text-xs">
                          <span className="text-muted-foreground line-through">
                            {formatTimeDisplay(a.time ?? null)}
                          </span>
                          <span className="ml-1 font-medium text-amber-600">
                            → {formatTimeDisplay(a.reschedule_time ?? null)}
                          </span>
                        </span>
                      ) : (
                        formatTimeDisplay(a.time ?? null)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses(a.status)}`}
                        >
                          {APPOINTMENT_STATUS_LABELS[a.status as AppointmentStatusValue] ??
                            a.status}
                        </span>
                        {a.reschedule_status === "pending" &&
                          a.reschedule_requested_by === "patient" && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              Reschedule Request
                            </span>
                          )}
                        {a.reschedule_status === "pending" &&
                          a.reschedule_requested_by === "staff" && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                              Awaiting patient
                            </span>
                          )}
                        {a.reschedule_status === "none" && a.last_rescheduled_at && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            Rescheduled
                          </span>
                        )}
                      </div>
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
                      {rowFeedback[a.id] && (
                        <p
                          className={`mt-1 text-xs ${
                            rowFeedback[a.id].kind === "success"
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {rowFeedback[a.id].kind === "success" ? "✓ " : "⚠ "}
                          {rowFeedback[a.id].message}
                        </p>
                      )}
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
          setVideoError("");
          setCallDuration(20);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Video Call</DialogTitle>
            <DialogDescription>
              Pick a session duration, start the session, then join or share the link with the
              patient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <label className="text-xs font-medium text-muted-foreground">Session Duration</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[15, 20, 30, 45, 60].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setCallDuration(min)}
                    disabled={!!videoDialog?.vcNo}
                    className={`min-w-[3.5rem] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      callDuration === min
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {min} min
                  </button>
                ))}
              </div>
            </div>
            {videoError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {videoError}
              </p>
            )}
            {videoDialog?.vcNo && (
              <div className="rounded-lg bg-muted p-3">
                <label className="text-xs font-medium text-muted-foreground">
                  Patient Join Link
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={joinLinkInput}
                    onChange={(e) => setJoinLinkInput(e.target.value)}
                    className="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(joinLinkInput);
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}
            {videoDialog?.vcNo ? (
              <Button asChild className="w-full">
                <a
                  href={`${window.location.origin}/video/${encodeURIComponent(videoDialog.vcNo)}?as=doctor`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Video className="mr-2 h-4 w-4" />
                  Join as Doctor
                </a>
              </Button>
            ) : (
              <Button
                className="w-full"
                onClick={startVideoSession}
                disabled={createVideo.isPending}
              >
                {createVideo.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Video className="mr-2 h-4 w-4" />
                )}
                Start {callDuration} min Session
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {paymentDialog && (
        <PaymentProofDialog appointment={paymentDialog} onClose={() => setPaymentDialog(null)} />
      )}
    </div>
  );
}
