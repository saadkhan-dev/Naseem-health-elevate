import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useVideoJoin } from "@/hooks/queries/useVideo";
import { Button } from "@/components/ui/button";
import { Loader2, Video, Clock, ShieldAlert, AlertTriangle, ExternalLink } from "lucide-react";
import { formatTimeDisplay } from "@/lib/bookings";

/** If the join lookup hangs for this long, stop the spinner and offer a retry. */
const JOIN_TIMEOUT_MS = 20000;

export const Route = createFileRoute("/video/$vcNo")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  validateSearch: z.object({
    /** "doctor" marks the staff join path (doctor/admin auth verified server-side). */
    as: z.string().optional(),
  }),
  component: VideoCallPage,
});

function VideoCallPage() {
  const { vcNo } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: join, isLoading, refetch } = useVideoJoin(vcNo);
  const [joinTimedOut, setJoinTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading || joinTimedOut) return;
    setJoinTimedOut(false);
    const t = window.setTimeout(() => setJoinTimedOut(true), JOIN_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [isLoading, joinTimedOut]);

  const isDoctor = search.as === "doctor";
  const session = join?.session;
  const doctorReady = isDoctor && !!session && !!join?.sessionId;

  function goHome() {
    navigate({ to: "/" });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        {joinTimedOut ? (
          <div className="max-w-md text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">Still connecting</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The video session is taking longer than expected to load. Please check your internet
              connection and try again.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button
                onClick={() => {
                  setJoinTimedOut(false);
                  refetch();
                }}
                className="gap-1.5"
              >
                <Loader2 className="h-4 w-4" /> Try Again
              </Button>
              <Button variant="outline" onClick={goHome}>
                Go Home
              </Button>
            </div>
          </div>
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        )}
      </div>
    );
  }

  if (join?.error || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Video Session Unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {join?.error ??
              "No video session found for that code. The doctor may not have started the call yet."}
          </p>
          <Button className="mt-6" onClick={goHome}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (isDoctor && !doctorReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Not Authorized</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Only a logged-in doctor or admin can join the call as the doctor.
          </p>
          <Button className="mt-6" onClick={goHome}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (session.status === "completed") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Video className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Consultation Completed</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This video consultation has ended. Thank you for using Dr. Naseem Ahmed Khan's services.
          </p>
          <Button className="mt-6" onClick={goHome}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  // The Google Meet meeting was never created for this session (the doctor has
  // not started it, or the start attempt failed). Explain clearly and let the
  // page poll for when it becomes ready.
  if (!session.meetUrl) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Meeting Not Started Yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {join?.meetConfigured
              ? "The doctor has not started this video consultation yet. This page will refresh automatically — please try again in a moment."
              : "Video calls are not set up on this website yet. The clinic needs to finish the Google Meet configuration before any video consultation can start."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              onClick={() => {
                setJoinTimedOut(false);
                refetch();
              }}
              className="gap-1.5"
            >
              <Loader2 className="h-4 w-4" /> Check Again
            </Button>
            <Button variant="outline" onClick={goHome}>
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Video className="h-7 w-7 text-primary" />
        </div>
        <h2 className="mt-4 text-center text-xl font-semibold text-foreground">
          Join Video Consultation
        </h2>
        {session.durationMinutes && (
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Session duration: {session.durationMinutes} minutes
          </p>
        )}
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Powered by Google Meet — opens in a new tab
        </p>

        {session.vcNo && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2.5">
            <span className="text-xs font-medium text-primary">Video Consultation ID</span>
            <span className="min-w-0 break-all font-mono text-sm font-bold text-foreground">
              {session.vcNo}
            </span>
          </div>
        )}

        {join.appointment && (
          <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="shrink-0 text-muted-foreground">Service</span>
              <span className="min-w-0 break-words text-right font-medium text-foreground">
                {join.appointment.serviceName}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="shrink-0 text-muted-foreground">Date</span>
              <span className="min-w-0 break-words text-right font-medium text-foreground">
                {join.appointment.date}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="shrink-0 text-muted-foreground">Time</span>
              <span className="min-w-0 break-words text-right font-medium text-foreground">
                {join.appointment.time
                  ? formatTimeDisplay(join.appointment.time)
                  : "To be confirmed"}
              </span>
            </div>
          </div>
        )}

        <Button
          className="mt-4 w-full"
          onClick={() => window.open(session.meetUrl!, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-4 w-4" />
          Join Video Call
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Google Meet will open in a new tab. Allow camera and microphone access when asked.
        </p>
      </div>
    </div>
  );
}
