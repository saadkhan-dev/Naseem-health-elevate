import { useEffect, useRef, useState } from "react";
import { Loader2, PhoneOff, Clock, AlertTriangle, Captions, CaptionsOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JitsiApi {
  addListener: (event: string, handler: (...args: unknown[]) => void) => void;
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
}

type JitsiMeetExternalAPIClass = new (domain: string, options: Record<string, unknown>) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiMeetExternalAPIClass;
  }
}

interface VideoCallRoomProps {
  roomName: string;
  /**
   * Jitsi Meet instance (host) to connect to, e.g. "jitsi.riot.im". Provided by
   * the server join lookup so the instance is never a client-side secret.
   */
  domain?: string;
  userName: string;
  durationMinutes: number;
  onLeave: () => void;
  /**
   * Reliable end signal — fired on the Jitsi `videoConferenceLeft` /
   * `readyToClose` event when THIS participant leaves the conference. Only
   * passed for the doctor's client (patients can never trigger completion).
   */
  onConferenceLeft?: () => void;
  /** Reliable join signal — fired on the Jitsi `videoConferenceJoined` event. Doctor only. */
  onConferenceJoined?: () => void;
  /**
   * Live captions / subtitles (Jitsi built-in transcription — no external key).
   * Defaults to on; patients and doctor can toggle it from the toolbar.
   */
  captionsEnabled?: boolean;
}

/** Load the Jitsi Meet External API library from the configured instance (idempotent). */
function loadJitsiScript(domain: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptId = `jitsi-external-api-${domain}`;
    const existing = document.getElementById(scriptId);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("Could not load the video call provider."));
    };
    document.body.appendChild(script);
  });
}

export function VideoCallRoom({
  roomName,
  domain = "jitsi.riot.im",
  userName,
  durationMinutes,
  onLeave,
  onConferenceLeft,
  onConferenceJoined,
  captionsEnabled = true,
}: VideoCallRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const joinedReportedRef = useRef(false);
  const leftReportedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [connectError, setConnectError] = useState(false);
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [ended, setEnded] = useState(false);
  const [captions, setCaptions] = useState(captionsEnabled);
  const captionsEnabledRef = useRef(captionsEnabled);
  const startTimeRef = useRef(Date.now());
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let fallback: number | undefined;
    let connectTimeout: number | undefined;

    setLoading(true);
    setLoadError(false);
    setConnectError(false);
    joinedReportedRef.current = false;
    leftReportedRef.current = false;
    startTimeRef.current = Date.now();

    loadJitsiScript(domain)
      .then(() => {
        if (disposed || !window.JitsiMeetExternalAPI || !containerRef.current) return;

        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          subject: "Dr. Naseem Ahmed Khan - Video Consultation",
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            // Jitsi's built-in live captions (transcription) — no external key.
            liveSubtitles: true,
            transcribingEnabled: captionsEnabledRef.current,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_REMOTE_DISPLAY_NAME: "Guest",
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "desktop",
              "fullscreen",
              "fodeviceselection",
              "hangup",
              "profile",
              "chat",
              "recording",
              "livestreaming",
              "etherpad",
              "sharedvideo",
              "shareddocument",
              "settings",
              "raisehand",
              "videoquality",
              "filmstrip",
              "invite",
              "feedback",
              "stats",
              "shortcuts",
              "tileview",
              "videobackgroundblur",
              "download",
              "help",
              "mute-everyone",
              "security",
              "captions",
            ],
          },
          userInfo: { displayName: userName },
        });
        apiRef.current = api;

        // Keep the toolbar captions button in sync with our state.
        if (captionsEnabledRef.current) {
          api.executeCommand("toggleSubtitles");
        }

        api.addListener("videoConferenceJoined", () => {
          setLoading(false);
          setConnectError(false);
          if (connectTimeout) window.clearTimeout(connectTimeout);
          if (!joinedReportedRef.current && onConferenceJoined) {
            joinedReportedRef.current = true;
            onConferenceJoined();
          }
        });

        // Jitsi surfaces connection failures through these events — surface them
        // instead of leaving the user staring at a black room forever.
        const handleError = () => {
          setLoading(false);
          setConnectError(true);
        };
        api.addListener("errorOccurred", handleError);
        api.addListener("conferenceFailed", handleError);
        api.addListener("connectionFailed", handleError);

        const handleLeft = () => {
          setLoading(false);
          if (connectTimeout) window.clearTimeout(connectTimeout);
          if (!leftReportedRef.current && onConferenceLeft) {
            leftReportedRef.current = true;
            onConferenceLeft();
          }
        };
        api.addListener("videoConferenceLeft", handleLeft);
        api.addListener("readyToClose", handleLeft);

        // Fallback so the spinner never hangs if no conference event fires.
        fallback = window.setTimeout(() => setLoading(false), 8000);

        // Give the meeting time to establish; if nothing joins within 45s show a
        // visible error + Retry instead of a silent black room.
        connectTimeout = window.setTimeout(() => {
          if (!joinedReportedRef.current) {
            setLoading(false);
            setConnectError(true);
          }
        }, 45000);
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      });

    return () => {
      disposed = true;
      if (fallback) window.clearTimeout(fallback);
      if (connectTimeout) window.clearTimeout(connectTimeout);
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [domain, roomName, userName, onConferenceJoined, onConferenceLeft, retryKey]);

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

  const handleLeave = () => {
    apiRef.current?.dispose();
    apiRef.current = null;
    onLeave();
  };

  if (ended) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Session Ended</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Your video consultation time has ended. Thank you for using Dr. Naseem Ahmed Khan's
          services.
        </p>
        <Button className="mt-6" onClick={onLeave}>
          Leave
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {loading && !loadError && !connectError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Connecting to video call...</p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-8 text-center">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">
              Could not load video call
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The video call provider could not be loaded. Please check your internet connection and
              try again.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={() => setRetryKey((k) => k + 1)} className="gap-1.5">
                <Loader2 className="h-4 w-4" /> Try Again
              </Button>
              <Button variant="outline" onClick={handleLeave}>
                Go Back
              </Button>
            </div>
          </div>
        </div>
      )}

      {connectError && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-8 text-center">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">Connection issue</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We could not connect you to the video call. Your internet connection or the video
              provider may be having problems.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={() => setRetryKey((k) => k + 1)} className="gap-1.5">
                <Loader2 className="h-4 w-4" /> Try Again
              </Button>
              <Button variant="outline" onClick={handleLeave}>
                Go Back
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 ${timerColor}`} />
          <span className={`text-sm font-medium ${timerColor}`}>{formatTime(timeLeft)}</span>
          {timeLeft < 60 && <span className="text-xs text-red-500 font-medium">(ending soon)</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          Dr. Naseem Ahmed Khan — Video Consultation
        </div>
        <div className="text-xs text-muted-foreground">{durationMinutes} min session</div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden" />

      <div className="flex items-center justify-between border-t bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {captions ? (
            <Captions className="h-4 w-4 text-primary" />
          ) : (
            <CaptionsOff className="h-4 w-4" />
          )}
          {captions ? "Live captions on" : "Live captions off"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              apiRef.current?.executeCommand("toggleSubtitles");
              setCaptions((c) => !c);
            }}
            className="gap-1.5"
          >
            {captions ? <CaptionsOff className="h-4 w-4" /> : <Captions className="h-4 w-4" />}
            Captions
          </Button>
          <Button variant="destructive" onClick={handleLeave} className="rounded-full">
            <PhoneOff className="h-4 w-4" />
            Leave Call
          </Button>
        </div>
        <div />
      </div>
    </div>
  );
}
