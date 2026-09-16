import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, MessageSquare, Send, CheckCircle2, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useMySupportMessages, useSubmitSupportTicket } from "@/hooks/queries/usePatient";
import { usePageFocus, useFocusHighlight } from "@/hooks/usePageFocus";

export const Route = createFileRoute("/patient/support")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: PatientSupportPage,
});

const statusStyles: Record<string, string> = {
  new: "bg-sky-100 text-sky-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
};

function PatientSupportPage() {
  const { data, isLoading } = useMySupportMessages();
  const submit = useSubmitSupportTicket();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const focus = usePageFocus();
  useFocusHighlight({ focus, ready: !isLoading });

  const messages = data?.messages ?? [];
  const unread = messages.filter((m) => m.status === "new" || m.status === "in_progress");

  async function handleSubmit() {
    setError("");
    if (message.trim().length < 10) {
      setError("Please describe your question (at least 10 characters).");
      return;
    }
    try {
      const result = await submit.mutateAsync({
        subject: subject.trim() || undefined,
        message: message.trim(),
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSubject("");
        setMessage("");
        setDone(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-foreground">Patient Support</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask the clinic a question — we'll reply on this page as soon as possible.
            </p>
          </div>
        </div>

        {unread.length > 0 && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            You have {unread.length} active message{unread.length === 1 ? "" : "s"} awaiting a reply
            from the clinic below.
          </div>
        )}

        <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Send className="h-4 w-4 text-primary" /> Send us a message
          </h2>
          {done ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <p className="font-semibold text-foreground">Message sent!</p>
              <p className="text-sm text-muted-foreground">
                The clinic has been notified and will reply here shortly.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid gap-3">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject (optional) — e.g. Appointment question"
                maxLength={200}
              />
              <Textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we help?"
                maxLength={4000}
              />
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button
                onClick={handleSubmit}
                disabled={submit.isPending}
                className="w-full sm:w-auto"
              >
                {submit.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                Send message
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <MessageSquare className="h-4 w-4 text-primary" /> Your messages
          {messages.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {messages.length}
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No messages yet. Send us a question above — the clinic will reply on this page.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-border bg-muted/20 p-4"
                data-focus-id={m.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {m.subject || "General question"}
                    </span>
                    <Badge className={`capitalize ${statusStyles[m.status] ?? ""}`}>
                      {m.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(m.created_at), "MMM d, yyyy, h:mm a")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-foreground">{m.message}</p>
                {m.admin_reply && (
                  <div
                    className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                    data-focus-id={`reply-${m.id}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Clinic reply
                    </p>
                    <p className="mt-1 text-sm text-emerald-900">{m.admin_reply}</p>
                    {m.replied_at && (
                      <p className="mt-1 text-xs text-emerald-700">
                        {format(new Date(m.replied_at), "MMM d, yyyy, h:mm a")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
