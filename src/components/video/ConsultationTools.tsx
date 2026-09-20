import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, type RemoteAudioTrack } from "livekit-client";
import { AlertTriangle, ChevronDown, ChevronUp, Languages, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getVideoTranslationState,
  getVoiceTranslationToken,
  setVideoTranslationState,
} from "@/lib/voice-translation-client";
import {
  decodeVoiceTranslationSegmentMessage,
  encodeVoiceTranslationSegmentMessage,
  encodeVoiceTranslationStateMessage,
  isUrduCode,
  languageByCode,
  SUPPORTED_PATIENT_LANGUAGES,
  translationDirectionLabel,
  translationStateLabel,
  URDU_LANGUAGE_CODE,
  VOICE_TRANSLATION_SEGMENT_TOPIC,
  VOICE_TRANSLATION_TOPIC,
  type VoiceTranslationSegmentMessage,
  type VoiceTranslationState,
} from "@/lib/voice-translation";
import { VoiceTranslationEngine, type TranslationSegment } from "@/lib/voice-translation-engine";
import { useRemoteAudioTrack } from "@/components/video/use-remote-audio-track";
import { useVoiceTranslationPublishing } from "@/components/video/use-voice-translation-publishing";

interface TranscriptEntry {
  id: number;
  direction: string;
  original: string;
  translated: string;
  interim: boolean;
}

interface ConsultationToolsProps {
  vcNo: string;
  className?: string;
}

/**
 * Doctor-side "Interpreter" panel for a live video consultation. The toggle is
 * the ONLY way the interpreter is turned on — it persists the state on the
 * video session (so a patient who joins late picks it up server-side) and
 * broadcasts the live state to the patient over the LiveKit data channel.
 *
 * The doctor EXPLICITLY selects the patient's language from the supported grid
 * (there is NO automatic detection and no assumed default). Selecting Urdu
 * means no interpretation is needed — both sides simply speak naturally.
 * Changing the language mid-call re-targets the running engine live
 * (`engine.setPatientLanguage`) without restarting anything else.
 */
