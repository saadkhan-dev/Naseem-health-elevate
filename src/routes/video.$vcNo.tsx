import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useVideoJoin, useUpdateVideoStatus } from "@/hooks/queries/useVideo";
import { VideoCallRoom } from "@/components/video/VideoCallRoom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Video, Clock, ShieldAlert, AlertTriangle } from "lucide-react";
import { formatTimeDisplay } from "@/lib/bookings";

/** If the join lookup hangs for this long, stop the spinner and offer a retry. */
const JOIN_TIMEOUT_MS = 20000;

export const Route = createFileRoute("/video/$vcNo")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  validateSearch: z.object({
    /** "doctor" opens the call in doctor mode (session completion reporting). */
    as: z.string().optional(),
    /** Pre-fills the patient's name on the join form (from the dashboard join dialog). */
    name: z.string().optional(),
  }),
  component: VideoCallPage,
});

function VideoCallPage() {
  const { vcNo } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: join, isLoading, refetch } = useVideoJoin(vcNo);
  const updateStatus = useUpdateVideoStatus();
  const [userName, setUserName] = useState(search.name ?? "");
  const [joined, setJoined] = useState(false);
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

  async function handleConferenceJoined() {
    if (!isDoctor || !join?.sessionId) return;
    try {
      await updateStatus.mutateAsync({ sessionId: join.sessionId, status: "active" });
    } catch {
      // Best-effort: the room still works even if the status stamp fails.
    }
  }

  async function handleConferenceLeft() {
    if (!isDoctor || !join?.sessionId) return;
    try {
      await updateStatus.mutateAsync({ sessionId: join.sessionId, status: "completed" });
    } catch {
      // Never surface — the doctor is leaving anyway.
    }
    setJoined(false);
    navigate({ to: "/admin/appointments" });
  }

  function goHome() {
    navigate({ to: "/" });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
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
      <div className="flex min-h-[60vh] items-center justify-center px-4">
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
      <div className="flex min-h-[60vh] items-center justify-center px-4">
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
      <div className="flex min-h-[60vh] items-center justify-center px-4">
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

  if (joined) {
    return (
      <div className="flex h-[100dvh] flex-col bg-black">
        <VideoCallRoom
          roomName={session.roomName}
          domain={session.jitsiDomain}
          userName={userName || (isDoctor ? "Dr. Naseem Ahmed Khan" : "Patient")}
          durationMinutes={session.durationMinutes}
          onLeave={() => {
            setJoined(false);
            navigate({ to: isDoctor ? "/admin/appointments" : "/" });
          }}
          onConferenceJoined={isDoctor ? handleConferenceJoined : undefined}
          onConferenceLeft={isDoctor ? handleConferenceLeft : undefined}
          captionsEnabled
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
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

        {session.vcNo && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2.5">
            <span className="text-xs font-medium text-primary">Video Consultation ID</span>
            <span className="font-mono text-sm font-bold text-foreground">{session.vcNo}</span>
          </div>
        )}

        {join.appointment && (
          <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium text-foreground">{join.appointment.serviceName}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium text-foreground">{join.appointment.date}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Time</span>
              <span className="font-medium text-foreground">
                {join.appointment.time
                  ? formatTimeDisplay(join.appointment.time)
                  : "To be confirmed"}
              </span>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="text-sm font-medium text-foreground">Your Name</label>
          <Input
            placeholder={isDoctor ? "Dr. Naseem Ahmed Khan" : "Enter your name"}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="mt-1"
          />
        </div>

        <Button className="mt-4 w-full" onClick={() => setJoined(true)} disabled={!userName.trim()}>
          <Video className="h-4 w-4" />
          Join Video Call
        </Button>
      </div>
    </div>
  );
}
