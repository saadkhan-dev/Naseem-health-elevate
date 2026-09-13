import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, MessageSquare } from "lucide-react";
import { staffSupabase } from "@/lib/supabase";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useConsultationDetail } from "@/hooks/useConsultation";
import { ConsultationChat } from "@/components/consultation/ConsultationChat";

export const Route = createFileRoute("/admin/consultations/$id")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AdminConversationView,
});

function AdminConversationView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useStaffAuth();
  const { data: detail, isLoading, isError, error } = useConsultationDetail(id, true, "staff");

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center gap-3 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium text-foreground">Conversation not found</p>
        <p className="max-w-sm break-all text-sm text-muted-foreground">
          {isError && error instanceof Error
            ? error.message
            : "This conversation may have been removed or you do not have access to it."}
        </p>
        <button
          onClick={() => navigate({ to: "/admin/consultations" })}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          Back to consultations
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col overflow-hidden lg:h-[calc(100dvh-4.5rem)]">
      <ConsultationChat
        client={staffSupabase}
        conversationId={id}
        viewer={{ id: user.id, role: "doctor", name: "", title: "Doctor" }}
        detail={detail}
        showBackButton
        onBack={() => navigate({ to: "/admin/consultations" })}
      />
    </div>
  );
}
