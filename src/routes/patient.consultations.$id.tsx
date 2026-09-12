import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2, Video, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useConsultationDetail } from "@/hooks/useConsultation";
import { ConsultationChat } from "@/components/consultation/ConsultationChat";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/patient/consultations/$id")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: z.object({
    /** VC code of an active video consultation — shows a "join the call" banner. */
    openVideo: z.string().optional(),
  }),
  component: PatientConversationView,
});

function PatientConversationView() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: detail, isLoading, isError, error, refetch } = useConsultationDetail(id);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  if (!user || isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const dismissVideoBanner = () =>
    navigate({ to: "/patient/consultations/$id", params: { id }, search: {} });

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-0 flex-col gap-3 lg:h-[calc(100dvh-7rem)]">
      {search.openVideo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Video className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Video consultation is on</div>
              <p className="truncate text-xs text-muted-foreground">
                Keep this chat open to message during the call. If Google Meet didn't open
                automatically, use the button.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() =>
                window.open(`/video/${search.openVideo}`, "_blank", "noopener,noreferrer")
              }
            >
              <Video className="h-4 w-4" /> Open Video Meeting
            </Button>
            <button
              onClick={dismissVideoBanner}
              aria-label="Dismiss video banner"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-destructive">
              Could not load this conversation.
            </p>
            <p className="mt-0.5 break-all text-xs text-destructive/80">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <ConsultationChat
          client={supabase}
          conversationId={id}
          viewer={{ id: user.id, role: "patient", name: "", title: "Patient" }}
          detail={detail ?? null}
          showBackButton
          onBack={() => navigate({ to: "/patient/consultations" })}
        />
      </div>
    </div>
  );
}
