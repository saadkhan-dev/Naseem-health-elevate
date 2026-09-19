import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import type { RemoteAudioTrack } from "livekit-client";
import { RoomEvent } from "livekit-client";
import { Languages, Volume2 } from "lucide-react";
import {
  decodeVoiceTranslationStateMessage,
  encodeVoiceTranslationSegmentMessage,
  isUrduCode,
  languageByCode,
  VOICE_TRANSLATION_SEGMENT_TOPIC,
  VOICE_TRANSLATION_TOPIC,
} from "@/lib/voice-translation";
import { getVideoTranslationState, getVoiceTranslationToken } from "@/lib/voice-translation-client";
import { VoiceTranslationEngine, type TranslationSegment } from "@/lib/voice-translation-engine";
import { useRemoteAudioTrack } from "@/components/video/use-remote-audio-track";
import { useVoiceTranslationPublishing } from "@/components/video/use-voice-translation-publishing";

interface TranslationPatientIndicatorProps {
  vcNo: string;
  className?: string;
}

/**
 * Patient-side interpreter status. It follows the doctor's LiveKit data-channel
 * messages (a patient can never turn the translator on themselves), falls back
 * to the persisted server state so a late joiner still sees it, and runs the
 * patient-side engine (patient's speech → Urdu TTS, published back to the
 * doctor) while active.
 *
 * The patient's language comes from the doctor's selection broadcast; until the
 * doctor picks one there is nothing to translate, so no engine runs. The raw
 * mic is only restored to the LiveKit track on a genuine stop — a real disable
 * or an Urdu bypass (direct call) — never while translation is still active.
 */
export function TranslationPatientIndicator({ vcNo, className }: TranslationPatientIndicatorProps) {
  const room = useRoomContext();
  const remoteAudioTrack = useRemoteAudioTrack();

  const [enabled, setEnabled] = useState(false);
  // The doctor-SELECTED patient language ("" while none is chosen — never an
  // assumed English/Urdu default).
  const [patientLanguage, setPatientLanguage] = useState("");
  const [status, setStatus] = useState("Off");
  const engineRef = useRef<VoiceTranslationEngine | null>(null);
  const enabledRef = useRef(false);
  const remoteAudioTrackRef = useRef<RemoteAudioTrack | null>(null);

  // Sender-side publishing: while active the patient's OWN mic is STT'd,
  // translated and published back as Urdu TTS (the raw mic is never sent).
  const active = enabled && !!patientLanguage && !isUrduCode(patientLanguage);
  const publishing = useVoiceTranslationPublishing(active);
  const { setTtsTrack, captureRawMic, restoreMic } = publishing;

  // Broadcast the PATIENT's own segments so the doctor's transcript can merge
  // the patient side of the conversation (the doctor never hears the patient's
  // untranslated mic — only the Urdu TTS).
  const broadcastSegment = useCallback(
    (seg: TranslationSegment) => {
      const payload = Uint8Array.from(
        encodeVoiceTranslationSegmentMessage({
          role: "patient",
          sourceLanguage: seg.sourceLanguage,
          targetLanguage: seg.targetLanguage,
          original: seg.original,
          translated: seg.translated,
          interim: seg.interim,
        }),
      );
      try {
        void room.localParticipant.publishData(payload, {
          reliable: false,
          topic: VOICE_TRANSLATION_SEGMENT_TOPIC,
        });
      } catch {
        /* best-effort: the transcript is cosmetic */
      }
    },
    [room],
  );

  // Live data-channel updates from the doctor.
  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== VOICE_TRANSLATION_TOPIC) return;
      const msg = decodeVoiceTranslationStateMessage(payload);
      if (!msg) return;
      setEnabled(msg.enabled);
      setPatientLanguage(msg.patientLanguage || "");
      setStatus(msg.status || "Off");
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  // Late join / reconnect: read the persisted server state once.
  useEffect(() => {
    let live = true;
    void getVideoTranslationState(vcNo)
      .then(async (res) => {
        if (!live || !res.state) return;
        setPatientLanguage(res.state.patientLanguage || "");
        if (res.state.enabled) {
          setEnabled(true);
          const granted = await getVoiceTranslationToken(vcNo);
          setStatus(granted.error ? "Unavailable" : "Starting");
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [vcNo]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Patient-side engine: translate the patient's speech into Urdu and publish it
  // (sender-side). Re-targeted live (`setPatientLanguage`) when the doctor
  // changes the selection; Urdu patients never get an engine (direct call).
  // The mic track is released back to normal LiveKit audio whenever the
  // interpreter stops actually running (`active` false → publishing restores).
  useEffect(() => {
    const lang = languageByCode(patientLanguage);
    const needsEngine = enabled && !!lang && !isUrduCode(patientLanguage);
    if (!needsEngine) {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      return;
    }
    if (!engineRef.current) {
      const engine = new VoiceTranslationEngine({
        role: "patient",
        patientLanguage,
        vcNo,
        getToken: () => getVoiceTranslationToken(vcNo),
        onStateChange: setStatus,
        onSegment: broadcastSegment,
        onOutputTrack: setTtsTrack,
      });
      engineRef.current = engine;
      void engine.start(captureRawMic(), remoteAudioTrackRef.current);
    } else {
      engineRef.current.setPatientLanguage(patientLanguage);
    }
  }, [enabled, patientLanguage, vcNo, captureRawMic, setTtsTrack, broadcastSegment]);

  // Track-swap path (re-publish / reconnect): re-attach the remote mic for echo
  // gating without ever touching the published track (the remote audio is the
  // translation itself — never muted, never replaced).
  useEffect(() => {
    remoteAudioTrackRef.current = remoteAudioTrack;
    if (enabledRef.current && engineRef.current) {
      void engineRef.current.start(captureRawMic(), remoteAudioTrack);
    }
  }, [remoteAudioTrack, captureRawMic]);

  // Mobile autoplay: unlock the WebAudio graph on any tap/key while active.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => void engineRef.current?.userGesture();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  if (!enabled) return null;

  const bypass = isUrduCode(patientLanguage);
  const lang = languageByCode(patientLanguage);

  return (
    <div
      className={`pointer-events-none inline-flex max-w-[90vw] items-center gap-2 rounded-full border border-primary/30 bg-background/95 py-1.5 pl-2.5 pr-3 shadow-md backdrop-blur ${className ?? ""}`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        {bypass ? (
          <Volume2 className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Languages className="h-3.5 w-3.5 text-primary" />
        )}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="text-xs font-semibold text-foreground">
          {bypass
            ? "Voice translation ON — Urdu chat"
            : lang
              ? `Voice translation ON — ${lang.label} ↔ Urdu`
              : "Voice translation ON"}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-[11px] text-muted-foreground">{status}</span>
          <span className="text-[11px] text-muted-foreground/70">
            · AI translation may contain errors
          </span>
        </div>
      </div>
    </div>
  );
}
