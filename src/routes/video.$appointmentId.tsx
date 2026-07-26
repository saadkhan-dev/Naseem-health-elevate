import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useVideoSession } from "@/hooks/queries/useVideo";
import { useAppointments } from "@/hooks/queries/useAdmin";
import { VideoCallRoom } from "@/components/video/VideoCallRoom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Video, Clock } from "lucide-react";
import { formatTimeDisplay } from "@/lib/bookings";

export const Route = createFileRoute("/video/$appointmentId")({
  component: VideoCallPage,
});

function VideoCallPage() {
  const { appointmentId } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isLoading: sessionLoading } = useVideoSession(appointmentId);
  const { data: appointments } = useAppointments();
  const [userName, setUserName] = useState("");
  const [joined, setJoined] = useState(false);

  const appointment = appointments?.find((a) => a.id === appointmentId);

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">No Video Session Found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The doctor hasn't started the video call yet. Please wait or contact Dr. Naseem Alam.
          </p>
          <Button className="mt-6" onClick={() => navigate({ to: "/" })}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="flex h-screen flex-col bg-black">
        <VideoCallRoom
          roomName={session.room_name}
          userName={userName || "Patient"}
          durationMinutes={session.duration_minutes}
          onLeave={() => {
            setJoined(false);
            navigate({ to: "/" });
          }}
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
        <h2 className="mt-4 text-center text-xl font-semibold text-foreground">Join Video Consultation</h2>
        {session.duration_minutes && (
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Session duration: {session.duration_minutes} minutes
          </p>
        )}

        {appointment && (
          <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium text-foreground">{appointment.service_name}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium text-foreground">{appointment.date}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Time</span>
              <span className="font-medium text-foreground">{formatTimeDisplay(appointment.time)}</span>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="text-sm font-medium text-foreground">Your Name</label>
          <Input
            placeholder="Enter your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="mt-1"
          />
        </div>

        <Button className="mt-4 w-full" onClick={() => setJoined(true)} disabled={!userName.trim()}>
          <Video className="mr-2 h-4 w-4" />
          Join Video Call
        </Button>
      </div>
    </div>
  );
}
