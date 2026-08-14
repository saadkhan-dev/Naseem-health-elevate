import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, FileText, Download, FolderOpen, Send, CheckCircle2, Inbox } from "lucide-react";
import { useAdminDocuments, useMarkDocumentReceived } from "@/hooks/queries/useAdminExtra";
import { Button } from "@/components/ui/button";
import { staffSupabase } from "@/lib/supabase";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/documents")({
  component: AdminDocuments,
});

function AdminDocuments() {
  const { data: documents, isLoading, isError, error } = useAdminDocuments();
  const markReceived = useMarkDocumentReceived();

  async function handleDownload(doc: {
    id: string;
    file_url: string;
    file_name: string;
    status: "available" | "sent_to_doctor" | "received";
    shared_with_doctor: boolean;
  }) {
    const { data } = await staffSupabase.storage
      .from("patient-documents")
      .createSignedUrl(doc.file_url || doc.file_name, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
      // A download counts as the doctor receiving a shared document.
      if (doc.shared_with_doctor && doc.status !== "received") {
        await markReceived.mutateAsync(doc.id);
      }
    }
  }

  const all = documents ?? [];
  const shared = all.filter((d) => d.shared_with_doctor);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Patient Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medical documents uploaded by patients. Shared documents were sent to you by the patient.
        </p>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
              <Inbox className="h-4 w-4 text-primary" />
              Shared with doctor
              {shared.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {shared.length}
                </span>
              )}
            </h2>
            <div className="mt-3 space-y-2">
              {shared.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No documents shared with the doctor yet
                  </p>
                </div>
              ) : (
                shared.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    onDownload={() => handleDownload(doc)}
                    markReceived={
                      markReceived.isPending ? undefined : () => markReceived.mutateAsync(doc.id)
                    }
                  />
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
              <Send className="h-4 w-4 text-primary" />
              All patient documents
              {all.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {all.length}
                </span>
              )}
            </h2>
            <div className="mt-3 space-y-2">
              {all.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
                </div>
              ) : (
                all.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} onDownload={() => handleDownload(doc)} />
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

interface RowDoc {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
  shared_at: string | null;
  status: "available" | "sent_to_doctor" | "received";
  shared_with_doctor: boolean;
  profiles?: { full_name: string | null } | null;
}

function DocumentRow({
  doc,
  onDownload,
  markReceived,
}: {
  doc: RowDoc;
  onDownload: () => void;
  markReceived?: () => void;
}) {
  const statusLabel =
    doc.status === "received"
      ? "Received"
      : doc.status === "sent_to_doctor"
        ? "Awaiting review"
        : "Not shared";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                doc.status === "received"
                  ? "bg-emerald-100 text-emerald-700"
                  : doc.status === "sent_to_doctor"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {doc.status === "received" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              {statusLabel}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {doc.profiles?.full_name ?? "Unknown patient"} · {doc.file_name} ·{" "}
            {format(new Date(doc.created_at), "MMM d, yyyy")}
            {doc.shared_at && ` · Shared ${format(new Date(doc.shared_at), "MMM d, yyyy")}`}
          </div>
        </div>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download className="h-3.5 w-3.5" /> Download
        </Button>
        {markReceived && doc.status === "sent_to_doctor" && (
          <Button size="sm" variant="outline" className="text-primary" onClick={markReceived}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark as received
          </Button>
        )}
      </div>
    </div>
  );
}
