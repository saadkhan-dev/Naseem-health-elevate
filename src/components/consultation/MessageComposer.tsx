import { useRef, useState } from "react";
import { Loader2, Send, Paperclip, FileText, Reply, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUploadConsultationAttachment,
  useSendConsultationMessage,
} from "@/hooks/useConsultation";
import type { AttachmentKind, SenderRole } from "@/lib/consultation-types";
import { cn } from "@/lib/utils";

const ATTACHMENT_LABELS: { value: AttachmentKind; label: string }[] = [
  { value: "prescription", label: "Prescription" },
  { value: "medical_report", label: "Medical report" },
  { value: "lab_result", label: "Lab result" },
  { value: "xray", label: "X-ray / scan image" },
  { value: "image", label: "Photo" },
  { value: "document", label: "Other document" },
];

interface Props {
  client: SupabaseClient;
  conversationId: string;
  myUserId: string;
  disabled: boolean;
  replyingTo?: { id: string; body: string; senderRole: SenderRole | null } | null;
  onClearReply?: () => void;
  nameLabel: string;
}

export function MessageComposer({
  client,
  conversationId,
  myUserId,
  disabled,
  replyingTo,
  onClearReply,
  nameLabel,
}: Props) {
  const [body, setBody] = useState("");
  const sendMutation = useSendConsultationMessage(conversationId);
  const uploadMutation = useUploadConsultationAttachment(client, {
    conversationId,
    userId: myUserId,
  });

  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachmentType, setAttachmentType] = useState<AttachmentKind>("document");
  const fileRef = useRef<HTMLInputElement>(null);

  const sending = sendMutation.isPending || uploadMutation.isPending;

  function submit() {
    if (!body.trim() || disabled || sending) return;
    void sendMutation.mutateAsync(body.trim()).then(() => {
      setBody("");
      onClearReply?.();
    });
  }

  function handleSendKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function pickFile(f: File) {
    if (f) {
      setPendingFile(f);
      setAttachmentType("document");
      setAttachOpen(true);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    try {
      await uploadMutation.mutateAsync({ file: pendingFile, attachmentType });
      setPendingFile(null);
      setAttachOpen(false);
    } catch {
      // error surfaced below
    }
  }

  const locked = disabled;

  return (
    <div className="border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      {locked && (
        <div className="border-b border-border bg-muted/50 px-4 py-2 text-center text-xs font-medium text-muted-foreground sm:px-6">
          This conversation is read-only. The clinic has closed follow-up chat for this
          consultation.
        </div>
      )}
      {replyingTo && (
        <div className="flex items-center gap-2 border-b border-border bg-accent/40 px-4 py-2 sm:px-6">
          <Reply className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-foreground">
              Replying to {replyingTo.senderRole === "doctor" ? "Doctor" : "You"}
            </div>
            <div className="truncate text-xs text-muted-foreground">{replyingTo.body}</div>
          </div>
          <button
            onClick={onClearReply}
            aria-label="Cancel reply"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-border hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 p-3 sm:gap-3 sm:p-4">
        <input
          ref={fileRef}
          id={`attach-${conversationId}`}
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Attach a file"
          disabled={sending || locked}
          onClick={() => fileRef.current?.click()}
          className="h-11 w-11 shrink-0 rounded-full"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1">
          <textarea
            value={body}
            disabled={sending || locked}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleSendKey}
            rows={1}
            placeholder={`Message to ${nameLabel}…`}
            aria-label={`Message to ${nameLabel}`}
            className="max-h-40 min-h-[44px] w-full resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-base text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-60 md:text-sm"
          />
        </div>

        <Button
          type="button"
          onClick={submit}
          disabled={!body.trim() || sending || locked}
          aria-label="Send message"
          className="h-11 w-11 shrink-0 rounded-full px-0"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>

      {sendMutation.isError && (
        <p className="px-4 pb-2 text-xs font-medium text-destructive sm:px-6">
          {sendMutation.error instanceof Error
            ? `Could not send the message: ${sendMutation.error.message}`
            : "Could not send the message. Please try again."}
        </p>
      )}

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach a file</DialogTitle>
            <DialogDescription>
              The file is stored privately and only {nameLabel} can see it.
            </DialogDescription>
          </DialogHeader>
          {pendingFile && (
            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-3",
                uploadMutation.isError && "border-destructive/40",
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {pendingFile.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(pendingFile.size / 1024).toFixed(0)} KB
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="attachment-kind">
              File type
            </label>
            <Select
              value={attachmentType}
              onValueChange={(v) => setAttachmentType(v as AttachmentKind)}
            >
              <SelectTrigger id="attachment-kind" className="h-11 w-full">
                <SelectValue placeholder="Select file type" />
              </SelectTrigger>
              <SelectContent>
                {ATTACHMENT_LABELS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {uploadMutation.isError && (
            <p className="text-xs font-medium text-destructive">
              Upload failed:{" "}
              {uploadMutation.error instanceof Error ? uploadMutation.error.message : "Try again"}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setAttachOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={confirmUpload} disabled={!pendingFile || sending} className="gap-2">
              {uploadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Upload file
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
