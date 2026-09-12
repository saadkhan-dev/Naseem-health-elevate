import type { LucideIcon } from "lucide-react";
import { Loader2, MessageSquare } from "lucide-react";
import type { ConversationSummaryView } from "@/lib/consultation-types";

/**
 * Start a download for a signed URL.
 *
 * The signed URLs we generate carry `download` (Content-Disposition: attachment),
 * so the browser opens the download dialog instead of navigating. We MUST NOT
 * use `window.open()` here: it runs AFTER an `await`, so popup blockers treat
 * it as a non-user-gesture and silently block it — that was why downloads
 * "did nothing". A real anchor click keeps the same-tab navigation, and with an
 * attachment disposition the page actually doesn't navigate away at all.
 */
export function openSignedDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function formatConversationTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "2-digit" });
}

export function conversationDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(now)) return "Today";
  if (day(d) === day(yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

export function formatAppointmentDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function snippetOf(message: ConversationSummaryView["lastBody"], hasFile: boolean): string {
  if (hasFile && !message) return "📎 Shared a file";
  if (!message) return "No messages yet";
  return message;
}

export function StatusBadge({
  status,
  label,
  className,
  Icon,
}: {
  status: "active" | "read_only";
  label?: string;
  className?: string;
  Icon?: LucideIcon;
}) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
        active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
      } ${className ?? ""}`}
    >
      {Icon ? <Icon className="h-3 w-3" /> : active ? "●" : "■"}
      {label ?? (active ? "Chat open" : "Read only")}
    </span>
  );
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function ChatLoadingState() {
  return (
    <div className="flex justify-center p-10">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ChatEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center sm:p-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <MessageSquare className="h-6 w-6 text-primary" />
      </div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
