import { useEffect, useState } from "react";
import "@livekit/components-styles";
import { ControlBar, LiveKitRoom, useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { reportVideoSessionEventClient } from "@/lib/video-call";
import { ConferenceLayout } from "@/components/video/ConferenceLayout";
import { ConsultationTools } from "@/components/video/ConsultationTools";
import { TranslationPatientIndicator } from "@/components/video/TranslationPatientIndicator";
import { VideoConsultationOverlay } from "@/components/video/VideoConsultationOverlay";

/**
 * Embedded LiveKit room for a video consultation. This replaced the old Jitsi
 * `VideoCallRoom` (dead code) — the call now runs inside the app on the
 * `/video/$vcNo` page instead of opening Google Meet in a new tab.
 *
 * The room's join/leave activity is reported back for the admin "LiveKit
 * Usage" estimate (`video_session_events`); reporting is best-effort and never
 * affects the consultation itself.
 */

export interface LiveKitRoomParticipantInfo {
  vcNo: string;
  isStaff: boolean;
}

interface LiveKitVideoRoomProps extends LiveKitRoomParticipantInfo {
  token: string;
  serverUrl: string;
  roomName: string;
  onDisconnected: () => void;
}

/** Records a "joined"/"left" event for the app-tracked usage estimate. */
function LiveKitRoomActivity({ vcNo, isStaff }: LiveKitRoomParticipantInfo) {
  const room = useRoomContext();
  const role = isStaff ? "doctor" : "patient";

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __lkRoom?: typeof room }).__lkRoom = room;
    }
  }, [room]);

  useEffect(() => {
    const onConnected = () => {
      void reportVideoSessionEventClient({ vcNo, role, event: "joined" });
    };
    const onDisconnected = () => {
      void reportVideoSessionEventClient({ vcNo, role, event: "left" });
    };
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room, vcNo, role]);

  return null;
}

export function LiveKitVideoRoom({
  vcNo,
  isStaff,
  token,
  serverUrl,
  roomName,
  onDisconnected,
}: LiveKitVideoRoomProps) {
  // The doctor's interpreter toggle, shared with the remote-viewer overlay
  // (data-channel broadcasts never loop back to the sender, so the overlay
  // needs the local truth to clear captions/indicator when the doctor turns it
  // OFF). `null` means "unknown yet"; patients leave it unset entirely.
  const [interpreterEnabled, setInterpreterEnabled] = useState<boolean | null>(null);
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      video
      audio
      options={{ adaptiveStream: true, dynacast: true }}
      onDisconnected={onDisconnected}
      className="vc-room-root flex h-dvh w-full flex-col overflow-hidden bg-background"
    >
      <LiveKitRoomActivity vcNo={vcNo} isStaff={isStaff} />
      <div className="vc-room-stage relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <ConferenceLayout />
        {isStaff ? (
          <ConsultationTools
            vcNo={vcNo}
            onEnabledChange={setInterpreterEnabled}
            className="absolute right-3 top-[calc(env(safe-area-inset-top)_+_0.75rem)] z-30 w-72 max-w-[calc(100%-1.5rem)]"
          />
        ) : (
          <TranslationPatientIndicator
            vcNo={vcNo}
            className="absolute left-1/2 top-[calc(env(safe-area-inset-top)_+_0.75rem)] z-30 -translate-x-1/2"
          />
        )}
        <div className="vc-room-controlbar-wrap flex w-full shrink-0 items-center justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ControlBar
            variation="minimal"
            className="vc-room-controlbar"
            controls={{
              camera: true,
              microphone: true,
              screenShare: true,
              chat: false,
              leave: true,
            }}
          />
          <VideoConsultationOverlay
            isStaff={isStaff}
            vcNo={vcNo}
            interpreterEnabled={isStaff ? interpreterEnabled : undefined}
          />
        </div>
      </div>
    </LiveKitRoom>
  );
}
