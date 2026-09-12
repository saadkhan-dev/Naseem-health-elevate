import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Info,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  useConsultationMessages,
  useDeleteConsultationMessage,
  useEditConsultationMessage,
  useMarkConversationRead,
  useSetConsultationStatus,
  useToggleConsultationPin,
  consultationKeys,
} from "@/hooks/useConsultation";
import { getConsultationAttachmentUrl } from "@/lib/consultation-data";
import {
  StatusBadge,
  conversationDayLabel,
  formatConversationTime,
  openSignedDownload,
} from "@/components/consultation/shared";
import { MessageComposer } from "@/components/consultation/MessageComposer";
import { ConsultationSidePanel } from "@/components/consultation/ConsultationSidePanel";
import { formatAppointmentDate } from "@/components/consultation/shared";
import { PATIENT_MESSAGE_MODIFY_WINDOW_MS } from "@/lib/consultation-types";
import type {
  ConsultationDetailView,
  ConsultationMessageRow,
  ConsultationRole,
} from "@/lib/consultation-types";
import { cn } from "@/lib/utils";

interface Props {
  client: SupabaseClient;
  conversationId: string;
  viewer: { id: string; role: ConsultationRole; name: string; title: string };
  detail?: ConsultationDetailView | null;
  detailLoading?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
}

const FILE_ICON: Record<string, string> = {
  prescription: "text-emerald-600",
  medical_report: "text-sky-600",
  lab_result: "text-violet-600",
  xray: "text-amber-600",
  image: "text-fuchsia-600",
  document: "text-slate-500",
};

/**
 * Scroll to the latest message. On desktop/mobile-internal-scroll layouts the
 * messages list has its own overflow; on the mobile consultations page the list
 * can grow to natural height and the PAGE scrolls instead — in that case fall
 * back to scrolling the scroll-anchor into view.
 */
function scrollToLatest(el: HTMLElement, smooth: boolean) {
  if (el.scrollHeight - el.clientHeight > 8) {
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  } else {
    const anchor = document.getElementById("chat-scroll-anchor");
    if (anchor) {
      anchor.scrollIntoView({ block: "end", behavior: smooth ? "smooth" : "auto" });
    }
  }
}

