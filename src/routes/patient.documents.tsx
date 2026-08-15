import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Upload,
  FileText,
  Trash2,
  Download,
  FolderOpen,
  Send,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useMyDocuments,
  useDeleteMyDocument,
  useShareMyDocument,
} from "@/hooks/queries/usePatient";
import type { PatientDocumentStatus } from "@/lib/patient-data";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { QueryError } from "@/components/admin/QueryError";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/documents")({
  component: PatientDocuments,
});

function PatientDocuments() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: documents, isLoading, isError, error } = useMyDocuments();
  const deleteDoc = useDeleteMyDocument();
  const shareDoc = useShareMyDocument();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [downloadLinks, setDownloadLinks] = useState<Record<string, string>>({});

  async function handleFile(file: File) {
    if (!user) return;
    setMessage(null);
    setUploading(true);
    try {
      const cleanName = file.name.replace(/[^\w.-]/g, "_");
      const path = `${user.id}/${crypto.randomUUID()}-${cleanName}`;
      const { error: uploadError } = await supabase.storage
        .from("patient-documents")
        .upload(path, file, { upsert: false });

      if (uploadError) {
        setMessage({ text: `Upload failed: ${uploadError.message}`, kind: "error" });
        return;
      }

      const fileUrl = path;
      const { error: insertError } = await supabase.from("documents").insert({
        patient_id: user.id,
        title: title.trim() || file.name,
        file_name: file.name,
        file_url: fileUrl,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
      });
      if (insertError) {
        setMessage({
          text: `Could not save document record: ${insertError.message}`,
          kind: "error",
        });
        return;
      }
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      setMessage({ text: "Document uploaded.", kind: "success" });
      qc.invalidateQueries({ queryKey: ["patient", "documents"] });
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc: { id: string; file_name: string; file_url: string }) {
    if (downloadLinks[doc.id]) {
      window.open(downloadLinks[doc.id], "_blank");
      return;
    }
    const { data } = await supabase.storage
      .from("patient-documents")
      .createSignedUrl(doc.file_url || doc.file_name, 300);
    if (data?.signedUrl) {
      setDownloadLinks((prev) => ({ ...prev, [doc.id]: data.signedUrl }));
      window.open(data.signedUrl, "_blank");
    } else {
      setMessage({ text: "Could not generate a download link.", kind: "error" });
    }
  }

  async function handleDelete(docId: string) {
    setMessage(null);
    const result = await deleteDoc.mutateAsync(docId);
    if (result?.error) {
      setMessage({ text: result.error, kind: "error" });
    }
  }

  async function handleShare(docId: string) {
    setMessage(null);
    const result = await shareDoc.mutateAsync(docId);
    if (result?.error) {
      setMessage({ text: result.error, kind: "error" });
    } else {
      setMessage({ text: "Document sent to Dr. Naseem for review.", kind: "success" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload reports, prescriptions and scans so Dr. Naseem can review them.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="text-sm font-medium text-foreground">Upload a new document</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title (e.g. Blood report — August 2026)"
          />
          <div className="flex gap-2">
            <Button asChild className={cn("h-10", uploading && "pointer-events-none opacity-60")}>
              <label htmlFor="doc-file" className="cursor-pointer">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Choose file
              </label>
            </Button>
          </div>
        </div>
        <input
          ref={fileRef}
          id="doc-file"
          type="file"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {message && (
          <p
            className={`mt-2 text-sm font-medium ${
              message.kind === "error" ? "text-destructive" : "text-primary"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {isError && (
        <div>
          <QueryError error={error} />
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (documents ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No documents yet. Upload a report or prescription above.
            </p>
          </div>
        ) : (
          (documents ?? []).map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-soft"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {doc.title}
                    </span>
                    <DocumentStatusBadge status={doc.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {doc.file_name} · {(doc.file_size / 1024).toFixed(0)} KB ·{" "}
                    {format(new Date(doc.created_at), "MMM d, yyyy")}
                    {doc.shared_at && ` · Sent ${format(new Date(doc.shared_at), "MMM d, yyyy")}`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {doc.status === "available" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-primary"
                    disabled={shareDoc.isPending}
                    onClick={() => handleShare(doc.id)}
                  >
                    {shareDoc.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Send to Doctor
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => handleDownload(doc)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600"
                  disabled={deleteDoc.isPending || doc.status !== "available"}
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DocumentStatusBadge({ status }: { status: PatientDocumentStatus }) {
  const config: Record<
    PatientDocumentStatus,
    { label: string; className: string; icon: "check" | "clock" | "send" }
  > = {
    available: { label: "Not sent", className: "bg-muted text-muted-foreground", icon: "clock" },
    sent_to_doctor: {
      label: "Sent to Doctor",
      className: "bg-primary/10 text-primary",
      icon: "send",
    },
    received: {
      label: "Received",
      className: "bg-emerald-100 text-emerald-700",
      icon: "check",
    },
  };
  const c = config[status] ?? config.available;
  const Icon = c.icon === "check" ? CheckCircle2 : c.icon === "send" ? Send : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.className}`}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}
