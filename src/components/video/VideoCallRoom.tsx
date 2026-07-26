import { useRef, useEffect, useState, useCallback } from "react";
import { Loader2, PhoneOff, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoCallRoomProps {
  roomName: string;
  userName: string;
  durationMinutes: number;
  onLeave: () => void;
}

export function VideoCallRoom({ roomName, userName, durationMinutes, onLeave }: VideoCallRoomProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [ended, setEnded] = useState(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (ended) return;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = durationMinutes * 60 - elapsed;
      if (remaining <= 0) {
        setTimeLeft(0);
        setEnded(true);
        clearInterval(timer);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [durationMinutes, ended]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const timerColor =
    timeLeft < 60 ? "text-red-500" : timeLeft < 300 ? "text-amber-500" : "text-green-500";

  if (ended) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Session Ended</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Your video consultation time has ended. Thank you for using Dr. Naseem Alam's services.
        </p>
        <Button className="mt-6" onClick={onLeave}>
          Leave
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Connecting to video call...</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 ${timerColor}`} />
          <span className={`text-sm font-medium ${timerColor}`}>
            {formatTime(timeLeft)}
          </span>
          {timeLeft < 60 && (
            <span className="text-xs text-red-500 font-medium">(ending soon)</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Dr. Naseem Alam — Video Consultation
        </div>
        <div className="text-xs text-muted-foreground">
          {durationMinutes} min session
        </div>
      </div>

      <div className="flex-1">
        <iframe
          ref={iframeRef}
          src={`https://meet.jit.si/${encodeURIComponent(roomName)}#config.subject=${encodeURIComponent("Dr. Naseem Alam - Video Consultation")}&userInfo.displayName=${encodeURIComponent(userName)}&config.startWithAudioMuted=false&config.startWithVideoMuted=false`}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          className="h-full w-full rounded-none border-0"
          onLoad={() => setLoading(false)}
          title="Video Consultation"
        />
      </div>

      <div className="flex items-center justify-between border-t bg-card px-4 py-3">
        <div className="text-xs text-muted-foreground">
          {userName}
        </div>
        <Button variant="destructive" onClick={onLeave} className="rounded-full">
          <PhoneOff className="mr-2 h-4 w-4" />
          Leave Call
        </Button>
        <div />
      </div>
    </div>
  );
}
