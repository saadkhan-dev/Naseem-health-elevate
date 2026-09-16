import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Loader2,
  MessageSquare,
  Check,
  Send,
  Reply,
  Search,
  Inbox,
  Clock,
  CheckCheck,
  XCircle,
  UserRound,
} from "lucide-react";
import {
  useAdminSupportMessages,
  useUpdateSupportMessage,
  useReplySupportMessage,
} from "@/hooks/queries/useAdminExtra";
import type { NotificationResult } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/admin/QueryError";
import { usePageFocus, useFocusHighlight } from "@/hooks/usePageFocus";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/support")({
  component: AdminSupport,
});

const statusStyles: Record<string, string> = {
  new: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700",
};

const deliveryStyles: Record<NotificationResult["status"], string> = {
  sent: "bg-green-100 text-green-700",
  not_configured: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

function DeliveryBadge({ result }: { result: NotificationResult }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
        deliveryStyles[result.status]
      }`}
      title={result.detail}
    >
      {result.channel} · {result.status.replace("_", " ")}
    </span>
  );
}

function AdminSupport() {
  const { data: messages, isLoading, isError, error } = useAdminSupportMessages();
  const updateMessage = useUpdateSupportMessage();
  const replySupport = useReplySupportMessage();
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const [replyResults, setReplyResults] = useState<NotificationResult[] | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "open" | "resolved" | "closed">("all");
  const [search, setSearch] = useState("");

  const all = useMemo(() => messages ?? [], [messages]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((m) => {
      if (filter === "new" && m.status !== "new") return false;
      if (filter === "open" && m.status !== "in_progress") return false;
      if (filter === "resolved" && m.status !== "resolved") return false;
      if (filter === "closed" && m.status !== "closed") return false;
      if (!q) return true;
      return (
        (m.name ?? "").toLowerCase().includes(q) ||
        (m.subject ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [all, filter, search]);

  const counts = useMemo(
    () => ({
      all: all.length,
      new: all.filter((m) => m.status === "new").length,
      open: all.filter((m) => m.status === "in_progress").length,
      resolved: all.filter((m) => m.status === "resolved").length,
      closed: all.filter((m) => m.status === "closed").length,
    }),
    [all],
  );

  const selectedMsg = messages?.find((m) => m.id === selected) ?? null;

  // Deep-link focus: new support-message notifications navigate to
  // /admin/support?focus=support&id=<uuid> — open + highlight the message.
  const pageFocus = usePageFocus();
  const supportFocus = pageFocus?.focus === "support" ? pageFocus : null;
  const supportFocusId = supportFocus?.id ?? null;

  useFocusHighlight({ focus: supportFocus, ready: !isLoading });

  const filterTabs: { key: typeof filter; label: string; count: number; Icon: typeof Inbox }[] = [
    { key: "all", label: "All", count: counts.all, Icon: Inbox },
    { key: "new", label: "New", count: counts.new, Icon: Clock },
    { key: "open", label: "Open", count: counts.open, Icon: MessageSquare },
    { key: "resolved", label: "Resolved", count: counts.resolved, Icon: CheckCheck },
    { key: "closed", label: "Closed", count: counts.closed, Icon: XCircle },
  ];

  const handledFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!supportFocusId) return;
    const msg = (messages ?? []).find((m) => m.id === supportFocusId);
    if (msg && handledFocusRef.current !== supportFocusId) {
      // The focused message may be hidden by the active filter — relax to "all".
      handledFocusRef.current = supportFocusId;
      setFilter("all");
      setSelected(msg.id);
      setNotes(msg.admin_notes ?? "");
    }
  }, [supportFocusId, messages]);

  function selectMessage(id: string) {
    setSelected(id);
    setNotes("");
    setReply("");
    setReplyError("");
    setReplyResults(null);
  }

  async function handleSendReply() {
    if (!selectedMsg) return;
    if (!reply.trim()) return;
    setReplyError("");
    setReplyResults(null);
    const result = await replySupport.mutateAsync({ id: selectedMsg.id, reply });
    if (result.error) {
      setReplyError(result.error);
      return;
    }
    setReplyResults(result.notifications);
    setReply("");
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Support Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Messages from the public contact form — reply, change status or save internal notes
        </p>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-2">
            {filterTabs.map(({ key, label, count, Icon }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  filter === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    filter === key ? "bg-primary-foreground/20" : "bg-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email, phone, subject…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {all.length === 0 ? "No messages yet" : "No messages match this filter"}
            </p>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMessage(m.id)}
                data-focus-id={m.id}
                className={`w-full rounded-xl border bg-card px-5 py-4 text-left transition ${
                  selected === m.id ? "border-primary" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-foreground">
                    <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{m.name}</span>
                    {m.patient_id && (
                      <UserRound
                        className="h-3.5 w-3.5 shrink-0 text-primary"
                        aria-label="From a registered patient account"
                      />
                    )}
                    <Badge className={`capitalize ${statusStyles[m.status] ?? statusStyles.new}`}>
                      {m.status.replace("_", " ")}
                    </Badge>
                    {m.replied_at && <Badge className="bg-green-100 text-green-700">Replied</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(m.created_at), "MMM d, h:mm a")}
                    </span>
                    {m.status === "new" && !m.replied_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs text-emerald-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateMessage.mutateAsync({
                            id: m.id,
                            data: { status: "resolved" as const },
                          });
                          if (selected === m.id) {
                            setReply("");
                            setReplyError("");
                            setReplyResults(null);
                          }
                        }}
                      >
                        <Check className="h-3 w-3" /> Resolve
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.message}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {m.email ?? m.phone ?? "no contact"}
                  {m.subject ? ` · ${m.subject}` : ""}
                </div>
              </button>
            ))
          )}
        </div>

        {selectedMsg && (
          <div className="h-fit rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 font-semibold text-foreground">
                Message from {selectedMsg.name}
              </div>
              <Select
                value={selectedMsg.status}
                onValueChange={async (v) => {
                  setMessage("");
                  const result = await updateMessage.mutateAsync({
                    id: selectedMsg.id,
                    data: { status: v as never },
                  });
                  if (result.error) setMessage(result.error);
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["new", "in_progress", "resolved", "closed"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              {selectedMsg.patient_id && (
                <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <UserRound className="h-3.5 w-3.5" /> From a registered patient account
                </div>
              )}
              {selectedMsg.email && <div>Email: {selectedMsg.email}</div>}
              {selectedMsg.phone && <div>Phone: {selectedMsg.phone}</div>}
              <div>Received: {format(new Date(selectedMsg.created_at), "MMM d, yyyy h:mm a")}</div>
            </div>
            <div className="mt-3 rounded-lg bg-muted/40 p-4 text-sm text-foreground">
              {selectedMsg.message}
            </div>

            {selectedMsg.replied_at && selectedMsg.admin_reply && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                  <Check className="h-4 w-4" />
                  Reply sent on {format(new Date(selectedMsg.replied_at), "MMM d, h:mm a")}
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-green-900">
                  {selectedMsg.admin_reply}
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground">
                Reply to {selectedMsg.name}
              </label>
              <Textarea
                className="mt-1"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write the clinic's reply — it is delivered by email/SMS (when configured) and stored on this message. Sending also marks it resolved."
                rows={5}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  className="h-10 text-xs"
                  size="sm"
                  disabled={replySupport.isPending || !reply.trim()}
                  onClick={handleSendReply}
                >
                  <Send className="h-3.5 w-3.5" /> Send reply
                </Button>
                {replySupport.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {replyError && (
                  <span className="text-sm font-medium text-destructive">{replyError}</span>
                )}
                {replyResults && replyResults.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Reply className="h-3.5 w-3.5 text-muted-foreground" />
                    {replyResults.map((r) => (
                      <DeliveryBadge key={r.channel} result={r} />
                    ))}
                  </div>
                )}
                {replyResults && replyResults.length === 0 && !replyError && (
                  <span className="text-xs text-muted-foreground">
                    Reply saved. This message has no email/phone for delivery.
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <label className="block text-sm font-medium text-foreground">Admin notes</label>
              <Textarea
                className="mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes about this message..."
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  className="h-10 text-xs"
                  size="sm"
                  disabled={updateMessage.isPending}
                  onClick={async () => {
                    setMessage("");
                    const result = await updateMessage.mutateAsync({
                      id: selectedMsg.id,
                      data: {
                        admin_notes: notes,
                        ...(selectedMsg.status === "new" ? { status: "in_progress" as const } : {}),
                      },
                    });
                    if (result.error) setMessage(result.error);
                  }}
                >
                  <Check className="h-3.5 w-3.5" /> Save notes
                </Button>
                {message && <span className="text-sm font-medium text-destructive">{message}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
