import { useEffect } from "react";
import "@livekit/components-styles";
import {
  ControlBar,
  LiveKitRoom,
  useRoomContext,
  VideoConference,
} from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { reportVideoSessionEventClient } from "@/lib/video-call";

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
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      video
      audio
      options={{ adaptiveStream: true, dynacast: true }}
      onDisconnected={onDisconnected}
      className="livekit-room-root flex min-h-dvh w-full flex-col bg-background"
    >
      <LiveKitRoomActivity vcNo={vcNo} isStaff={isStaff} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <VideoConference />
        <ControlBar
          variation="minimal"
          controls={{ camera: true, microphone: true, screenShare: true, chat: false, leave: true }}
        />
      </div>
    </LiveKitRoom>
  );
}
