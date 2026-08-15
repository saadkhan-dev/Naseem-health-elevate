import { useState } from "react";
import { CheckCircle2, Copy, Check, CalendarCheck, Wallet } from "lucide-react";
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
  /**
   * Video consultations are prepaid — when present, a payment panel is shown
   * instead of the plain confirmation. Payment happens on the video
   * consultation payment page (transaction ID or receipt upload).
   */
  video?: {
    /** Charged amount in Rs. (after any offer). */
    amount: number;
    /** Offer title when a video offer was applied at booking. */
    offerTitle: string | null;
    /** When true the consultation was fully waived — no payment is needed. */
    isWaived: boolean;
  };
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
  video,
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
        You will soom receive a message to confirm your appointment. If you don't receive a confirmation message within 3 hours, plz contact <strong>03152968384</strong>
      </p>

      {appointmentNo && (
        <div className="mt-6 w-full max-w-xs rounded-2xl border border-primary/30 bg-primary-soft p-4">
          <div className="text-xs font-medium text-primary">Keep Your Appointment ID </div>
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

      {video && appointmentNo && (
        <div className="mt-4 w-full max-w-xs rounded-2xl border border-primary/30 bg-primary-soft p-4 text-left">
          {video.isWaived ? (
            <>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  No Payment Needed — Your Consultation is FREE
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {video.offerTitle
                  ? `${video.offerTitle} covered the full consultation fee.`
                  : "Your consultation fee was fully covered."}{" "}
                The clinic will confirm your appointment and unlock the video call.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Prepaid video consultation
                </span>
                <span className="text-sm font-bold text-primary">Rs. {video.amount}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Pay using the clinic's payment methods, then submit your transaction ID or upload
                your receipt on the video consultation payment page to unlock your call.
              </p>
              <Link
                to="/appointment-status"
                search={{ apt: appointmentNo }}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Wallet className="h-4 w-4" /> Pay for your video consultation
              </Link>
            </>
          )}
        </div>
      )}

      <div className="mt-4 w-full max-w-xs rounded-xl border border-dashed border-primary/40 bg-primary-soft/60 p-3 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-primary">To check your appointment status, </span> 
          Please enter your name, phone number or Email.{" "}
          <Link
            to="/appointment-status"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
          
          </Link>{" "}
         
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
