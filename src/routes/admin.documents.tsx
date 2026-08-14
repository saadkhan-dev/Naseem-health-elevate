import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, FileText, Download, FolderOpen } from "lucide-react";
import { useAdminDocuments } from "@/hooks/queries/useAdminExtra";
import { Button } from "@/components/ui/button";
import { staffSupabase } from "@/lib/supabase";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/documents")({
  component: AdminDocuments,
});

function AdminDocuments() {
  const { data: documents, isLoading, isError, error } = useAdminDocuments();

  async function handleDownload(fileUrl: string, fileName: string) {
    const { data } = await staffSupabase.storage
      .from("patient-documents")
      .createSignedUrl(fileUrl || fileName, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Patient Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">Medical documents uploaded by patients</p>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      <div className="mt-6 space-y-2">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (documents ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
          </div>
        ) : (
          (documents ?? []).map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{doc.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {doc.profiles?.full_name ?? "Unknown patient"} · {doc.file_name} ·{" "}
                    {format(new Date(doc.created_at), "MMM d, yyyy")}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(doc.file_url, doc.file_name)}
              >
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
