import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, MessageSquare, Check } from "lucide-react";
import { useAdminSupportMessages, useUpdateSupportMessage } from "@/hooks/queries/useAdminExtra";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/admin/support")({
  component: AdminSupport,
});

const statusStyles: Record<string, string> = {
  new: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700",
};

function AdminSupport() {
  const { data: messages, isLoading, isError, error } = useAdminSupportMessages();
  const updateMessage = useUpdateSupportMessage();
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  const selectedMsg = messages?.find((m) => m.id === selected) ?? null;

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Support Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">Messages from the public contact form</p>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (messages ?? []).length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No messages yet</p>
          ) : (
            (messages ?? []).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelected(m.id);
                  setNotes(m.admin_notes ?? "");
                }}
                className={`w-full rounded-xl border bg-card px-5 py-4 text-left transition ${
                  selected === m.id ? "border-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    {m.name}
                    <Badge className={`capitalize ${statusStyles[m.status] ?? statusStyles.new}`}>
                      {m.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(m.created_at), "MMM d, h:mm a")}
                  </span>
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
            <div className="flex items-center justify-between">
              <div className="font-semibold text-foreground">Message from {selectedMsg.name}</div>
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
              {selectedMsg.email && <div>Email: {selectedMsg.email}</div>}
              {selectedMsg.phone && <div>Phone: {selectedMsg.phone}</div>}
            </div>
            <div className="mt-3 rounded-lg bg-muted/40 p-4 text-sm text-foreground">
              {selectedMsg.message}
            </div>
            <label className="mt-4 block text-sm font-medium text-foreground">Admin notes</label>
            <Textarea
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this message..."
            />
            <Button
              className="mt-3 h-9 text-xs"
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
            {message && <p className="mt-3 text-sm font-medium text-destructive">{message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
