import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, Copy, Check, X } from "lucide-react";
import { format } from "date-fns";
import {
  getRecentAppointment,
  clearRecentAppointment,
  type RecentAppointment,
} from "@/lib/recent-appointment";
import { formatTimeDisplay } from "@/lib/bookings";

/**
 * "My Recent Appointment" hint backed by localStorage. Shown after a guest
 * booking so the patient can get back to their Appointment ID without
 * retyping it. The "View Status" link opens the Appointment Status page with
 * the ID pre-filled — the actual lookup still requires phone/email
 * verification server-side.
 */
export function RecentAppointmentBanner() {
  const [recent, setRecent] = useState<RecentAppointment | null>(() =>
    typeof window !== "undefined" ? getRecentAppointment() : null,
  );
  const [copied, setCopied] = useState(false);

  if (!recent) return null;
  const current = recent;

  async function copyNo() {
    try {
      await navigator.clipboard.writeText(current.appointmentNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function dismiss() {
    clearRecentAppointment();
    setRecent(null);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary-soft/70 p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
          <CalendarCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-primary">My Recent Appointment</div>
          <div className="font-display text-lg font-bold text-foreground break-all">
            {recent.appointmentNo}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {recent.serviceName} ·{" "}
            {format(new Date(recent.date + "T00:00:00"), "EEEE, MMMM d, yyyy")} ·{" "}
            {recent.time ? formatTimeDisplay(recent.time) : "Time to be confirmed"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copyNo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-primary"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy ID"}
        </button>
        <Link
          to="/appointment-status"
          search={{ apt: recent.appointmentNo }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05]"
        >
          <CalendarCheck className="h-3.5 w-3.5" />
          View Status
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss recent appointment"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
