import { useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";

/**
 * The MediaStreamTrack currently behind the local microphone publication. Any
 * raw-mic readers keep their OWN snapshot taken before a swap, so this hook is
 * primarily the raw-mic tracker: it re-reads when the room connects and when
 * the underlying track ends (mic device switched in the browser), which is how
 * the raw mic stays fresh while the interpreter is OFF.
 */
export function useLocalMicTrack(): MediaStreamTrack | null {
  const room = useRoomContext();
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const ref = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    const participant = room.localParticipant;
    let current: MediaStreamTrack | null = null;
    let onEnded: (() => void) | null = null;

    const read = () => {
      const pub = participant.getTrackPublication(Track.Source.Microphone);
      const t = pub?.track?.mediaStreamTrack ?? null;
      if (current && current !== t && onEnded) current.removeEventListener("ended", onEnded);
      onEnded = null;
      if (t && t !== current) {
        onEnded = () => read();
        t.addEventListener("ended", onEnded);
      }
      if (t !== current) {
        current = t;
        ref.current = t;
        setTrack(t);
      }
    };

    const onConnected = () => read();

    read();
    room.on(RoomEvent.Connected, onConnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
      if (current && onEnded) current.removeEventListener("ended", onEnded);
    };
  }, [room]);

  return track;
}
