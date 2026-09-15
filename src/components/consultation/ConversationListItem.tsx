import { Link } from "@tanstack/react-router";
import { Paperclip, Timer, Video } from "lucide-react";
import type { ConversationSummaryView } from "@/lib/consultation-types";
import {
  formatAppointmentDate,
  formatConversationTime,
  StatusBadge,
  snippetOf,
} from "@/components/consultation/shared";
import { GenderBadge } from "@/components/consultation/ConsultationChat";

interface Props {
  item: ConversationSummaryView;
  to: string;
  active?: boolean;
  /** When provided, clicking selects the conversation in the same view instead of navigating. */
  onSelect?: () => void;
  /** Overrides the main title (e.g. the patient's name for the staff list). */
  contactName?: string | null;
  patientGender?: string | null;
  /**
   * Which surface renders this list. "You" in the last-sender prefix means
   * different people on each list: the patient on the patient list, the
   * doctor/admin on the staff list. Optional — defaults to the patient list.
   */
  listFor?: "patient" | "staff";
  /** When provided, becomes `data-focus-id` on the row (focus deep-link target). */
  dataFocusId?: string;
}

export function ConversationListItem({
  item,
  to,
  active,
  onSelect,
  contactName,
  patientGender,
  listFor = "patient",
  dataFocusId,
}: Props) {
  const title = contactName || item.serviceName || item.appointmentNo || "Consultation";
  const meta = [
    contactName ? item.serviceName : null,
    item.appointmentNo,
    item.appointmentDate ? formatAppointmentDate(item.appointmentDate) : null,
    item.appointmentTime ? `at ${item.appointmentTime}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // "You" depends on the surface: patient list users ASK the patient, staff
  // list users ARE the doctor (or admin) so a patient-sent last message must
  // read "Patient:" not "You:".
  const lastSenderLabel =
    item.lastSenderRole == null
      ? ""
      : listFor === "staff"
        ? item.lastSenderRole === "patient"
          ? "Patient"
          : "You"
        : item.lastSenderRole === "doctor"
          ? "Doctor"
          : "You";

  return (
    <Link
      to={to}
      data-focus-id={dataFocusId}
      onClick={(e) => {
        if (onSelect) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`block w-full rounded-2xl border p-4 text-left transition-colors ${
        active
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:border-primary/30 hover:bg-accent/40"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{title}</span>
            {item.unreadCount > 0 && (
              <span
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
                aria-label={`${item.unreadCount} unread message${item.unreadCount === 1 ? "" : "s"}`}
              >
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </span>
            )}
            {contactName && <GenderBadge gender={patientGender} />}
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {formatConversationTime(item.lastMessageAt)}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">
          {lastSenderLabel ? `${lastSenderLabel}: ` : ""}
          {snippetOf(item.lastBody, item.hasAttachments)}
        </p>
        {item.hasAttachments && (
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        {item.isVideo && item.vcNo && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
            <Video className="h-3 w-3" /> {item.vcNo}
          </span>
        )}
      </div>

      {item.messageCount != null && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Timer className="h-3 w-3" />
          {item.messageCount} message{item.messageCount === 1 ? "" : "s"}
          {item.isVideo && item.vcNo ? ` · Video ${item.vcNo}` : ""}
        </div>
      )}
    </Link>
  );
}
