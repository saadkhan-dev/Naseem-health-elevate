import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { staffSupabase } from "@/lib/supabase";
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
  /** False unless this is a signed-in user on a valid video session. */
  enabled: boolean;
  /**
   * Who is looking at this video room. Patients open the patient chat route
   * /video/{vcNo}/chat; staff (doctor/admin in the `?as=doctor` room) open the
   * SAME conversation in the staff consultations route /admin/consultations/{id}.
   * Defaults to "patient" so existing callers are unchanged.
   */
  viewer?: "patient" | "staff";
}

/** How long the "X sent a message" preview stays visible before auto-hiding. */
const NOTIFICATION_MS = 6000;

/**
 * WhatsApp/AI-chatbot-style floating consultation chat launcher for the video
 * consultation page (patient AND staff/admin video rooms).
 *
 * Clicking the button (or the toast preview) opens the dedicated full-page
 * consultation chat in a NEW tab via a plain anchor (`target="_blank"
 * rel="noopener noreferrer"`): patients go to `/video/{vcNo}/chat`, staff go to
 * `/admin/consultations/{conversationId}` — the SAME existing conversation,
 * never a second chat implementation. The current video-call tab is never
 * touched: no `router.navigate()`, no `window.open()` fallback, nothing that
 * could reload or rerender the LiveKit room.
 *
 * Realtime notes (no duplicate listeners / no leaks):
 *  - This component keeps the shared message cache warm with the realtime
 *    subscription (`useConsultationMessages`) so the badge + toast update
 *    instantly. The chat page owns the active listener while it is open.
 *  - Unread is derived ONLY from the existing message data + the viewer's
 *    `consultation_participants.last_read_at`. This component NEVER marks read
 *    — that stays exclusively in `ConsultationChat`, exactly like the regular
 *    consultations page.
 */
export function FloatingConsultationChat({
  client,
  appointmentId,
  vcNo,
  enabled,
  viewer = "patient",
}: Props) {
  const location = useLocation();
  const isStaff = viewer === "staff";
  const surface = isStaff ? "staff" : "public";
  // Two auth surfaces: patients authenticate through the public `supabase`
  // client, staff/doctors through `staffSupabase`. Pick the identity that
  // matches THIS viewer so an admin/doctor inside the video room gets a real
  // user (the public client has none for staff accounts).
  const patientAuth = useAuth();
  const staffAuth = useStaffAuth();
  const { user } = isStaff ? staffAuth : patientAuth;
  // Messages/realtime must run on the surface's OWN client: staff reads are
  // RLS-gated through the staff token, exactly like the admin consultations
  // page (/admin/consultations/$id). The patient launcher keeps its own client.
  const activeClient = isStaff ? staffSupabase : client;
  const [notif, setNotif] = useState<{ id: string; label: string; snippet: string } | null>(null);

  const notifTimer = useRef<number | undefined>(undefined);
  const prevLastId = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const seenNotifRef = useRef<Set<string>>(new Set());

  const ensure = useConsultationEnsure(enabled ? appointmentId : null, enabled, surface);
  const conversationId = ensure.data?.conversationId ?? null;
  const detail = useConsultationDetail(conversationId ?? "", enabled && !!conversationId, surface);
  const live = useConsultationMessages(
    activeClient,
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

  // Peer label for the toast: a patient sees the doctor, staff see the patient.
  const peerName = useMemo(() => {
    const participants = detail.data?.participants ?? [];
    if (isStaff) {
      return (
        participants.find((p) => p.userId !== user?.id && p.role === "patient")?.fullName ?? null
      );
    }
    return (
      participants.find((p) => p.userId !== user?.id && (p.role === "doctor" || p.role === "admin"))
        ?.fullName ?? null
    );
  }, [detail.data?.participants, user?.id, isStaff]);
  const peerLabel = useMemo(() => {
    if (!peerName) return isStaff ? "The patient" : "The doctor";
    if (isStaff) return peerName;
    return /^dr\.?\s/i.test(peerName) ? peerName : `Dr. ${peerName}`;
  }, [peerName, isStaff]);

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
    setNotif({ id: last.id, label: `${peerLabel} sent a message`, snippet });
    window.clearTimeout(notifTimer.current);
    notifTimer.current = window.setTimeout(
      () => setNotif((n) => (n?.id === last.id ? null : n)),
      NOTIFICATION_MS,
    );
  }, [rows, user?.id, peerLabel]);

  // Cleanup the pending toast timer on unmount (no leaks).
  useEffect(() => () => window.clearTimeout(notifTimer.current), []);

  // The chat opens in a NEW tab (its own top-level page, like the video call).
  // We deliberately do NOT open it in-place: on mobile browsers the SPA would
  // reload under the user, and the doctor's replies need a persistent surface
  // while the call tab stays open. A plain `<a target="_blank" rel="noopener
  // noreferrer">` (see the JSX below) is the browser-native new-tab mechanism:
  // one navigation call, popup-blocker safe under a user click, and it CANNOT
  // navigate the current tab. onClick only dismisses the toast; it must never
  // call router.navigate(), window.open() or preventDefault() — the anchor does
  // the whole job, and a fallback like `window.open(...noopener...)` returning
  // null (always, per spec) used to send THIS tab to the chat page.
  function handleChatClick() {
    setNotif(null);
    window.clearTimeout(notifTimer.current);
  }

  if (!enabled || !user) return null;

  // Hide the launcher when the viewer is ALREADY on the full chat page
  // (defensive; both chat routes are un-nested so they never mount this
  // component themselves).
  const isChatRoute =
    location.pathname.startsWith("/video/") && location.pathname.endsWith("/chat");
  if (isChatRoute) return null;

  // Staff route needs the conversation id for its href. Wait for the ensure
  // call to resolve (a beat) so the anchor ALWAYS has a real URL.
  if (isStaff && !conversationId) return null;

  const badgeLabel = unread > 0 ? (unread > 9 ? "9+" : String(unread)) : null;
  const unreadAria = `${unread} unread message${unread === 1 ? "" : "s"}`;
  const chatUrl = isStaff
    ? `/admin/consultations/${encodeURIComponent(conversationId!)}`
    : `/video/${encodeURIComponent(vcNo)}/chat`;
  const chatLabel = isStaff ? "Chat with Patient" : "Chat with Doctor";

  return (
    <>
      <a
        href={chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleChatClick}
        aria-label={badgeLabel ? `Open consultation chat, ${unreadAria}` : "Open consultation chat"}
        title={badgeLabel ? unreadAria : "Open consultation chat"}
        className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:right-5 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:h-12 sm:w-auto sm:gap-2 sm:rounded-full sm:px-5"
      >
        <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
        <span className="hidden text-sm font-semibold sm:inline">{chatLabel}</span>
        {badgeLabel && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-destructive-foreground ring-2 ring-background"
          >
            {badgeLabel}
          </span>
        )}
      </a>

      {notif && (
        <div
          role="status"
          className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] left-3 z-50 flex justify-end sm:left-auto sm:right-5 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)]"
        >
          <div className="flex w-full max-w-sm items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
            <a
              href={chatUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleChatClick}
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
            </a>
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
