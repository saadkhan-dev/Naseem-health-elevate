import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  useConsultationDetail,
  useConsultationEnsure,
  useConsultationMessages,
} from "@/hooks/useConsultation";

interface Props {
  client: SupabaseClient;
  /** The video appointment linked to this consultation conversation. */
  appointmentId: string;
  /** The video session number, used to build the chat page route. */
  vcNo: string;
  /** False unless this is a signed-in patient on a valid video session. */
  enabled: boolean;
}

/** How long the "X sent a message" preview stays visible before auto-hiding. */
const NOTIFICATION_MS = 6000;

/**
 * WhatsApp/AI-chatbot-style floating consultation chat launcher for the Google
 * Meet / video consultation page.
 *
 * Clicking the button (or the toast preview) opens the dedicated full-page
 * consultation chat at `/video/{vcNo}/chat` in a new tab (safe same-tab
 * fallback when the browser blocks it). No panel, no in-place chat UI.
 *
 * Realtime notes (no duplicate listeners / no leaks):
 *  - This component keeps the shared message cache warm with the realtime
 *    subscription (`useConsultationMessages`) so the badge + toast update
 *    instantly. The chat page owns the active listener while it is open.
 *  - Unread is derived ONLY from the existing message data + the patient's
 *    `consultation_participants.last_read_at`. This component NEVER marks read
 *    — that stays exclusively in `ConsultationChat`, exactly like the regular
 *    consultations page.
 */
export function FloatingConsultationChat({ client, appointmentId, vcNo, enabled }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notif, setNotif] = useState<{ id: string; label: string; snippet: string } | null>(null);

  const notifTimer = useRef<number | undefined>(undefined);
  const prevLastId = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const seenNotifRef = useRef<Set<string>>(new Set());

  const ensure = useConsultationEnsure(enabled ? appointmentId : null, enabled);
  const conversationId = ensure.data?.conversationId ?? null;
  const detail = useConsultationDetail(conversationId ?? "", enabled && !!conversationId);
  const live = useConsultationMessages(
    client,
    conversationId ?? "",
    enabled && !!conversationId,
    true,
  );

  const rows = useMemo(() => live.messages.data ?? [], [live.messages.data]);

  const myParticipant = detail.data?.participants.find((p) => p.userId === user?.id);
  const myLastRead = myParticipant?.lastReadAt ?? null;
  const unread = useMemo(() => {
    if (!user) return 0;
    return rows.filter((m) => m.sender_id !== user.id && m.created_at > (myLastRead ?? "")).length;
  }, [rows, user, myLastRead]);

  const doctorName =
    detail.data?.participants.find((p) => p.role === "doctor" || p.role === "admin")?.fullName ??
    null;
  const doctorLabel = useMemo(() => {
    if (!doctorName) return "The doctor";
    return /^dr\.?\s/i.test(doctorName) ? doctorName : `Dr. ${doctorName}`;
  }, [doctorName]);

  // Toast preview + badge feed. Baselines on first load so historical unread
  // never toasts; only NEW doctor messages do. The same message is never
  // re-shown (seen-set + last-id guard). No alert().
  useEffect(() => {
    const last = rows[rows.length - 1];
    if (!last) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevLastId.current = last.id;
      return;
    }
    if (last.id === prevLastId.current) return;
    prevLastId.current = last.id;
    if (last.sender_id === user?.id) return;
    if (last.message_type === "system") return;
    if (seenNotifRef.current.has(last.id)) return;
    seenNotifRef.current.add(last.id);
    const snippet = last.body?.trim() || (last.message_type === "file" ? "sent a file" : "");
    setNotif({ id: last.id, label: `${doctorLabel} sent a message`, snippet });
    window.clearTimeout(notifTimer.current);
    notifTimer.current = window.setTimeout(
      () => setNotif((n) => (n?.id === last.id ? null : n)),
      NOTIFICATION_MS,
    );
  }, [rows, user?.id, doctorLabel]);

  // Cleanup the pending toast timer on unmount (no leaks).
  useEffect(() => () => window.clearTimeout(notifTimer.current), []);

  /**
   * Open the dedicated full-page consultation chat at /video/{vcNo}/chat.
   *
   * The chat opens in a NEW TAB (like the Google Meet join). We deliberately do
   * NOT open it in-place: on mobile browsers the SPA would reload under the
   * user, and the doctor's replies need a persistent surface while the call
   * tab stays open. `window.open` runs synchronously inside the click handler,
   * so popup blockers allow it; if the browser still blocks/returns null, we
   * fall back to same-tab navigation so the chat ALWAYS opens.
   */
  function openChat() {
    setNotif(null);
    window.clearTimeout(notifTimer.current);
    const url = `/video/${encodeURIComponent(vcNo)}/chat`;
    const win = window.open(url, "_blank", "noopener");
    if (!win) {
      // Blocked or unsupported — navigate in this tab as a safe fallback.
      navigate({ to: "/video/$vcNo/chat", params: { vcNo } });
    }
  }

  if (!enabled || !user) return null;

  // Hide the launcher when the patient is ALREADY on the full chat page
  // (same-tab fallback). The chat route is un-nested (video_.$vcNo.chat.tsx)
  // so it never mounts this component itself; the URL check is defensive.
  const isChatRoute =
    location.pathname.startsWith("/video/") && location.pathname.endsWith("/chat");
  if (isChatRoute) return null;

  const badgeLabel = unread > 0 ? (unread > 9 ? "9+" : String(unread)) : null;
  const unreadAria = `${unread} unread message${unread === 1 ? "" : "s"}`;

  return (
    <>
      <button
        type="button"
        onClick={openChat}
        aria-label={badgeLabel ? `Open consultation chat, ${unreadAria}` : "Open consultation chat"}
        title={badgeLabel ? unreadAria : "Open consultation chat"}
        className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:right-5 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:h-12 sm:w-auto sm:gap-2 sm:rounded-full sm:px-5"
      >
        <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
        <span className="hidden text-sm font-semibold sm:inline">Chat with Doctor</span>
        {badgeLabel && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-destructive-foreground ring-2 ring-background"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {notif && (
        <div
          role="status"
          className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] left-3 z-50 flex justify-end sm:left-auto sm:right-5 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)]"
        >
          <div className="flex w-full max-w-sm items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
            <button
              type="button"
              onClick={openChat}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {notif.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {notif.snippet}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setNotif(null)}
              aria-label="Dismiss notification"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
