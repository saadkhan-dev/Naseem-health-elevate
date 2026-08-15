import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Loader2,
  FileText,
  Download,
  FolderOpen,
  Send,
  CheckCircle2,
  Search,
  FlaskConical,
  Phone,
  User,
  Inbox,
  X,
} from "lucide-react";
import {
  useAdminDocuments,
  useMarkDocumentReceived,
  useCreateTestRecommendation,
  useAdminTestRecommendations,
} from "@/hooks/queries/useAdminExtra";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { staffSupabase } from "@/lib/supabase";
import { QueryError } from "@/components/admin/QueryError";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/documents")({
  component: AdminDocuments,
});

interface RowDoc {
  id: string;
  patient_id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
  shared_at: string | null;
  status: "available" | "sent_to_doctor" | "received";
  shared_with_doctor: boolean;
  profiles?: { full_name: string | null; phone: string | null } | null;
}

function AdminDocuments() {
  const { data: documents, isLoading, isError, error } = useAdminDocuments();
  const markReceived = useMarkDocumentReceived();
  const createRecommendation = useCreateTestRecommendation();
  const { data: recommendations } = useAdminTestRecommendations();

  const [patientSearch, setPatientSearch] = useState("");
  const [patientId, setPatientId] = useState("all");
  const [reportFilter, setReportFilter] = useState("");

  const [recommendFor, setRecommendFor] = useState<RowDoc | null>(null);
  const [testName, setTestName] = useState("");
  const [testNotes, setTestNotes] = useState("");
  const [recommendError, setRecommendError] = useState("");

  async function handleDownload(doc: RowDoc) {
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

  const all = useMemo(() => documents ?? [], [documents]);

  // Distinct patients who have reports — used for the section selector.
  const patients = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; phone: string | null; count: number }
    >();
    for (const doc of all) {
      if (!doc.patient_id) continue;
      const existing = byId.get(doc.patient_id);
      if (existing) {
        existing.count += 1;
      } else {
        byId.set(doc.patient_id, {
          id: doc.patient_id,
          name: doc.profiles?.full_name ?? "Unknown patient",
          phone: doc.profiles?.phone ?? null,
          count: 1,
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);

  const sectionPatient =
    patientId === "all" ? null : (patients.find((p) => p.id === patientId) ?? null);

  const filtered = useMemo(() => {
    const ps = patientSearch.trim().toLowerCase();
    const rf = reportFilter.trim().toLowerCase();
    return all.filter((doc) => {
      if (patientId !== "all" && doc.patient_id !== patientId) return false;
      const name = (doc.profiles?.full_name ?? "Unknown patient").toLowerCase();
      const phone = (doc.profiles?.phone ?? "").toLowerCase();
      if (ps && !name.includes(ps) && !phone.includes(ps)) return false;
      const title = (doc.title ?? "").toLowerCase();
      const fileName = (doc.file_name ?? "").toLowerCase();
      if (rf && !title.includes(rf) && !fileName.includes(rf)) return false;
      return true;
    });
  }, [all, patientSearch, patientId, reportFilter]);

  function selectPatientSection(id: string) {
    setPatientId(id);
    setPatientSearch("");
    setReportFilter("");
  }

  function openRecommend(doc: RowDoc) {
    setRecommendError("");
    setTestName("");
    setTestNotes("");
    setRecommendFor(doc);
  }

  async function handleRecommend(e: React.FormEvent) {
    e.preventDefault();
    setRecommendError("");
    if (!recommendFor) return;
    const result = await createRecommendation.mutateAsync({
      patientId: recommendFor.patient_id,
      testName: testName.trim(),
      notes: testNotes.trim(),
    });
    if (result?.error) {
      setRecommendError(result.error);
      return;
    }
    setRecommendFor(null);
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medical documents uploaded by patients. Search a patient by name or phone, or pick a
          patient below to review their reports.
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
          {/* Patient selector — All Patients (default) + one section per patient */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => selectPatientSection("all")}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                patientId === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
              )}
            >
              <Inbox className="h-3.5 w-3.5" />
              All Patients
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-semibold",
                  patientId === "all" ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {all.length}
              </span>
            </button>
            {patients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPatientSection(p.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  patientId === p.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
                )}
              >
                <User className="h-3.5 w-3.5" />
                <span className="max-w-[9rem] truncate">{p.name}</span>
                {p.phone && <span className="text-[11px] opacity-70">{p.phone}</span>}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] font-semibold",
                    patientId === p.id ? "bg-primary-foreground/20" : "bg-muted",
                  )}
                >
                  {p.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search + filter — patient search (name/phone) and report search */}
          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Search patient by name or phone…"
                className="h-10 pl-9 pr-9"
              />
              {patientSearch && (
                <button
                  type="button"
                  aria-label="Clear patient search"
                  onClick={() => setPatientSearch("")}
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value)}
                placeholder="Filter reports by name…"
                className="h-10 pl-9 pr-9"
              />
              {reportFilter && (
                <button
                  type="button"
                  aria-label="Clear report filter"
                  onClick={() => setReportFilter("")}
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
              <Inbox className="h-4 w-4 text-primary" />
              {sectionPatient ? `${sectionPatient.name} — Reports` : "Recent Reports"}
              {filtered.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {filtered.length}
                </span>
              )}
            </h2>
            <div className="mt-3 space-y-2">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {all.length === 0
                      ? "No reports yet. Patient-uploaded documents will appear here."
                      : "No reports match your search or filters."}
                  </p>
                </div>
              ) : (
                filtered.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    onDownload={() => handleDownload(doc)}
                    onRecommend={() => openRecommend(doc)}
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
              <FlaskConical className="h-4 w-4 text-primary" />
              Test Recommendations
              {(recommendations ?? []).length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {(recommendations ?? []).length}
                </span>
              )}
            </h2>
            <div className="mt-3 space-y-2">
              {(recommendations ?? []).length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center">
                  <FlaskConical className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No tests recommended yet. Use "Recommend test" on a report to add one.
                  </p>
                </div>
              ) : (
                (recommendations ?? []).map((rec) => (
                  <div
                    key={rec.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FlaskConical className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {rec.test_name}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              rec.status === "completed"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {rec.status === "completed" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            {rec.status === "completed" ? "Done by patient" : "Pending"}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <User className="h-3 w-3 text-primary" />
                            {rec.profiles?.full_name ?? "Unknown patient"}
                          </span>
                          {rec.profiles?.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 text-primary" /> {rec.profiles.phone}
                            </span>
                          )}
                        </div>
                        {rec.notes && (
                          <div className="text-xs text-muted-foreground">{rec.notes}</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Recommended {format(new Date(rec.created_at), "MMM d, yyyy")}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      <Dialog open={recommendFor !== null} onOpenChange={(o) => !o && setRecommendFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recommend a test</DialogTitle>
            <DialogDescription>
              {recommendFor?.profiles?.full_name ?? "Patient"}
              {recommendFor?.profiles?.phone ? ` · ${recommendFor.profiles.phone}` : ""} — the test
              will appear on their dashboard.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecommend} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="testName">Test name</Label>
              <Input
                id="testName"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="e.g. Complete Blood Count (CBC)"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="testNotes">Notes (optional)</Label>
              <Textarea
                id="testNotes"
                value={testNotes}
                onChange={(e) => setTestNotes(e.target.value)}
                placeholder="e.g. Please get this done before your next visit."
                rows={3}
              />
            </div>
            {recommendError && (
              <p className="text-sm font-medium text-destructive">{recommendError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRecommendFor(null)}
                disabled={createRecommendation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!testName.trim() || createRecommendation.isPending}>
                {createRecommendation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4" />
                )}
                Send recommendation
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentRow({
  doc,
  onDownload,
  onRecommend,
  markReceived,
}: {
  doc: RowDoc;
  onDownload: () => void;
  onRecommend: () => void;
  markReceived?: () => void;
}) {
  const statusLabel =
    doc.status === "received"
      ? "Received"
      : doc.status === "sent_to_doctor"
        ? "Awaiting review"
        : "Not shared";
  const patientName = doc.profiles?.full_name ?? "Unknown patient";
  const patientPhone = doc.profiles?.phone ?? null;

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
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <User className="h-3 w-3 text-primary" /> {patientName}
            </span>
            {patientPhone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3 text-primary" /> {patientPhone}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {doc.file_name} · {format(new Date(doc.created_at), "MMM d, yyyy")}
            {doc.shared_at && ` · Shared ${format(new Date(doc.shared_at), "MMM d, yyyy")}`}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download className="h-3.5 w-3.5" /> Download
        </Button>
        <Button size="sm" variant="outline" className="text-primary" onClick={onRecommend}>
          <FlaskConical className="h-3.5 w-3.5" /> Recommend test
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