export function ConsultationChat({
  client,
  conversationId,
  viewer,
  detail,
  detailLoading,
  showBackButton,
  onBack,
}: Props) {
  const isStaff = viewer.role !== "patient";
  const { messages, hasMore, loadOlder, total } = useConsultationMessages(client, conversationId);

  const markRead = useMarkConversationRead(client, conversationId, viewer.id);
  const setStatus = useSetConsultationStatus(conversationId);
  const editMutation = useEditConsultationMessage(conversationId);
  const deleteMutation = useDeleteConsultationMessage(conversationId);
  const pinMutation = useToggleConsultationPin(conversationId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const lastReadMsgRef = useRef<string | null>(null);
  const lastRowCountRef = useRef(0);
  const lastMsgIdRef = useRef<string | null>(null);

  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    body: string;
    senderRole: ConsultationMessageRow["sender_role"];
  } | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingDownloadId, setPendingDownloadId] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(0);

  const qc = useQueryClient();

  const rows = useMemo(() => messages.data ?? [], [messages.data]);
  // Realtime refresh of the recipient's read marker so the ticks update live.
  useEffect(() => {
    if (!conversationId) return;
    const channel = client
      .channel(`consultation-participants-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "consultation_participants",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: consultationKeys.detail(conversationId) });
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [client, conversationId, qc]);
  // The composer is ALWAYS rendered. It is only locked when we positively know
  // the conversation is read-only; while detail is loading, or when the detail
  // call failed, the input stays usable and the RLS INSERT policy still
  // enforces `status = 'active'` and `sender_id = auth.uid()`.
  const readOnly = detail && !detailLoading ? detail.status !== "active" : false;
  const canSend = !readOnly;

  // Scroll to latest on first load & when new messages arrive while near the
  // bottom. Older-history prepends ("Load older") never auto-scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = lastRowCountRef.current > 0 && rows.length > lastRowCountRef.current;
    const last = rows[rows.length - 1];
    const prepended = grew && !!last && lastMsgIdRef.current === last.id;
    if (grew && !prepended && !nearBottomRef.current && last && last.sender_id !== viewer.id) {
      setNewBelow((c) => c + 1);
    }
    if (!prepended && nearBottomRef.current && (grew || lastRowCountRef.current === 0)) {
      scrollToLatest(el, false);
    }
    lastMsgIdRef.current = last?.id ?? null;
    lastRowCountRef.current = rows.length;
  }, [rows.length, rows, viewer.id]);

  // On mobile the messages list can outgrow its box (the page scrolls instead
  // of the list). Track near-bottom from the PAGE scroll in that case so the
  // "new message" pill and auto-scroll still behave like a chat.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollHeight - el.clientHeight > 8) return;
    const onWinScroll = () => {
      const anchor = document.getElementById("chat-scroll-anchor");
      if (!anchor) return;
      const near = anchor.getBoundingClientRect().bottom - window.innerHeight < 40;
      nearBottomRef.current = near;
      if (near) setNewBelow(0);
    };
    window.addEventListener("scroll", onWinScroll, { passive: true });
    onWinScroll();
    return () => window.removeEventListener("scroll", onWinScroll);
  }, [conversationId, rows.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottomRef.current = atBottom;
    if (atBottom) setNewBelow(0);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (el) scrollToLatest(el, true);
    setNewBelow(0);
  }

  // Mark read only when the user is actually viewing (pinned to bottom). Not
  // merely because the component mounted or loaded older history.
  const newest = rows[rows.length - 1];
  useEffect(() => {
    if (!newest || !detail) return;
    if (newest.sender_id === viewer.id) return; // own messages don't count as unread
    if (!nearBottomRef.current) return;
    if (lastReadMsgRef.current === newest.id) return;
    lastReadMsgRef.current = newest.id;
    const t = window.setTimeout(() => {
      void markRead.mutate();
    }, 400);
    return () => window.clearTimeout(t);
  }, [newest?.id, newest, detail, markRead, viewer.id]);

  const pinned = useMemo(() => rows.filter((m) => m.is_pinned && !m.deleted_at), [rows]);

  // The recipient's read marker — the "other" participant of this conversation.
  const otherReadAt = useMemo<string | null>(() => {
    if (!detail) return null;
    const other = detail.participants.find((p) =>
      isStaff ? p.role === "patient" : p.role === "doctor" || p.role === "admin",
    );
    return other?.lastReadAt ?? null;
  }, [detail, isStaff]);

  function isReadByRecipient(m: ConsultationMessageRow): boolean {
    return !!otherReadAt && m.created_at <= otherReadAt;
  }

  // Patient edit/delete window (WhatsApp-style); staff always allowed.
  function canModify(m: ConsultationMessageRow): boolean {
    if (isStaff) return true;
    return Date.now() - new Date(m.created_at).getTime() <= PATIENT_MESSAGE_MODIFY_WINDOW_MS;
  }

  async function download(m: ConsultationMessageRow) {
    if (pendingDownloadId || m.message_type !== "file") return;
    setErrorMsg(null);
    setPendingDownloadId(m.id);
    try {
      const { url, fileName } = await getConsultationAttachmentUrl(conversationId, m.id);
      openSignedDownload(url, fileName || m.attachments?.[0]?.file_name || "download");
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? `Could not download the file: ${e.message}`
          : "Could not download the file.",
      );
    } finally {
      setPendingDownloadId(null);
    }
  }

  function jumpTo(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const nameLabel = detail?.appointment?.patientName || (isStaff ? "the patient" : "Doctor");
  const headerTitle = isStaff
    ? (detail?.appointment?.patientName ?? detail?.appointment?.serviceName ?? "Consultation")
    : (detail?.appointment?.serviceName ?? "Consultation");
  const patientGender = detail?.appointment?.patientGender ?? null;
  const subtitle = detail
    ? detail.appointment
      ? [
          detail.appointment.serviceName,
          detail.appointment.date ? formatAppointmentDate(detail.appointment.date) : null,
          detail.appointment.time ? `at ${detail.appointment.time}` : null,
          detail.appointment.appointmentNo ? detail.appointment.appointmentNo : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Consultation"
    : "Consultation";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            {showBackButton && (
              <button
                onClick={onBack}
                aria-label="Back to conversations"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground lg:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
                  {headerTitle}
                </h2>
                {isStaff && <GenderBadge gender={patientGender} />}
                <StatusBadge status={detail?.status ?? "active"} />
              </div>
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isStaff && detail && (
              <label className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Follow-up chat
                <Switch
                  checked={detail.status === "active"}
                  onCheckedChange={(on) => setStatus.mutate(on ? "active" : "read_only")}
                  disabled={setStatus.isPending}
                  aria-label="Toggle follow-up chat"
                />
              </label>
            )}
            {detail?.appointment?.vcNo && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  window.open(
                    `/video/${detail.appointment!.vcNo}${isStaff ? "?as=doctor" : ""}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <Video className="h-4 w-4 text-primary" /> Open Video
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowPanel((v) => !v)}
              aria-pressed={showPanel}
            >
              <Info className="h-4 w-4" />
              {showPanel ? "Hide details" : "Details"}
            </Button>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1">
        {/* Messages */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {pinned.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-amber-50/60 px-4 py-2">
              <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              {pinned.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  onClick={() => jumpTo(m.id)}
                  className="shrink-0 rounded-full border border-amber-200 bg-background px-2.5 py-1 text-xs text-muted-foreground transition hover:border-amber-400 hover:text-foreground"
                >
                  {m.body.length > 40 ? `${m.body.slice(0, 40)}…` : m.body}
                </button>
              ))}
            </div>
          )}

          <div className="relative min-h-0 min-w-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full min-h-0 w-full min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
            >
              {hasMore && (
                <div className="mb-3 flex justify-center">
                  <button
                    onClick={() => void loadOlder()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    Load older messages
                    {total > 60 && <span>({total})</span>}
                  </button>
                </div>
              )}

              {rows.length === 0 ? (
                <div className="flex justify-center py-16 text-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">No messages yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {canSend
                        ? "Say hello or share a file to start the conversation."
                        : "The consultation notes will appear here once messages are exchanged."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {rows.map((m, i) => {
                    const prev = rows[i - 1];
                    const isDayBoundary =
                      !prev ||
                      new Date(m.created_at).getDate() !== new Date(prev.created_at).getDate();
                    const mine = m.sender_id === viewer.id;
                    return (
                      <div key={m.id}>
                        {isDayBoundary && (
                          <div className="my-3 flex items-center justify-center">
                            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                              {conversationDayLabel(m.created_at)}
                            </span>
                          </div>
                        )}
                        <div id={`msg-${m.id}`} className="group py-1">
                          <div
                            className={cn(
                              "flex w-full min-w-0",
                              mine ? "justify-end" : "justify-start",
                            )}
                          >
                            <div
                              className={cn(
                                "min-w-0 max-w-[85%] sm:max-w-[75%]",
                                mine ? "items-end" : "items-start",
                              )}
                            >
                              {m.deleted_at ? (
                                <div className="max-w-full wrap-anywhere rounded-2xl bg-muted/60 px-4 py-2 text-xs italic text-muted-foreground">
                                  Message deleted
                                </div>
                              ) : (
                                <>
                                  {m.reply_to && (
                                    <button
                                      onClick={() => jumpTo(m.reply_to!.id)}
                                      className="mb-1 block w-fit max-w-full overflow-hidden rounded-lg bg-accent/70 px-2.5 py-1 text-left text-xs text-muted-foreground"
                                    >
                                      <span className="font-medium">
                                        {m.reply_to.sender_role === "doctor" ? "Doctor" : "You"}
                                      </span>
                                      :{" "}
                                      <span className="truncate">
                                        {m.reply_to.deleted_at
                                          ? "deleted message"
                                          : m.reply_to.body && m.reply_to.body.length > 90
                                            ? `${m.reply_to.body.slice(0, 90)}…`
                                            : (m.reply_to.body ?? "")}
                                      </span>
                                    </button>
                                  )}

                                  {editing?.id === m.id ? (
                                    <div className="w-full max-w-md rounded-2xl border bg-card p-2">
                                      <textarea
                                        value={editing.draft}
                                        autoFocus
                                        onChange={(e) =>
                                          setEditing({ id: m.id, draft: e.target.value })
                                        }
                                        className="min-h-[60px] w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                                      />
                                      <div className="mt-1 flex justify-end gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setEditing(null)}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          disabled={!editing.draft.trim() || editMutation.isPending}
                                          onClick={() =>
                                            void editMutation
                                              .mutateAsync({ messageId: m.id, body: editing.draft })
                                              .then(() => setEditing(null))
                                          }
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      className={cn(
                                        "min-w-0 max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                                        mine
                                          ? "rounded-br-md bg-primary text-primary-foreground"
                                          : "rounded-bl-md border border-border bg-card text-foreground",
                                      )}
                                    >
                                      {m.message_type === "file" ? (
                                        <AttachmentBubble
                                          message={m}
                                          mine={mine}
                                          onDownload={() => void download(m)}
                                          downloading={pendingDownloadId === m.id}
                                        />
                                      ) : (
                                        <p className="whitespace-pre-wrap wrap-anywhere">
                                          {m.body}
                                        </p>
                                      )}
                                      <div
                                        className={cn(
                                          "mt-1 flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px]",
                                          mine
                                            ? "text-primary-foreground/70"
                                            : "text-muted-foreground",
                                        )}
                                      >
                                        {m.is_pinned && (
                                          <Pin className="h-3 w-3" aria-label="Pinned" />
                                        )}
                                        <span className="whitespace-nowrap">
                                          {formatConversationTime(m.created_at)}
                                        </span>
                                        {m.edited_at && (
                                          <span className="whitespace-nowrap">· edited</span>
                                        )}
                                        {mine && (
                                          <ReadTicks
                                            read={isReadByRecipient(m)}
                                            className={cn(
                                              mine
                                                ? isReadByRecipient(m)
                                                  ? "text-sky-300"
                                                  : "text-primary-foreground/50"
                                                : "text-muted-foreground",
                                            )}
                                          />
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              {!m.deleted_at &&
                                (mine || isStaff) &&
                                canModify(m) &&
                                (editing?.id !== m.id ? (
                                  <div className="mt-1 flex justify-end gap-0.5 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
                                    {mine && (
                                      <ActionIcon
                                        label="Edit"
                                        onClick={() => setEditing({ id: m.id, draft: m.body })}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </ActionIcon>
                                    )}
                                    {(mine || isStaff) && (
                                      <ActionIcon
                                        label={m.is_pinned ? "Unpin" : "Pin"}
                                        onClick={() =>
                                          void pinMutation.mutate({
                                            messageId: m.id,
                                            pinned: !m.is_pinned,
                                          })
                                        }
                                      >
                                        {m.is_pinned ? (
                                          <PinOff className="h-3.5 w-3.5" />
                                        ) : (
                                          <Pin className="h-3.5 w-3.5" />
                                        )}
                                      </ActionIcon>
                                    )}
                                    {mine ? (
                                      deleteConfirmId === m.id ? (
                                        <ActionIcon
                                          label="Confirm delete"
                                          onClick={() => {
                                            setDeleteConfirmId(null);
                                            void deleteMutation.mutate(m.id);
                                          }}
                                          className="text-red-600"
                                        >
                                          <CheckSquare className="h-3.5 w-3.5" />
                                        </ActionIcon>
                                      ) : (
                                        <ActionIcon
                                          label="Delete"
                                          onClick={() => setDeleteConfirmId(m.id)}
                                          className="text-red-600"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </ActionIcon>
                                      )
                                    ) : null}
                                  </div>
                                ) : null)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div id="chat-scroll-anchor" aria-hidden="true" className="h-px" />

            <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
              <button
                onClick={() => {
                  const el = scrollRef.current;
                  if (el && el.scrollHeight - el.clientHeight > 8) {
                    el.scrollTo({ top: 0, behavior: "smooth" });
                  } else {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                aria-label="Scroll to top"
                title="Scroll to top"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                onClick={jumpToLatest}
                aria-label="Scroll to latest message"
                title="Scroll to latest message"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {newBelow > 0 && (
            <button
              onClick={jumpToLatest}
              className="absolute bottom-[76px] left-1/2 z-10 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 text-xs font-semibold text-primary shadow-md transition hover:brightness-[1.03]"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              {newBelow} new message{newBelow > 1 ? "s" : ""}
            </button>
          )}

          {errorMsg && (
            <div className="border-t border-border bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive sm:px-6">
              {errorMsg}
            </div>
          )}

          <MessageComposer
            client={client}
            conversationId={conversationId}
            myUserId={viewer.id}
            disabled={readOnly}
            replyingTo={replyingTo}
            onClearReply={() => setReplyingTo(null)}
            nameLabel={nameLabel}
          />
        </div>

        {/* Details drawer — overlays the messages so it ALWAYS fits inside the
            chat card and never pushes the layout. Internally scrollable with
            its own ↑/↓ arrows, like a WhatsApp info panel. */}
        {showPanel && (
          <div className="absolute inset-y-0 right-0 z-20 flex h-full w-full flex-col border-l border-border bg-card shadow-xl lg:w-[380px] lg:max-w-[70%]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Consultation details</h3>
              <button
                onClick={() => setShowPanel(false)}
                aria-label="Close details"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <div
                ref={panelScrollRef}
                className="h-full overflow-y-auto overscroll-contain px-4 py-4 lg:px-5"
              >
                <ConsultationSidePanel
                  client={client}
                  conversationId={conversationId}
                  isStaff={isStaff}
                  detail={detail}
                />
              </div>
              <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
                <button
                  onClick={() => panelScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                  aria-label="Scroll details to top"
                  title="Scroll to top"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition hover:bg-accent hover:text-foreground"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() =>
                    panelScrollRef.current?.scrollTo({
                      top: panelScrollRef.current.scrollHeight,
                      behavior: "smooth",
                    })
                  }
                  aria-label="Scroll details to bottom"
                  title="Scroll to bottom"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition hover:bg-accent hover:text-foreground"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionIcon({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function AttachmentBubble({
  message,
  mine,
  onDownload,
  downloading,
}: {
  message: ConsultationMessageRow;
  mine: boolean;
  onDownload: () => void;
  downloading: boolean;
}) {
  const att = message.attachments?.[0];
  const kind = att?.attachment_type ?? "document";
  return (
    <div className="flex min-w-0 max-w-full items-center gap-3 sm:min-w-[180px]">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          FILE_ICON[kind],
          "bg-black/5",
          mine && "bg-black/10",
        )}
      >
        {att?.attachment_type === "image" || kind === "xray" ? (
          <FileText className="h-5 w-5" />
        ) : (
          <FileText className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {message.body || att?.file_name || "File"}
        </div>
        <div className="text-[11px] opacity-70">
          {att ? `${(att.file_size / 1024).toFixed(0)} KB · ${kind.replace(/_/g, " ")}` : "File"}
        </div>
      </div>
      {downloading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <button
          onClick={onDownload}
          aria-label="Download file"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-black/10"
        >
          <Download className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** WhatsApp-style read receipt: single tick = sent, double blue = read. */
function ReadTicks({ read, className }: { read: boolean; className?: string }) {
  return read ? (
    <CheckCheck className={`h-3.5 w-3.5 ${className ?? ""}`} aria-label="Read by recipient" />
  ) : (
    <Check className={`h-3.5 w-3.5 ${className ?? ""}`} aria-label="Sent" />
  );
}

/** Small pink ♀ / blue ♂ symbol shown next to the patient's name. */
export function GenderBadge({ gender }: { gender?: string | null }) {
  if (gender === "female") {
    return (
      <span
        aria-label="Female patient"
        title="Female"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-pink-100 text-[11px] font-bold text-pink-600"
      >
        ♀
      </span>
    );
  }
  if (gender === "male") {
    return (
      <span
        aria-label="Male patient"
        title="Male"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-600"
      >
        ♂
      </span>
    );
  }
  return null;
}
