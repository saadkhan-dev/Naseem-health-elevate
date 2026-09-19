import { useTracks } from "@livekit/components-react";
import { RemoteAudioTrack, Track } from "livekit-client";

/**
 * The FIRST remote participant's subscribed microphone track. Audio here is the
 * raw incoming stream (delivered by LiveKit, not captured from a local mic), so
 * confirming mic permission is never needed for the interpreter.
 */
export function useRemoteAudioTrack(): RemoteAudioTrack | null {
  const refs = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  const found = refs.find(
    (r) => !r.participant.isLocal && r.publication?.track instanceof RemoteAudioTrack,
  );
  return found?.publication?.track instanceof RemoteAudioTrack ? found.publication.track : null;
}