export function ConsultationTools({ vcNo, className }: ConsultationToolsProps) {
  const room = useRoomContext();
  const remoteAudioTrack = useRemoteAudioTrack();

  const [enabled, setEnabled] = useState(false);
  // The doctor-selected patient language (a SupportedLanguage.code, or "" while
  // none is chosen — never an assumed English/Urdu default).
  const [patientLanguage, setPatientLanguage] = useState("");
  const [engineState, setEngineState] = useState<VoiceTranslationState>("off");
  const [expanded, setExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const engineRef = useRef<VoiceTranslationEngine | null>(null);
  const entryIdRef = useRef(0);
  const enabledRef = useRef(false);
  const remoteAudioTrackRef = useRef<RemoteAudioTrack | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Sender-side publishing: while the interpreter actually runs (enabled + a
  // concrete non-Urdu patient language) the raw mic is never on the wire — a
  // guaranteed-silent track covers the engine boot gap and the engine's TTS
  // track is then swapped in via replaceTrack.
  const active = enabled && !!patientLanguage && !isUrduCode(patientLanguage);
  const publishing = useVoiceTranslationPublishing(active);
  const { setTtsTrack, captureRawMic, restoreMic } = publishing;

  const pushSegment = useCallback((seg: TranslationSegment) => {
    setTranscript((prev) => {
      const next: TranscriptEntry = {
        id: ++entryIdRef.current,
        direction: translationDirectionLabel(seg.sourceLanguage, seg.targetLanguage),
        original: seg.original,
        translated: seg.translated,
        interim: seg.interim,
      };
      if (seg.interim) {
        if (prev.length > 0 && prev[0].interim) {
          return [
            { ...prev[0], original: seg.original, translated: seg.translated },
            ...prev.slice(1),
          ];
        }
        return [next, ...prev].slice(0, 24);
      }
      if (prev.length > 0 && prev[0].interim) {
        return [{ ...prev[0], ...next, id: prev[0].id }, ...prev.slice(1)];
      }
      return [next, ...prev].slice(0, 24);
    });
  }, []);

  /** Broadcast the DOCTOR's own segments so the patient side can merge them. */
  const broadcastSegment = useCallback(
    (seg: TranslationSegment) => {
      const payload = Uint8Array.from(
        encodeVoiceTranslationSegmentMessage({
          role: "doctor",
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

  const onOwnSegment = useCallback(
    (seg: TranslationSegment) => {
      pushSegment(seg);
      broadcastSegment(seg);
    },
    [pushSegment, broadcastSegment],
  );

  /** Doctor → patient interpreter state over the LiveKit data channel. */
  const broadcast = useCallback(
    (isEnabled: boolean, patientLang: string, status: string) => {
      const payload = Uint8Array.from(
        encodeVoiceTranslationStateMessage({
          enabled: isEnabled,
          patientLanguage: patientLang,
          status,
        }),
      );
      try {
        void room.localParticipant.publishData(payload, {
          reliable: true,
          topic: VOICE_TRANSLATION_TOPIC,
        });
      } catch {
        /* non-fatal: data channel is best-effort for the indicator */
      }
    },
    [room],
  );

  // Restore persisted state after a refresh/rejoin. `patientLanguage` comes back
  // as the doctor's previously selected code (or "" for legacy/none — never an
  // assumed default; the server normalizes unknown values).
  useEffect(() => {
    let live = true;
    void getVideoTranslationState(vcNo)
      .then((res) => {
        if (!live || !res.state) return;
        const restored = res.state.patientLanguage;
        if (restored) setPatientLanguage((prev) => prev || restored);
        if (res.state.enabled) setEnabled(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [vcNo]);

  // Keep the refs the track-swap path reads in sync with state.
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Engine lifecycle: only runs when the interpreter is ON and a real
  // translation is needed (a concrete, non-Urdu patient language was selected).
  // Deliberately NOT recreated when `patientLanguage` changes — the sync effect
  // below re-targets it in place via `setPatientLanguage`. The engine receives
  // the raw mic (never published while active) and reports the TTS track it
  // publishes through `onOutputTrack`.
  useEffect(() => {
    if (!enabled) return;
    const needsInterpreter = !!patientLanguage && !isUrduCode(patientLanguage);
    if (!needsInterpreter) return;
    const engine = new VoiceTranslationEngine({
      role: "doctor",
      patientLanguage,
      vcNo,
      getToken: () => getVoiceTranslationToken(vcNo),
      onStateChange: setEngineState,
      onSegment: onOwnSegment,
      onOutputTrack: setTtsTrack,
    });
    engineRef.current = engine;
    void engine.start(captureRawMic(), remoteAudioTrackRef.current);
    // Best-effort within the toggle's transient-activation window (mobile
    // autoplay); the global pointer/key unlock effect covers every later tap.
    void engine.userGesture();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, vcNo, retryKey, onOwnSegment, setTtsTrack, captureRawMic]);

  // Mid-call language change: re-target the running engine live and persist the
  // new selection (the broadcast effect below sends it to the patient).
  useEffect(() => {
    if (!enabled || !patientLanguage) return;
    engineRef.current?.setPatientLanguage(patientLanguage);
    void setVideoTranslationState(vcNo, true, patientLanguage).catch(() => undefined);
  }, [enabled, patientLanguage, vcNo]);

  // Track-swap path: a (re)published remote mic must re-attach to the running
  // engine for echo gating (the remote track is NEVER muted and never
  // untranslated — it is the translated audio the other side published).
  useEffect(() => {
    remoteAudioTrackRef.current = remoteAudioTrack;
    if (enabledRef.current && engineRef.current) {
      void engineRef.current.start(captureRawMic(), remoteAudioTrack);
    }
  }, [remoteAudioTrack, captureRawMic]);

  // Merge the PATIENT-side segments into the transcript (they arrive over the
  // data channel because the doctor's device never sees the patient's TTS).
  useEffect(() => {
    if (!enabled) return;
    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== VOICE_TRANSLATION_SEGMENT_TOPIC) return;
      const msg = decodeVoiceTranslationSegmentMessage(payload);
      if (!msg) return;
      if (msg.role === "doctor") return; // our own broadcast never loops back, but stay strict
      pushSegment({
        role: "patient",
        sourceLanguage: msg.sourceLanguage,
        targetLanguage: msg.targetLanguage,
        original: msg.original,
        translated: msg.translated,
        interim: msg.interim,
      });
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, enabled, pushSegment]);

  // Keep the patient indicator's status pill live as the engine state changes.
  const broadcastStatus = enabled
    ? isUrduCode(patientLanguage)
      ? "Bypass"
      : patientLanguage
        ? translationStateLabel(engineState)
        : "Choose patient language"
    : "Off";
  useEffect(() => {
    if (!enabled) return;
    broadcast(true, patientLanguage, broadcastStatus);
  }, [enabled, patientLanguage, engineState, broadcastStatus, broadcast]);

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

  function selectLanguage(code: string) {
    setLastError(null);
    setPatientLanguage((prev) => (prev === code ? prev : code));
  }

  /**
   * Toggle the interpreter. OFF is applied IMMEDIATELY (raw mic swapped back +
   * engine disposed, synchronously) so the audio path can never depend on the
   * network; the server persistence is a fire-and-forget that only rolls back
   * the ON side when it errors. No LiveKit reconnect, no new publication.
   */
  function handleToggle(next: boolean) {
    setLastError(null);
    if (next && !languageByCode(patientLanguage)) {
      setLastError("Choose the patient's language to start voice translation.");
      return;
    }
    setEnabled(next);
    if (next) {
      setEngineState("starting");
      broadcast(true, patientLanguage, "Starting");
    } else {
      restoreMic();
      engineRef.current?.dispose();
      engineRef.current = null;
      setEngineState("off");
      broadcast(false, patientLanguage, "Off");
    }
    void engineRef.current?.userGesture();
    void persistToggle(next);
  }

  /**
   * Persist the doctor's interpreter state. OFF rolls forward optimistically
   * (never block de-escalation on the network). ON retries a TRANSIENT fetch
   * failure a couple of times — a flaky POST must not roll back a functioning
   * interpreter into silence — and only a real server-side rejection does.
   */
  async function persistToggle(next: boolean) {
    const rollback = () => {
      if (!next) return;
      setLastError("Could not update the interpreter setting. Please try again.");
      setEnabled(false);
      engineRef.current?.dispose();
      engineRef.current = null;
      restoreMic();
      setEngineState("off");
      broadcast(false, patientLanguage, "Off");
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await setVideoTranslationState(vcNo, next, patientLanguage);
        if (next && res.error) {
          // Server rejected the write (e.g. invalid language) — real problem.
          rollback();
          return;
        }
        return;
      } catch {
        if (next && attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        if (next) {
          rollback();
          return;
        }
        // OFF is fire-and-forget: give up after retries, keep the call OFF.
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        return;
      }
    }
  }

  /** Recreate the engine after a transient failure (Azure hiccup etc.). */
  function retry() {
    setLastError(null);
    setRetryKey((k) => k + 1);
    setEngineState("starting");
    broadcast(true, patientLanguage, "Starting");
  }

  const selected = languageByCode(patientLanguage);
  const bypass = isUrduCode(patientLanguage);
  const direction = !enabled
    ? "Voice translation off"
    : bypass
      ? "Urdu — no interpretation needed"
      : selected
        ? translationDirectionLabel(selected.code, URDU_LANGUAGE_CODE)
        : "Choose the patient's language";

  return (
    <Card className={`pointer-events-auto bg-card/95 shadow-md backdrop-blur ${className ?? ""}`}>
      <div className="flex items-center gap-2 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Languages className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight text-foreground">
            Voice translation
          </div>
          <div className="truncate text-xs text-muted-foreground">{direction}</div>
        </div>
        <Switch
          checked={enabled}
          disabled={!enabled && !patientLanguage}
          onCheckedChange={(value) => void handleToggle(value)}
          aria-label="Toggle voice translation"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse interpreter" : "Expand interpreter"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t px-3 pb-3 pt-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Patient's language</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SUPPORTED_PATIENT_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => selectLanguage(l.code)}
                  aria-pressed={patientLanguage === l.code}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                    patientLanguage === l.code
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <span className="text-sm">{l.flag}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-foreground">{l.label}</span>
                    {l.note && (
                      <span className="ml-1 text-[10px] text-muted-foreground">({l.note})</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {enabled && (
            <div className="flex flex-wrap items-center gap-2">
              {bypass ? (
                <Badge variant="secondary">Urdu — no interpretation</Badge>
              ) : (
                <Badge variant={engineState === "error" ? "destructive" : "default"}>
                  <Volume2 className="mr-1 h-3 w-3" />
                  {engineState === "error" ? "Unavailable" : translationStateLabel(engineState)}
                </Badge>
              )}
              {selected && !bypass && <Badge variant="outline">Patient: {selected.label}</Badge>}
              {enabled && engineState === "error" && (
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={retry}>
                  Retry
                </Button>
              )}
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            Pick your patient's language to start. Your Urdu is translated into that language, and
            their speech comes back to you as Urdu. If the patient speaks Urdu, choose Urdu — no
            translation is needed and you can speak directly.
          </p>

          {lastError && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {lastError}
            </p>
          )}

          {enabled && selected && !bypass && (
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowTranscript((v) => !v)}
              >
                {showTranscript ? "Hide live transcript" : "Show live transcript"}
              </Button>
              {showTranscript && (
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg bg-muted/60 p-2 text-xs">
                  {transcript.length === 0 ? (
                    <p className="text-muted-foreground">Waiting for speech…</p>
                  ) : (
                    transcript.map((entry) => (
                      <div
                        key={entry.id}
                        className={`space-y-0.5 ${entry.interim ? "opacity-60" : ""}`}
                      >
                        <div className="text-[11px] font-medium text-primary">
                          {entry.direction}
                        </div>
                        <div className="break-words text-foreground">{entry.original}</div>
                        <div className="break-words text-foreground/80">{entry.translated}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            AI translation may contain errors and is not a substitute for clinical advice. Wearing
            headphones prevents echo.
          </p>
        </div>
      )}
    </Card>
  );
}
