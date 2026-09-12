import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  Save,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useConsultationAttachments,
  useConsultationTimeline,
  useSaveConsultationSummary,
} from "@/hooks/useConsultation";
import { getConsultationAttachmentUrl } from "@/lib/consultation-data";
import type { ConsultationDetailView } from "@/lib/consultation-types";
import { openSignedDownload } from "@/components/consultation/shared";

interface Props {
  client: SupabaseClient;
  conversationId: string;
  isStaff: boolean;
  detail?: ConsultationDetailView | null;
}

export function ConsultationSidePanel({ client, conversationId, isStaff, detail }: Props) {
  const summary = detail?.summary ?? null;
  const saveSummary = useSaveConsultationSummary(conversationId);
  const timeline = useConsultationTimeline(conversationId, true);
  const attachments = useConsultationAttachments(client, conversationId, true);
  const [downloads, setDownloads] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    chief_concern: "",
    symptoms: "",
    diagnosis: "",
    doctor_notes: "",
    advice: "",
    prescription: "",
    follow_up_date: "",
    additional_notes: "",
    status: "draft" as "draft" | "final",
  });

  useEffect(() => {
    if (!summary) return;
    setForm({
      chief_concern: summary.chief_concern ?? "",
      symptoms: summary.symptoms ?? "",
      diagnosis: summary.diagnosis ?? "",
      doctor_notes: summary.doctor_notes ?? "",
      advice: summary.advice ?? "",
      prescription: summary.prescription ?? "",
      follow_up_date: summary.follow_up_date ?? "",
      additional_notes: summary.additional_notes ?? "",
      status: summary.status,
    });
  }, [summary]);

  async function save() {
    await saveSummary.mutateAsync({
      chief_concern: form.chief_concern,
      symptoms: form.symptoms,
      diagnosis: form.diagnosis,
      doctor_notes: form.doctor_notes,
      advice: form.advice,
      prescription: form.prescription,
      follow_up_date: form.follow_up_date || null,
      additional_notes: form.additional_notes,
      status: form.status,
    });
  }

  async function download(att: { id: string; message_id: string | null; file_name: string }) {
    setError(null);
    if (downloads[att.id]) {
      openSignedDownload(downloads[att.id], att.file_name || "download");
      return;
    }
    if (!att.message_id) {
      setError("This file is missing its message link and cannot be downloaded.");
      return;
    }
    try {
      const { url, fileName } = await getConsultationAttachmentUrl(conversationId, att.message_id);
      setDownloads((prev) => ({ ...prev, [att.id]: url }));
      openSignedDownload(url, fileName || att.file_name || "download");
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not download the file: ${e.message}`
          : "Could not download the file.",
      );
    }
  }

  return (
    <Tabs defaultValue={isStaff ? "summary" : "summary"}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="summary" className="gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" /> Summary
        </TabsTrigger>
        <TabsTrigger value="attachments" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Files
        </TabsTrigger>
        <TabsTrigger value="timeline" className="gap-1.5">
          <Activity className="h-3.5 w-3.5" /> History
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="space-y-4 pt-4">
        {isStaff ? (
          <div className="space-y-3">
            <Field label="Chief concern">
              <Textarea
                value={form.chief_concern}
                onChange={(e) => setForm({ ...form, chief_concern: e.target.value })}
                rows={2}
                className="min-h-[44px]"
              />
            </Field>
            <Field label="Symptoms">
              <Textarea
                value={form.symptoms}
                onChange={(e) => setForm({ ...form, symptoms: e.target.value })}
                rows={2}
                className="min-h-[44px]"
              />
            </Field>
            <Field label="Diagnosis">
              <Input
                value={form.diagnosis}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              />
            </Field>
            <Field label="Doctor's notes">
              <Textarea
                value={form.doctor_notes}
                onChange={(e) => setForm({ ...form, doctor_notes: e.target.value })}
                rows={3}
                className="min-h-[64px]"
              />
            </Field>
            <Field label="Advice">
              <Textarea
                value={form.advice}
                onChange={(e) => setForm({ ...form, advice: e.target.value })}
                rows={2}
                className="min-h-[44px]"
              />
            </Field>
            <Field label="Prescription">
              <Textarea
                value={form.prescription}
                onChange={(e) => setForm({ ...form, prescription: e.target.value })}
                rows={3}
                className="min-h-[64px]"
              />
            </Field>
            <Field label="Follow-up date">
              <Input
                type="date"
                value={form.follow_up_date}
                onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })}
              />
            </Field>
            <Field label="Additional notes">
              <Textarea
                value={form.additional_notes}
                onChange={(e) => setForm({ ...form, additional_notes: e.target.value })}
                rows={2}
                className="min-h-[44px]"
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as "draft" | "final" })}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Button
              onClick={() => void save()}
              disabled={saveSummary.isPending}
              className="w-full gap-2"
            >
              {saveSummary.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save summary
            </Button>
            {saveSummary.isError && (
              <p className="text-xs font-medium text-destructive">Could not save the summary.</p>
            )}
          </div>
        ) : (
          <SummaryReadOnly detail={detail} />
        )}
      </TabsContent>

      <TabsContent value="attachments" className="pt-4">
        {error && <p className="mb-2 text-xs font-medium text-destructive">{error}</p>}
        {attachments.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (attachments.data ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No files have been shared in this conversation yet.
          </p>
        ) : (
          <div className="space-y-2">
            {(attachments.data ?? []).map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {att.file_name}
                  </div>
                  <button
                    onClick={() => void download(att)}
                    className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Download className="h-3 w-3" />
                    {downloads[att.id] ? "Open again" : "Download"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="timeline" className="pt-4">
        {timeline.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (timeline.data ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-4">
            {(timeline.data ?? []).map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary/60" />
                <div className="text-sm font-medium text-foreground">
                  {eventLabel(ev.event_type)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ev.actor_role === "patient"
                    ? "Patient"
                    : ev.actor_role === "doctor"
                      ? "Doctor"
                      : ev.actor_role === "admin"
                        ? "Clinic admin"
                        : "System"}{" "}
                  · {new Date(ev.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        )}
      </TabsContent>
    </Tabs>
  );
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    conversation_created: "Conversation started",
    consultation_started: "Consultation started",
    status_changed: "Follow-up chat status changed",
    summary_saved: "Consultation summary saved",
    message_edited: "Message edited",
    message_deleted: "Message deleted",
    message_pinned: "Message pinned",
    message_unpinned: "Message unpinned",
    attachment_uploaded: "File shared",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SummaryReadOnly({ detail }: { detail?: ConsultationDetailView | null }) {
  const s = detail?.summary;
  if (!s) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-center">
        <CalendarDays className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          The doctor has not added a summary for this consultation yet.
        </p>
      </div>
    );
  }
  const sections: { label: string; value: string }[] = [
    { label: "Chief concern", value: s.chief_concern },
    { label: "Symptoms", value: s.symptoms },
    { label: "Diagnosis", value: s.diagnosis },
    { label: "Doctor's notes", value: s.doctor_notes },
    { label: "Advice", value: s.advice },
    { label: "Prescription", value: s.prescription },
    { label: "Additional notes", value: s.additional_notes },
  ].filter((x) => x.value.trim());
  return (
    <div className="space-y-3">
      {sections.map((x) => (
        <div key={x.label}>
          <div className="text-xs font-medium text-muted-foreground">{x.label}</div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{x.value}</p>
        </div>
      ))}
      <div className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        {s.follow_up_date && (
          <div>
            Follow-up:{" "}
            <span className="font-medium text-foreground">
              {new Date(`${s.follow_up_date}T00:00:00`).toLocaleDateString()}
            </span>
          </div>
        )}
        <div className={s.follow_up_date ? "mt-1" : ""}>
          Status: <span className="font-medium text-foreground">{s.status}</span> · Updated{" "}
          {new Date(s.updated_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
