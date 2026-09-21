import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { Captions, CaptionsOff } from "lucide-react";
import {
  decodeVoiceTranslationSegmentMessage,
  decodeVoiceTranslationStateMessage,
  VOICE_TRANSLATION_SEGMENT_TOPIC,
  VOICE_TRANSLATION_TOPIC,
  type TranslationRole,
} from "@/lib/voice-translation";
import { getVideoTranslationState } from "@/lib/voice-translation-client";

interface VideoConsultationOverlayProps {
  isStaff: boolean;
  vcNo: string;
  /**
   * Authoritative interpreter-enabled state for the local side (the doctor owns
   * it). LiveKit does NOT loop a sender's own data-channel messages back, so
   * without this the doctor's own overlay could never know the interpreter was
   * turned OFF and would keep showing stale captions. When provided it wins over
   * the data-channel signals; patients leave it undefined and rely purely on the
   * doctor's broadcasts + segments.
   */
  interpreterEnabled?: boolean | null;
}

/**
 * Remote-viewer layer for the voice translator: the "Doctor is speaking…" /
 * "Patient is speaking…" indicator and the Meet/Zoom-style caption overlay,
 * plus the "Captions" toggle in the control bar.
 *
 * It consumes ONLY signals the existing sender-side pipeline already emits:
 *   - the doctor's `VOICE_TRANSLATION_TOPIC` state messages (enabled +
 *     optional `speaking`),
 *   - each side's broadcast `VOICE_TRANSLATION_SEGMENT_TOPIC` segments (the
 *     exact translated result that was already recognised + translated + scored
 *     for TTS — never a second recognition/translation/Azure session), and
 *   - a one-shot persisted-state read for late joiners.
 *
 * It creates NO microphone capture, NO Azure recognizer/synthesizer session and
 * NO LiveKit publication. It is purely a passive viewer of the existing data
 * channel, so it can never double-translate or leak raw audio.
 */
export function VideoConsultationOverlay({
  isStaff,
  vcNo,
  interpreterEnabled,
}: VideoConsultationOverlayProps) {
  const room = useRoomContext();
  // Stable per-mount: a route switch remounts this component, and both sides
  // always ignore their own looped-back segments.
  const myRole: TranslationRole = isStaff ? "doctor" : "patient";

  const [channelEnabled, setChannelEnabled] = useState(false);
  const enabled = interpreterEnabled ?? channelEnabled;
  const [captionsOn, setCaptionsOn] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [caption, setCaption] = useState<{
    speaker: TranslationRole;
    text: string;
    interim: boolean;
  } | null>(null);

  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce/grace: keep "X is speaking" lit briefly after the last activity so
  // intra-sentence pauses and the recognition–TTS seam never flicker.
  const markRemoteSpeaking = useCallback(() => {
    setRemoteSpeaking(true);
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    speechTimerRef.current = setTimeout(() => setRemoteSpeaking(false), 1800);
  }, []);

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic === VOICE_TRANSLATION_TOPIC) {
        const msg = decodeVoiceTranslationStateMessage(payload);
        if (!msg) return;
        setChannelEnabled(msg.enabled);
        if (!msg.enabled) {
          setCaption(null);
          setRemoteSpeaking(false);
          if (speechTimerRef.current) {
            clearTimeout(speechTimerRef.current);
            speechTimerRef.current = null;
          }
          return;
        }
        if (msg.speaking) markRemoteSpeaking();
        return;
      }
      if (topic === VOICE_TRANSLATION_SEGMENT_TOPIC) {
        const msg = decodeVoiceTranslationSegmentMessage(payload);
        if (!msg) return;
        if (msg.role === myRole) return; // our own broadcast may loop back — stay strict
        // A live segment is proof the interpreter is running (late joiner or
        // missed state message).
        setChannelEnabled(true);
        markRemoteSpeaking();
        setCaption({ speaker: msg.role, text: msg.translated, interim: msg.interim });
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    };
  }, [room, myRole, markRemoteSpeaking]);

  // Late join: pick up the persisted interpreter state once (the doctor may not
  // re-broadcast for a while).
  useEffect(() => {
    let live = true;
    void getVideoTranslationState(vcNo)
      .then((res) => {
        if (live && res.state?.enabled) setChannelEnabled(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [vcNo]);

  // Local OFF (doctor side): clear everything immediately — LiveKit won't loop
  // the doctor's own disable broadcast back, so this must not wait on it.
  useEffect(() => {
    if (interpreterEnabled === false) {
      setCaption(null);
      setRemoteSpeaking(false);
      if (speechTimerRef.current) {
        clearTimeout(speechTimerRef.current);
        speechTimerRef.current = null;
      }
    }
  }, [interpreterEnabled]);

  const remoteLabel = isStaff ? "Patient is speaking…" : "Doctor is speaking…";
  const activeCaption =
    captionsOn && enabled && caption && caption.text.trim().length > 0 ? caption : null;

  return (
    <>
      {enabled && remoteSpeaking && (
        <div
          data-testid="vt-indicator"
          className="pointer-events-none absolute inset-x-0 bottom-[calc(7.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-3 sm:px-6"
        >
          <div className="flex items-center gap-2 rounded-full bg-black/65 px-4 py-1.5 text-sm font-medium text-white shadow-lg backdrop-blur">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
            <span>{remoteLabel}</span>
          </div>
        </div>
      )}
      {activeCaption && (
        <div
          data-testid="vt-caption"
          className="pointer-events-none absolute inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-3 sm:px-6"
        >
          <div
            className={`w-full max-w-screen-sm rounded-xl bg-black/75 px-4 py-2 text-center shadow-lg backdrop-blur ${
              activeCaption.interim ? "opacity-85" : ""
            }`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
              {activeCaption.speaker === "doctor" ? "Doctor" : "Patient"}
            </div>
            <div className="break-words text-sm leading-snug text-white">{activeCaption.text}</div>
          </div>
        </div>
      )}
      <button
        type="button"
        data-testid="vt-captions-toggle"
        className="lk-button ml-1.5 h-10 w-10 shrink-0 sm:ml-2 sm:h-11 sm:w-11"
        aria-pressed={captionsOn}
        aria-label={captionsOn ? "Turn captions off" : "Turn captions on"}
        title={captionsOn ? "Turn captions off" : "Turn captions on"}
        onClick={() => setCaptionsOn((v) => !v)}
      >
        {captionsOn ? <CaptionsOff className="h-5 w-5" /> : <Captions className="h-5 w-5" />}
      </button>
    </>
  );
}
