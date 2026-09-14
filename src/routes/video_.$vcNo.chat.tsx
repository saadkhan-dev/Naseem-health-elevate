import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Loader2, ShieldAlert, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useVideoJoin } from "@/hooks/queries/useVideo";
import { useConsultationEnsure, useConsultationDetail } from "@/hooks/useConsultation";
import { ConsultationChat } from "@/components/consultation/ConsultationChat";
import { formatTimeDisplay } from "@/lib/bookings";

/**
 * Full-page patient consultation chat for a video appointment.
 *
 * IMPORTANT: the leading `_` in `video_.$vcNo.chat.tsx` un-nests this route
 * from `/video/$vcNo`. The old nested route (`video.$vcNo.chat.tsx`) rendered
 * INSIDE the video page's component — which renders full-screen states with no
 * <Outlet/> — so the chat never mounted and the "Chat with Doctor" floating
 * button appeared to do nothing. This file is its own top-level route:
 * /video/$vcNo/chat renders THIS component directly, refresh and direct
 * navigation included.
 */
export const Route = createFileRoute("/video_/$vcNo/chat")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: VideoChatPage,
});

function VideoChatPage() {
  const { vcNo } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const { data: join, isLoading } = useVideoJoin(vcNo);

  const session = join?.session ?? null;
  const appointment = join?.appointment ?? null;
  const appointmentId = appointment?.appointmentId ?? null;

  const ensure = useConsultationEnsure(appointmentId, !!user && !!appointmentId, "public");
  const conversationId = ensure.data?.conversationId ?? null;
  const detail = useConsultationDetail(conversationId ?? "", !!conversationId, "public");

  const doctorName =
    detail.data?.participants.find((p) => p.role === "doctor" || p.role === "admin")?.fullName ??
    null;

  const doctorLabel = doctorName
    ? /^dr\.?\s/i.test(doctorName)
      ? doctorName
      : `Dr. ${doctorName}`
    : "Dr. Naseem Ahmed Khan";

  const initials =
    doctorLabel
      .replace(/^dr\.?\s/i, "")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  function goBack() {
    navigate({ to: "/video/$vcNo", params: { vcNo } });
  }

  // Unauthenticated: send the patient to sign-in, then return them straight
  // back to this chat (no hardcoded ids, no way in without a session).
  useEffect(() => {
    if (!loading && !user && !isLoading && session) {
      navigate({ to: "/patient", search: { redirect: `/video/${vcNo}/chat` } });
    }
  }, [loading, user, isLoading, session, navigate, vcNo]);

  if (isLoading || loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (join?.error || !session) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Session Unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {join?.error ?? "No video session found."}
          </p>
          <Button className="mt-6" onClick={goBack}>
            Back to Video Call
          </Button>
        </div>
      </div>
    );
  }

  // Unauthenticated: the effect above is redirecting to sign-in.
  if (!user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <p className="text-sm text-muted-foreground">
            No appointment linked to this consultation.
          </p>
          <Button className="mt-4" onClick={goBack}>
            Back to Video Call
          </Button>
        </div>
      </div>
    );
  }

  if (ensure.isLoading && !conversationId) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Chat Unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This consultation chat could not be opened. Please go back to the video call page and
            try again.
          </p>
          <Button className="mt-6" onClick={goBack}>
            Back to Video Call
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden lg:gap-4 lg:p-4">
        {/* ── Sidebar — desktop only ── */}
        <aside className="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-4 lg:flex">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Video Call
          </Button>

          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{doctorLabel}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Consulting Doctor
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Appointment</p>
            <div className="space-y-1.5">
              {appointment.serviceName && (
                <SidebarRow label="Service" value={appointment.serviceName} />
              )}
              <SidebarRow label="Date" value={appointment.date} />
              {appointment.time && (
                <SidebarRow label="Time" value={formatTimeDisplay(appointment.time)} />
              )}
              {appointment.appointmentNo && (
                <SidebarRow label="ID" value={appointment.appointmentNo} mono />
              )}
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => navigate({ to: "/video/$vcNo", params: { vcNo } })}
          >
            <Video className="h-4 w-4" /> Join Video Call
          </Button>
        </aside>

        {/* ── Chat pane — all screens ── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none border-none bg-background lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-soft">
          <ConsultationChat
            client={supabase}
            conversationId={conversationId}
            viewer={{ id: user.id, role: "patient", name: "", title: "Patient" }}
            detail={detail.data ?? null}
            detailLoading={detail.isLoading}
            showBackButton
            onBack={goBack}
            hideHeader
            doctorLabel={doctorLabel}
          />
        </div>
      </div>
    </div>
  );
}

function SidebarRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 truncate text-right font-medium text-foreground ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
