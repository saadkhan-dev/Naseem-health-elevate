import { useState } from "react";
import { CheckCircle2, Copy, Check, CalendarCheck } from "lucide-react";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { formatTimeDisplay } from "@/lib/bookings";
import { Button } from "@/components/ui/button";
import type { NotificationResult } from "@/lib/notifications";

interface BookingConfirmationProps {
  serviceName: string;
  patientName?: string;
  date: Date;
  /** "HH:mm". null for flexible services (Home Visit) — the doctor confirms the time. */
  time: string | null;
  /** Short patient-facing appointment number (e.g. "APT-7K4M92"). */
  appointmentNo: string | null;
  onClose: () => void;
  /** Delivery results for the Appointment ID (email / SMS / WhatsApp). */
  notifications?: NotificationResult[];
}

const CHANNEL_LABELS: Record<NotificationResult["channel"], string> = {
  email: "email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

function notificationNote(notifications: NotificationResult[]): string | null {
  const sent = notifications.filter((n) => n.status === "sent");
  if (sent.length > 0) {
    const labels = sent
      .map((n) => CHANNEL_LABELS[n.channel])
      .filter((v, i, a) => a.indexOf(v) === i);
    return `We've also sent your Appointment ID to your ${labels.join(" and ")}.`;
  }
  if (notifications.length > 0) {
    return "We couldn't send your Appointment ID by SMS/email because messaging isn't configured yet. Copy it above and keep it safe.";
  }
  return null;
}

export function BookingConfirmation({
  serviceName,
  patientName,
  date,
  time,
  appointmentNo,
  onClose,
  notifications = [],
}: BookingConfirmationProps) {
  const [copied, setCopied] = useState(false);
  const note = appointmentNo ? notificationNote(notifications) : null;

  async function copyNo() {
    if (!appointmentNo) return;
    try {
      await navigator.clipboard.writeText(appointmentNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
        Appointment Requested
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Your appointment has been submitted. Dr. Naseem will confirm your slot shortly. Keep your
        Appointment ID to check the status.
      </p>

      {appointmentNo && (
        <div className="mt-6 w-full max-w-xs rounded-2xl border border-primary/30 bg-primary-soft p-4">
          <div className="text-xs font-medium text-primary">Your Appointment ID</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="font-display text-2xl font-bold tracking-wide text-foreground break-all">
              {appointmentNo}
            </span>
            <button
              type="button"
              onClick={copyNo}
              aria-label="Copy Appointment ID"
              className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:text-primary"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-3 max-w-xs text-xs text-muted-foreground">{note}</p>}

      <div className="mt-4 w-full max-w-xs space-y-2 rounded-xl bg-muted p-4 text-left text-sm">
        {patientName && <Row label="Patient" value={patientName} />}
        <Row label="Service" value={serviceName} />
        <Row label="Date" value={format(date, "EEEE, MMMM d, yyyy")} />
        <Row label="Time" value={time ? formatTimeDisplay(time) : "To be confirmed by doctor"} />
        <Row label="Status" value="Pending" />
      </div>

      <div className="mt-4 w-full max-w-xs rounded-xl border border-dashed border-primary/40 bg-primary-soft/60 p-3 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-primary">Didn't save your Appointment ID?</span> No
          problem — you can find it again anytime on the{" "}
          <Link
            to="/appointment-status"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Appointment Status
          </Link>{" "}
          page using the phone number or email you used when booking.
        </p>
      </div>

      {appointmentNo && (
        <Link
          to="/appointment-status"
          search={{ apt: appointmentNo }}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:underline"
        >
          <CalendarCheck className="h-4 w-4" />
          Check your appointment status
        </Link>
      )}

      <Button className="mt-4" onClick={onClose}>
        Book another appointment
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
