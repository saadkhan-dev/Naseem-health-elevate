import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Loader2, MessageSquare, Search, X } from "lucide-react";
import { staffSupabase } from "@/lib/supabase";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useStaffConsultationHistory, useConsultationDetail } from "@/hooks/useConsultation";
import { ConversationListItem } from "@/components/consultation/ConversationListItem";
import { ConsultationChat } from "@/components/consultation/ConsultationChat";
import {
  ChatEmptyState,
  ChatLoadingState,
  formatAppointmentDate,
} from "@/components/consultation/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffHistoryFilters } from "@/lib/consultation-data";

export const Route = createFileRoute("/admin/consultations")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AdminConsultations,
});

function AdminConsultations() {
  const { user } = useStaffAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [filters, setFilters] = useState<StaffHistoryFilters>({});
  const [suggestOpen, setSuggestOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, error } = useStaffConsultationHistory(filters);
  const detail = useConsultationDetail(selectedId ?? "", !!selectedId, "staff");

  const viewingChat = !!selectedId;

  // Google-style suggestions while typing (or when the box is focused).
  const suggestions = useMemo(() => (data ?? []).slice(0, 8), [data]);

  function pick(id: string) {
    setSelectedId(id);
    setSuggestOpen(false);
  }

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selectedId]);

  // Close the suggestion dropdown when clicking outside the search box.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Live search on every keystroke: the query matches a name, appointment no,
  // email, service — or a date (e.g. 2026-09 or 2026-09-12). The date picker
  // filters the exact appointment date.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters({
        q: q.trim() || undefined,
        from: dateFilter || undefined,
        to: dateFilter || undefined,
        status: status === "all" ? undefined : (status as "active" | "read_only"),
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, dateFilter, status]);

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && suggestions[0]) {
      e.preventDefault();
      pick(suggestions[0].conversationId);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Patient Consultations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Persistent patient chat and consultation history. Search by name or date — matching
          conversations appear as suggestions while you type.
        </p>
      </div>

      <div className="gap-6 lg:grid lg:h-[calc(100dvh-12rem)] lg:min-h-[26rem] lg:grid-cols-[420px_1fr] lg:overflow-hidden">
        {/* List column */}
        <section
          className={`min-h-0 flex-col gap-3 overflow-x-hidden lg:flex lg:h-full lg:overflow-y-auto ${
            viewingChat ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Filters */}
          <div ref={searchRef} className="rounded-2xl border border-border bg-card p-2 sm:p-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setSuggestOpen(true);
                  }}
                  onFocus={() => setSuggestOpen(true)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Type to search name or date…"
                  className="h-10 w-full rounded-full border border-input bg-background pl-9 pr-9 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/70"
                />
                {q && (
                  <button
                    onClick={() => {
                      setQ("");
                      setSuggestOpen(true);
                    }}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                {suggestOpen && (
                  <ul
                    role="listbox"
                    className="z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-xl lg:absolute lg:left-0 lg:right-0"
                  >
                    {suggestions.length === 0 ? (
                      <li className="px-3 py-2.5 text-sm text-muted-foreground">
                        {isLoading ? "Searching…" : "No matches found."}
                      </li>
                    ) : (
                      suggestions.map((c) => (
                        <li key={c.conversationId}>
                          <button
                            role="option"
                            onClick={() => pick(c.conversationId)}
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition hover:bg-accent"
                          >
                            <span className="flex w-full items-center gap-2 truncate text-sm font-medium text-foreground">
                              <span className="truncate">
                                {c.patientName || c.serviceName || c.appointmentNo}
                              </span>
                              {c.unreadCount > 0 && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-primary/70" />
                              )}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {[c.appointmentNo, c.serviceName, c.appointmentDate]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              <div className="relative shrink-0">
                <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  aria-label="Filter by appointment date"
                  className="h-10 w-[8.6rem] rounded-full border border-input bg-background pl-8 pr-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/70 sm:w-40"
                />
                {dateFilter && (
                  <button
                    onClick={() => setDateFilter("")}
                    aria-label="Clear date filter"
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Chat open</SelectItem>
                  <SelectItem value="read_only">Read only</SelectItem>
                </SelectContent>
              </Select>
              {dateFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                  {formatAppointmentDate(dateFilter)}
                </span>
              )}
            </div>
          </div>

          {isError && (
            <div className="text-sm font-medium text-destructive">
              <p>Could not load consultations.</p>
              <p className="mt-1 break-all text-xs opacity-80">
                {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
          )}
          {isLoading ? (
            <ChatLoadingState />
          ) : (data ?? []).length === 0 ? (
            <ChatEmptyState
              title="No conversations found"
              description="No patients match the filters. Try broadening your search."
            />
          ) : (
            (data ?? []).map((item) => (
              <ConversationListItem
                key={item.conversationId}
                item={item}
                to="/admin/consultations"
                active={item.conversationId === selectedId}
                onSelect={() => setSelectedId(item.conversationId)}
                contactName={item.patientName}
                patientGender={item.patientGender}
                listFor="staff"
              />
            ))
          )}
        </section>

        {/* Chat column */}
        <section
          className={`flex-col lg:flex lg:h-full lg:min-h-0 ${
            viewingChat ? "flex min-h-[65vh] lg:h-full lg:min-h-0" : "hidden lg:flex"
          }`}
        >
          {selectedId && user ? (
            <div className="min-h-0 flex-1 rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
              <ConsultationChat
                client={staffSupabase}
                conversationId={selectedId}
                viewer={{ id: user.id, role: "doctor", name: "", title: "Doctor" }}
                detail={detail.data}
                detailLoading={detail.isLoading}
                showBackButton
                onBack={() => setSelectedId(null)}
              />
            </div>
          ) : (
            <div className="hidden min-h-[60vh] items-center justify-center rounded-2xl border border-dashed border-border bg-card text-muted-foreground lg:flex">
              <div className="text-center">
                <MessageSquare className="mx-auto h-10 w-10" />
                <p className="mt-3 text-sm">Select a patient conversation to view the chat</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
