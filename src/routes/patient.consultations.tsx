import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { usePatientConsultationHistory, useConsultationDetail } from "@/hooks/useConsultation";
import { ConversationListItem } from "@/components/consultation/ConversationListItem";
import { ConsultationChat } from "@/components/consultation/ConsultationChat";
import { ChatEmptyState, ChatLoadingState } from "@/components/consultation/shared";

export const Route = createFileRoute("/patient/consultations")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: PatientConsultations,
});

function PatientConsultations() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = usePatientConsultationHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useConsultationDetail(selectedId ?? "", !!selectedId);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selectedId]);

  const viewingChat = !!selectedId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Consultation History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Past and ongoing conversations with Dr. Naseem Ahmed Khan linked to your appointments.
        </p>
      </div>

      <div className="gap-6 lg:grid lg:h-[calc(100dvh-14.5rem)] lg:min-h-[26rem] lg:grid-cols-[340px_1fr] lg:overflow-hidden">
        {/* List column */}
        <section
          className={`min-h-0 flex-col gap-2 overflow-x-hidden lg:flex lg:h-full lg:overflow-y-auto ${
            viewingChat ? "hidden lg:flex" : "flex"
          }`}
        >
          {isError && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-semibold text-destructive">
                Could not load your consultations.
              </p>
              <p className="mt-1 break-all text-xs text-destructive/80">
                {error instanceof Error ? error.message : String(error)}
              </p>
              <button
                onClick={() => void refetch()}
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}
          {isLoading ? (
            <ChatLoadingState />
          ) : !isError && (data ?? []).length === 0 ? (
            <ChatEmptyState
              title="No conversations yet"
              description="A conversation will appear here once you open a chat from your appointments or start a video consultation."
            />
          ) : (
            (data ?? []).map((item) => (
              <ConversationListItem
                key={item.conversationId}
                item={item}
                to="/patient/consultations"
                active={item.conversationId === selectedId}
                onSelect={() => setSelectedId(item.conversationId)}
              />
            ))
          )}
        </section>

        {/* Chat column — shown on lg always; on mobile only when a conversation is selected */}
        <section
          className={`flex-col lg:flex lg:h-full lg:min-h-0 ${
            viewingChat
              ? "flex h-[calc(100dvh-23rem)] min-h-[20rem] lg:h-full lg:min-h-0"
              : "hidden lg:flex"
          }`}
        >
          {selectedId && user ? (
            <div className="min-h-0 flex-1 rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
              <ConsultationChat
                client={supabase}
                conversationId={selectedId}
                viewer={{ id: user.id, role: "patient", name: "", title: "Patient" }}
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
                <p className="mt-3 text-sm">Select a conversation to view the chat</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
