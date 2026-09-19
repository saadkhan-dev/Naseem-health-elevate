import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { LocalAudioTrack, Track } from "livekit-client";
import { createSilentAudioTrack } from "@/lib/voice-translation-engine";
import { useLocalMicTrack } from "@/components/video/use-local-mic-track";

export interface VoiceTranslationPublishing {
  /**
   * Feed the engine's publishable TTS track here; the hook swaps it onto the
   * mic publication in place (`replaceTrack`, no reconnect/renegotiation).
   * Until this is set, the hook keeps a guaranteed-SILENT track published so
   * raw audio can never leak during the engine's boot gap.
   */
  setTtsTrack: (track: MediaStreamTrack) => void;
  /** Snapshot of the raw mic track (un-published while active) for the STT input. */
  captureRawMic: () => MediaStreamTrack | null;
  /** Restore the raw mic immediately (disable / Urdu bypass / error fallback). */
  restoreMic: () => void;
  /** The engine's output track, when the engine has reported it live. */
  ttsTrack: MediaStreamTrack | null;
}

/**
 * Owns the LiveKit mic-publication track swaps for sender-side translation.
 *
 * Guarantees:
 *   - While `enabled` the RAW microphone is NEVER on the wire. The hook
 *     publishes a guaranteed-silent track the moment it activates (covering the
 *     engine boot gap), then swaps in the engine's TTS track the moment that is
 *     live, then swaps the raw mic back when disabled.
 *   - All swaps use `LocalAudioTrack.replaceTrack(track, { userProvidedTrack:
 *     true })` on the SAME publication/track and are SERIALIZED through an
 *     internal promise chain, so rapid OFF→ON→OFF toggling can never produce a
 *     race where the wrong track ends up on the wire (deterministic lifecycle,
 *     no reconnect, no renegotiation, no new track SID). Verified against
 *     livekit-client 2.22.3: `replaceTrack` sets `providedByUser` before
 *     `setMediaStreamTrack`, so the previous track is never stopped.
 *   - The raw-mic snapshot is captured when `enabled` flips true — before any
 *     swap — and refreshed on device changes while OFF. On restore it first
 *     falls back to the freshest LIVE broker-owned raw track so a stale/stopped
 *     snapshot can never strand the wrong track on the wire.
 */
export function useVoiceTranslationPublishing(enabled: boolean): VoiceTranslationPublishing {
  const room = useRoomContext();
  const currentMicTrack = useLocalMicTrack();
  const currentMicTrackRef = useRef<MediaStreamTrack | null>(null);
  currentMicTrackRef.current = currentMicTrack;

  const [ttsTrack, setTtsTrackState] = useState<MediaStreamTrack | null>(null);
  const rawRef = useRef<MediaStreamTrack | null>(null);
  const publishedRef = useRef<MediaStreamTrack | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Serializes `replaceTrack` calls so no two swaps can interleave.
  const swapChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const silentTrack = useMemo(() => {
    try {
      return createSilentAudioTrack();
    } catch {
      return null; // not a browser / WebAudio unavailable — engine output will cover
    }
  }, []);

  /** Fallback to the freshest LIVE, broker-Owned raw mic if our snapshot is stale. */
  const freshestRawMic = useCallback((): MediaStreamTrack | null => {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const publicTrack = pub?.track;
    const bridged =
      publicTrack instanceof LocalAudioTrack && !publicTrack.isUserProvided
        ? publicTrack.mediaStreamTrack
        : null;
    if (bridged && bridged.readyState === "live") return bridged;
    return null;
  }, [room]);

  const swapMic = useCallback(
    (track: MediaStreamTrack): Promise<unknown> => {
      const run = swapChainRef.current.then((): Promise<unknown> => {
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const local = pub?.track;
        if (local instanceof LocalAudioTrack) {
          publishedRef.current = track;
          console.debug("[vt-debug] swapping published mic track -> " + track.id.slice(0, 12));
          return local.replaceTrack(track, { userProvidedTrack: true }).then(
            (t) => {
              publishedRef.current = t instanceof LocalAudioTrack ? t.mediaStreamTrack : track;
              return t;
            },
            (e: unknown) => {
              console.error("[voice-translation] replaceTrack failed (publish track failed)", e);
              publishedRef.current = null;
            },
          );
        }
        console.warn(
          "[vt-debug] swapMic SKIPPED: mic publication missing or not LocalAudioTrack (source=" +
            Track.Source.Microphone +
            ", pub=" +
            (pub ? "found" : "MISSING") +
            ") — the previous track stays on the wire",
        );
        return Promise.resolve();
      });
      swapChainRef.current = run.catch(() => undefined);
      return run;
    },
    [room],
  );

  // Keep the raw-mic snapshot fresh while the interpreter is OFF (ControlBar
  // can switch the mic device; the 'ended' listener in useLocalMicTrack then
  // re-reads the publication's current track).
  useEffect(() => {
    if (enabledRef.current) return;
    const freshest = freshestRawMic();
    const live = freshest ?? currentMicTrack;
    if (live && live.readyState === "live") rawRef.current = live;
  }, [enabled, currentMicTrack, freshestRawMic]);

  const captureRawMic = useCallback((): MediaStreamTrack | null => {
    const live = freshestRawMic() ?? currentMicTrackRef.current;
    if (live && live.readyState === "live") rawRef.current = live;
    if (!rawRef.current || rawRef.current.readyState !== "live") {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const t = pub?.track?.mediaStreamTrack ?? null;
      if (t && t.readyState === "live") rawRef.current = t;
    }
    return rawRef.current;
  }, [room, freshestRawMic]);

  const publishSilentNow = useCallback(() => {
    if (!silentTrack) return;
    if (publishedRef.current === silentTrack) return;
    void swapMic(silentTrack);
  }, [silentTrack, swapMic]);

  // The instant translation turns ON: snapshot the raw mic (still the current
  // publication track at this point) and publish the silence bridge so no raw
  // audio can leak for even the boot gap.
  useEffect(() => {
    if (!enabled) return;
    captureRawMic();
    publishSilentNow();
  }, [enabled, captureRawMic, publishSilentNow]);

  // Once the engine's TTS track is live, put THAT on the wire.
  useEffect(() => {
    if (!enabledRef.current || !ttsTrack) return;
    if (publishedRef.current !== ttsTrack) void swapMic(ttsTrack);
  }, [ttsTrack, swapMic]);

  const restoreMic = useCallback(() => {
    const freshest = freshestRawMic();
    const raw =
      rawRef.current && rawRef.current.readyState === "live"
        ? rawRef.current
        : freshest
          ? (rawRef.current = freshest)
          : currentMicTrackRef.current;
    if (!raw || raw.readyState !== "live") {
      console.warn(
        "[vt-debug] restoreMic SKIPPED: raw mic " +
          (raw ? "STOPPED (stale snapshot)" : "missing") +
          " — previous track stays on the wire",
      );
      return;
    }
    if (publishedRef.current === raw) return;
    void swapMic(raw);
  }, [swapMic, freshestRawMic]);

  // Safety net: OFF → raw mic back (callers usually restore synchronously).
  useEffect(() => {
    if (enabledRef.current) return;
    restoreMic();
  }, [enabled, restoreMic]);

  const setTtsTrack = useCallback((track: MediaStreamTrack) => setTtsTrackState(track), []);

  return { setTtsTrack, captureRawMic, restoreMic, ttsTrack };
}
