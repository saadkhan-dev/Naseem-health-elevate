import type { RemoteAudioTrack } from "livekit-client";
import type * as speechsdk from "microsoft-cognitiveservices-speech-sdk";
import {
  isUrduCode,
  languageByCode,
  roleSpeechSource,
  roleTranslationTarget,
  roleTtsVoice,
  URDU_TRANSLATION_CODE,
  type TranslationRole,
  type VoiceTranslationState,
} from "@/lib/voice-translation";
import { AZURE_SPEECH_TOKEN_REFRESH_SECONDS } from "@/lib/speech-token-constants";
import type { VoiceTranslationTokenResult } from "@/lib/voice-translation-client";
import { toRomanUrdu } from "@/lib/roman-urdu";

/**
 * Real-time voice translation engine for one browser (one side of the
 * consultation). SENDER-SIDE architecture — each participant translates their
 * OWN microphone and PUBLISHES the translated TTS as their LiveKit audio track,
 * so the raw microphone audio never leaves the device while the interpreter is
 * ON:
 *
 *   - DOCTOR side  : doctor mic (ur-IN STT) → translate → patient-language
 *                    neural TTS → PUBLISHED as the doctor's audio track. The
 *                    patient hears ONLY the translated voice in their language.
 *   - PATIENT side : patient mic (their own language STT) → translate → Urdu
 *                    neural TTS (ur-PK-AsadNeural) → PUBLISHED as the patient's
 *                    audio track. The doctor hears ONLY Urdu.
 *   - With translation ON there is exactly ONE remote-audio stream per
 *     direction on the wire: the synthesized translation. There can be no
 *     double audio (the raw mic is never published) and no echo of a local
 *     playback re-entering the pipeline. Translated TTS plays on the LISTENING
 *     device (the normal RoomAudioRenderer path) — it is not looped locally.
 *   - Translation OFF restores the normal LiveKit direct audio call: the raw
 *     mic track is re-published unchanged (a plain WebRTC call, no Azure at
 *     all). An Urdu-speaking patient naturally selects Urdu → isUrduCode
 *     → no engine is ever booted (natural bypass).
 *   - "Microphone capture used by Azure STT" is deliberately SEPARATE from
 *     "LiveKit remote audio publication": the raw mic MediaStreamTrack is kept
 *     alive only to feed the STT (resampled by an AudioWorklet), while the
 *     published track is the TTS output of a MediaStreamAudioDestinationNode.
 *     The components swap the LiveKit mic publication's track in place
 *     (LocalTrack.replaceTrack(track, { userProvidedTrack: true })) — no
 *     reconnect, no renegotiation, no new SID — and swap the raw mic back when
 *     disabled.
 *   - Echo / turn-taking: the OTHER side's translated TTS plays on this
 *     device's speakers; if that playback were picked up by the local mic it
 *     would be re-translated into an infinite loop. The input worklet therefore
 *     VAD-gates the local mic on the REMOTE track's activity (one speaker at a
 *     time). Headphones remain strongly recommended.
 *   - Changing the selected patient language mid-call calls
 *     setPatientLanguage(code) which re-creates the recognizer + synthesizer
 *     against the new locale and flushes the TTS queue — WITHOUT touching the
 *     audio graph or re-publishing.
 *   - Written Urdu (transcripts) is rendered as conversational Pakistani Roman
 *     Urdu — e.g. "Aap ko ye dard kab se ho raha hai?" — while the AUDIBLE Urdu
 *     keeps its native script so ur-PK-AsadNeural pronounces it correctly.
 *   - Failure discipline: while the interpreter is ENABLED the raw mic never
 *     comes back even if Azure hiccups — the components publish a guaranteed
 *     silent track until the engine's real TTS track is live, so un-translated
 *     speech can never leak through. Only an explicit disable restores the raw
 *     mic.
 *
 * Access tokens are minted server-side (like the LiveKit join JWT) and are
 * refreshed before the 10-minute Azure expiry using the recognizer / sink
 * authorizationToken setters.
 */

// ---------------------------------------------------------------------------
// AudioWorklet #1: input stage. Two inputs — inputs[0] = LOCAL mic (resampled
// to 16 kHz Int16 PCM for the recognizer's push stream + local VAD events),
// inputs[1] = REMOTE track (VAD only, drives the echo gate, one speaker at a
// time) — all routed SILENTLY (zero-gain sink), so nothing the interpreter
// consumes locally ever reaches this device's speakers a second time.
// ---------------------------------------------------------------------------

const VT_VAD_THRESHOLD = 0.04; // RMS speech gate tuned for a decoded track signal
const VT_VAD_TAIL_MS = 380; // keep gated / labelled speech for this long after speech stops
const VT_EMIT_SAMPLES = 640; // 40 ms @ 16 kHz

const VOICE_TRANSLATION_INPUT_WORKLET_ID = "voice-translation-input";

const VOICE_TRANSLATION_INPUT_WORKLET_SRC = `
const TARGET_RATE = 16000;
const EMIT_SAMPLES = ${VT_EMIT_SAMPLES};
const THRESHOLD = ${VT_VAD_THRESHOLD};
const TAIL_SAMPLES = Math.max(1, Math.round((${VT_VAD_TAIL_MS} / 1000) * TARGET_RATE));
class VoiceTranslationInput extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.inBuffer = new Float32Array(0);
    this.outBuffer = [];
    this.sourcePos = 0;
    this.speaking = false;
    this.tailLeft = 0;
    this.manualGate = false;
    this.remoteActive = false;
    this.remoteTail = TAIL_SAMPLES;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === "gate") {
        this.manualGate = !!data.on;
        if (this.manualGate) this.resetMic();
      }
    };
    this.port.postMessage({ type: "ready" });
  }
  resetMic() {
    this.speaking = false;
    this.tailLeft = 0;
    this.inBuffer = new Float32Array(0);
    this.sourcePos = 0;
    this.outBuffer = [];
  }
  get gated() {
    return this.manualGate || this.remoteActive;
  }
  process(inputs) {
    const mic = inputs && inputs[0] && inputs[0][0];
    if (mic && mic.length > 0 && !this.gated) {
      const len = mic.length;
      let sum = 0;
      for (let i = 0; i < len; i++) sum += mic[i] * mic[i];
      const rms = Math.sqrt(sum / len);
      if (rms >= THRESHOLD) {
        this.tailLeft = TAIL_SAMPLES;
        if (!this.speaking) {
          this.speaking = true;
          this.port.postMessage({ type: "speech" });
        }
      } else if (this.speaking) {
        this.tailLeft -= Math.max(1, Math.round(len / this.ratio));
        if (this.tailLeft <= 0) {
          this.speaking = false;
          this.port.postMessage({ type: "silence" });
        }
      }
      const prev = this.inBuffer;
      this.inBuffer = new Float32Array(prev.length + len);
      this.inBuffer.set(prev);
      this.inBuffer.set(mic, prev.length);
      this.resample();
      this.emit();
    } else if (mic && mic.length > 0) {
      this.resetMic();
    }

    const remote = inputs && inputs[1] && inputs[1][0];
    if (remote && remote.length > 0) {
      let sum = 0;
      for (let i = 0; i < remote.length; i++) sum += remote[i] * remote[i];
      const rms = Math.sqrt(sum / remote.length);
      if (rms >= THRESHOLD) {
        this.remoteTail = TAIL_SAMPLES;
        if (!this.remoteActive) {
          this.remoteActive = true;
          this.resetMic();
        }
      } else if (this.remoteActive) {
        this.remoteTail -= Math.max(1, Math.round(remote.length / this.ratio));
        if (this.remoteTail <= 0) {
          this.remoteActive = false;
          this.port.postMessage({ type: "remote-silence" });
        }
      }
    }
    return true;
  }
  resample() {
    const n = this.inBuffer.length;
    while (this.sourcePos + 1 < n) {
      const i = Math.floor(this.sourcePos);
      const frac = this.sourcePos - i;
      const a = this.inBuffer[i];
      const b = this.inBuffer[i + 1];
      this.outBuffer.push(a + (b - a) * frac);
      this.sourcePos += this.ratio;
    }
    const consumed = Math.floor(this.sourcePos);
    if (consumed > 0) {
      this.inBuffer = this.inBuffer.slice(consumed);
      this.sourcePos -= consumed;
    }
  }
  emit() {
    while (this.outBuffer.length >= EMIT_SAMPLES) {
      const block = this.outBuffer.splice(0, EMIT_SAMPLES);
      const i16 = new Int16Array(EMIT_SAMPLES);
      for (let i = 0; i < EMIT_SAMPLES; i++) {
        const v = block[i];
        i16[i] = Math.max(-32768, Math.min(32767, Math.round(v * (v < 0 ? 32768 : 32767))));
      }
      const buf = i16.buffer;
      this.port.postMessage({ type: "pcm", buffer: buf }, [buf]);
    }
  }
}
registerProcessor("${VOICE_TRANSLATION_INPUT_WORKLET_ID}", VoiceTranslationInput);
`; // ---------------------------------------------------------------------------
// AudioWorklet #2: output stage. Receives the synthesized TTS (Int16 PCM,
// mono, 24 kHz from the Azure pull-output stream), resamples it to the
// AudioContext rate and drives a MediaStreamAudioDestinationNode — the track
// that REPLACES the raw mic on the LiveKit publication. Nothing here plays on
// the local speakers.
// ---------------------------------------------------------------------------

const VT_TTS_SOURCE_RATE = 24000;
const VT_TTS_READ_BYTES = 16384; // pull-stream read chunk (~341 ms of 24 kHz mono)
const VT_TTS_MAX_QUEUED_SAMPLES = 24000 * 20; // ~20 s safety cap

const VOICE_TRANSLATION_OUTPUT_WORKLET_ID = "voice-translation-output";

const VOICE_TRANSLATION_OUTPUT_WORKLET_SRC = `
const SOURCE_RATE = ${VT_TTS_SOURCE_RATE};
const MAX_QUEUED = ${VT_TTS_MAX_QUEUED_SAMPLES};
class VoiceTranslationOutput extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.pos = 0;
    this.ratio = SOURCE_RATE / sampleRate;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "pcm" && data.buffer) {
        const bytes = new Uint8Array(data.buffer);
        const usable = bytes.length - (bytes.length % 2);
        const i16 = new Int16Array(usable / 2);
        for (let i = 0; i < i16.length; i++) {
          i16[i] = (bytes[i * 2] | (bytes[i * 2 + 1] << 8)) << 16 >> 16;
        }
        for (let i = 0; i < i16.length; i++) this.queue.push(i16[i] / 32768);
        if (this.queue.length > MAX_QUEUED) this.queue.splice(0, this.queue.length - MAX_QUEUED);
      } else if (data.type === "clear") {
        this.queue = [];
        this.pos = 0;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs && outputs[0] && outputs[0][0];
    if (!out) return true;
    const n = out.length;
    let underflowAt = n;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(this.pos);
      if (j + 1 >= this.queue.length) {
        underflowAt = i;
        break;
      }
      const frac = this.pos - j;
      const a = this.queue[j];
      const b = this.queue[j + 1];
      out[i] = a + (b - a) * frac;
      this.pos += this.ratio;
    }
    if (underflowAt < n) {
      for (let i = underflowAt; i < n; i++) out[i] = 0;
    }
    const consumed = Math.floor(this.pos);
    if (consumed > 0) {
      if (consumed >= this.queue.length) {
        this.queue = [];
        this.pos = 0;
      } else {
        this.queue = this.queue.slice(consumed);
        this.pos -= consumed;
      }
    }
    return true;
  }
}
registerProcessor("${VOICE_TRANSLATION_OUTPUT_WORKLET_ID}", VoiceTranslationOutput);
`;

export interface TranslationSegment {
  role: TranslationRole;
  sourceLanguage: string;
  targetLanguage: string;
  /**
   * The recognizable speech as the STT source heard it on the SENDING side
   * (e.g. the doctor's original Urdu words; romanized for display when the
   * source is Urdu).
   */
  original: string;
  /**
   * The translation for DISPLAY. When the target is Urdu this is written in
   * conversational Pakistani Roman Urdu (see `toRomanUrdu`); the audible
   * synthesis uses the native-script rendering of the same text.
   */
  translated: string;
  interim: boolean;
}

export interface VoiceTranslationEngineOptions {
  role: TranslationRole;
  /**
   * DOCTOR side: the doctor-selected patient language (a `SupportedLanguage.code`)
   * — the translation target + TTS voice of the doctor's published track.
   * PATIENT side: the STT source of the patient's own mic. The engine never
   * auto-detects; swap it live with `setPatientLanguage(code)`.
   */
  patientLanguage: string;
  vcNo: string;
  getToken: () => Promise<VoiceTranslationTokenResult>;
  onStateChange: (state: VoiceTranslationState) => void;
  onSegment?: (segment: TranslationSegment) => void;
  /**
   * Called with the publishable TTS track (Int16 PCM in, MediaStream out) as
   * soon as the output graph is alive. The track outputs silence until the
   * first synthesis lands; the component must publish it (via
   * `LocalTrack.replaceTrack`) BEFORE any speech flows, so the raw mic is never
   * on the wire while the interpreter is ON.
   */
  onOutputTrack?: (track: MediaStreamTrack) => void;
}

export type { VoiceTranslationState };

let sdkPromise: Promise<typeof import("microsoft-cognitiveservices-speech-sdk")> | null = null;
function loadSpeechSdk(): Promise<typeof import("microsoft-cognitiveservices-speech-sdk")> {
  if (!sdkPromise) sdkPromise = import("microsoft-cognitiveservices-speech-sdk");
  return sdkPromise;
}

// ---------------------------------------------------------------------------
// Shared browser-side helper: a guaranteed-silent MediaStream track used by the
// components to replace the published mic immediately when the interpreter is
// toggled ON — bridging the engine's boot gap so un-translated audio can never
// leak out even for the few hundred ms before the TTS track is live.
// ---------------------------------------------------------------------------

let silentCtx: AudioContext | null = null;
let silentDest: MediaStreamAudioDestinationNode | null = null;

export function createSilentAudioTrack(): MediaStreamTrack {
  if (typeof window === "undefined") {
    throw new Error("createSilentAudioTrack() can only be called in a browser.");
  }
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("WebAudio is not supported in this browser.");
  if (!silentCtx) silentCtx = new Ctx();
  if (!silentDest) silentDest = silentCtx.createMediaStreamDestination();
  return silentDest.stream.getAudioTracks()[0];
}

export class VoiceTranslationEngine {
  private opts: VoiceTranslationEngineOptions;
  /** Live patient language (a `SupportedLanguage.code`); target+voice on the doctor side, STT source on the patient side. */
  private patientLanguage: string;
  private sdk: typeof import("microsoft-cognitiveservices-speech-sdk") | null = null;
  private token: string | null = null;
  private region = "";

  private recognizer: speechsdk.TranslationRecognizer | null = null;
  private synthesizer: speechsdk.SpeechSynthesizer | null = null;
  private pushStream: speechsdk.PushAudioInputStream | null = null;

  private ctx: AudioContext | null = null;
  private inputWorklet: AudioWorkletNode | null = null;
  private outputWorklet: AudioWorkletNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private outputTrackNotified = false;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private remoteSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private localMicTrack: MediaStreamTrack | null = null;
  private remoteAudioTrack: RemoteAudioTrack | null = null;

  private tokenTimer: ReturnType<typeof setTimeout> | null = null;
  private state: VoiceTranslationState = "off";
  private started = false;
  private disposed = false;
  private synthesizing = false;
  private attachGen = 0;
  /** Monotonic id for the newest synthesis request — stale completions/drains are ignored. */
  private speechSeq = 0;
  private bootPromise: Promise<void> | null = null;

  constructor(opts: VoiceTranslationEngineOptions) {
    this.opts = opts;
    this.patientLanguage = opts.patientLanguage;
  }

  get role(): TranslationRole {
    return this.opts.role;
  }
  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start (or resume) the engine. Inputs are captured SEPARATELY from the
   * published LiveKit mic: `localMic` is the raw mic MediaStreamTrack feeding
   * STT (kept alive because it is replaced with the TTS track, never stopped),
   * `remote` is the other participant's track used ONLY for echo-gating. The
   * published audio is the engine's own TTS output track (see
   * `onOutputTrack`). Idempotent and safe during an in-flight boot.
   */
  start(localMic: MediaStreamTrack | null, remote: RemoteAudioTrack | null): Promise<void> {
    this.disposed = false;
    this.localMicTrack = localMic;
    this.remoteAudioTrack = remote;
    if (this.started) {
      this.setInputs(localMic, remote);
      return Promise.resolve();
    }
    if (this.bootPromise) {
      this.setInputs(localMic, remote);
      return this.bootPromise;
    }
    this.bootPromise = this.boot().finally(() => {
      this.bootPromise = null;
    });
    return this.bootPromise;
  }

  /** Re-attach/update inputs (track swapped, participant re-published, mic switched). */
  setInputs(localMic: MediaStreamTrack | null, remote: RemoteAudioTrack | null): void {
    this.localMicTrack = localMic;
    this.remoteAudioTrack = remote;
    if (!this.started) return;
    this.tearDownInputNodes();
    void this.attachInputGraph();
  }

  /**
   * Mid-call language change: re-create the recognizer + synthesizer against
   * the new selection, flush the TTS queue, and swap the translation
   * direction — without touching the audio graph or the published track.
   */
  setPatientLanguage(code: string): void {
    if (!code || code === this.patientLanguage || !languageByCode(code)) return;
    this.patientLanguage = code;
    if (!this.started || !this.sdk || !this.token) return;

    this.setEngineState("starting");
    // Drop any in-flight synthesis in the old language/voice.
    this.speechSeq++;
    this.synthesizing = false;
    this.outputWorklet?.port.postMessage({ type: "clear" });

    try {
      this.recognizer?.stopContinuousRecognitionAsync();
    } catch {
      /* best effort */
    }
    this.recognizer = null;
    try {
      this.synthesizer?.close();
    } catch {
      /* best effort */
    }
    this.synthesizer = null;

    if (!this.createRecognizer(this.sdk, this.token, this.region)) {
      this.disableTransiently();
      this.setEngineState("error");
      return;
    }
    this.createSynthesizer(this.sdk, this.token, this.region);
    this.setEngineState("listening");
  }

  /** Stop the engine and tear the whole graph down. */
  stop(): void {
    this.disposed = true;
    this.started = false;
    this.bootPromise = null;
    this.tokenTimer = clearTimer(this.tokenTimer);
    this.synthesizing = false;
    this.speechSeq++;
    this.outputWorklet?.port.postMessage({ type: "clear" });

    try {
      this.recognizer?.stopContinuousRecognitionAsync();
    } catch {
      /* teardown must never throw into the call */
    }
    this.recognizer = null;

    try {
      this.pushStream?.close();
    } catch {
      /* best effort */
    }
    this.pushStream = null;

    this.tearDownAudioGraph();
    this.setEngineState("off");
  }

  /** Disconnect everything. The component swaps the raw mic back first. */
  dispose(): void {
    this.stop();
  }

  /**
   * Tear down after a failure while the interpreter is still ENABLED. The raw
   * mic stays un-published (the component keeps a silent/TTS track on the
   * wire) — un-translated speech must never leak through just because Azure
   * hiccupped. A later `start()` retries cleanly.
   */
  private disableTransiently(): void {
    this.started = false;
    this.bootPromise = null;
    this.tokenTimer = clearTimer(this.tokenTimer);
    this.synthesizing = false;
    this.speechSeq++;
    this.outputWorklet?.port.postMessage({ type: "clear" });

    try {
      this.recognizer?.stopContinuousRecognitionAsync();
    } catch {
      /* best effort */
    }
    this.recognizer = null;

    try {
      this.pushStream?.close();
    } catch {
      /* best effort */
    }
    this.pushStream = null;

    this.tearDownAudioGraph();
  }

  /** Called from within a user gesture so mobile autoplay permits input/output audio. */
  async userGesture(): Promise<void> {
    try {
      await this.ctx?.resume();
    } catch {
      /* best effort */
    }
  }

  /**
   * Pause interpreting: the local mic STT is gated (the published TTS track
   * just goes quiet). Resume with `resume()`.
   */
  pause(): void {
    if (!this.started) return;
    this.inputWorklet?.port.postMessage({ type: "gate", on: true });
    this.setEngineState("paused");
  }

  resume(): void {
    if (!this.started) return;
    this.inputWorklet?.port.postMessage({ type: "gate", on: false });
    this.setEngineState("listening");
  }
  // -------------------------------------------------------------------------
  // Boot / teardown internals
  // -------------------------------------------------------------------------

  private async boot(): Promise<void> {
    const { onStateChange } = this.opts;
    this.setEngineState("starting");
    try {
      this.sdk = await loadSpeechSdk();
    } catch {
      this.disableTransiently();
      this.setEngineState("error");
      return;
    }
    if (this.disposed) return;

    const granted = await this.opts.getToken().catch(() => null);
    if (!granted?.token || granted.error) {
      this.disableTransiently();
      this.setEngineState("error");
      return;
    }
    if (this.disposed) return;
    this.token = granted.token;
    this.region = granted.region;

    const sdk = this.sdk;
    if (!sdk) {
      this.disableTransiently();
      this.setEngineState("error");
      return;
    }

    if (!(await this.createAudioGraph())) {
      this.disableTransiently();
      this.setEngineState("error");
      return;
    }
    if (this.disposed) return;

    if (!this.createRecognizer(sdk, granted.token, granted.region)) {
      this.disableTransiently();
      this.setEngineState("error");
      return;
    }
    if (this.disposed) {
      this.stop();
      return;
    }
    this.createSynthesizer(sdk, granted.token, granted.region);

    this.started = true;
    await this.attachInputGraph();
    if (this.disposed) return;

    this.tokenTimer = setTimeout(
      () => void this.refreshToken(),
      AZURE_SPEECH_TOKEN_REFRESH_SECONDS * 1000,
    );

    this.inputWorklet?.port.postMessage({ type: "gate", on: false });
    onStateChange("listening");
  }

  /**
   * Create the one AudioContext holding BOTH stages: the silent input stage
   * (mic resample → STT, remote → echo gate) and the output stage (TTS →
   * MediaStreamAudioDestinationNode). The dest track is the publishable
   * translation — reported once via `onOutputTrack` so it can replace the
   * published mic the moment it exists (silence keeps any boot gap safe).
   */
  private async createAudioGraph(): Promise<boolean> {
    if (this.ctx && this.outputWorklet && this.mediaStreamDest) {
      this.notifyOutputTrack();
      return true;
    }
    if (typeof window === "undefined") return false;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;

    let localCtx: AudioContext | null = null;
    try {
      const ctx = new Ctx();
      localCtx = ctx;
      const inputUrl = URL.createObjectURL(
        new Blob([VOICE_TRANSLATION_INPUT_WORKLET_SRC], {
          type: "application/javascript",
        }),
      );
      const outputUrl = URL.createObjectURL(
        new Blob([VOICE_TRANSLATION_OUTPUT_WORKLET_SRC], {
          type: "application/javascript",
        }),
      );
      try {
        await ctx.audioWorklet.addModule(inputUrl);
        await ctx.audioWorklet.addModule(outputUrl);
      } finally {
        URL.revokeObjectURL(inputUrl);
        URL.revokeObjectURL(outputUrl);
      }
      if (this.disposed) {
        await closeContext(localCtx);
        return false;
      }

      const inputWorklet = new AudioWorkletNode(ctx, VOICE_TRANSLATION_INPUT_WORKLET_ID);
      inputWorklet.port.onmessage = this.onWorkletMessage.bind(this);
      // Zero-gain sink: the interpreter's consumption must never reach this
      // device's speakers (the remote track is played by RoomAudioRenderer).
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;
      inputWorklet.connect(muteGain);
      muteGain.connect(ctx.destination);

      const outputWorklet = new AudioWorkletNode(ctx, VOICE_TRANSLATION_OUTPUT_WORKLET_ID);
      const dest = ctx.createMediaStreamDestination();
      outputWorklet.connect(dest);

      this.ctx = ctx;
      this.inputWorklet = inputWorklet;
      this.outputWorklet = outputWorklet;
      this.mediaStreamDest = dest;
      this.notifyOutputTrack();
      await ctx.resume();
      return true;
    } catch (e) {
      console.error("[voice-translation] audio graph failed", e);
      try {
        await closeContext(localCtx);
      } catch {
        /* best effort */
      }
      this.ctx = null;
      this.inputWorklet = null;
      this.outputWorklet = null;
      this.mediaStreamDest = null;
      this.outputTrackNotified = false;
      return false;
    }
  }

  private notifyOutputTrack(): void {
    if (this.outputTrackNotified || !this.ctx || !this.mediaStreamDest) return;
    const track = this.mediaStreamDest.stream.getAudioTracks()[0];
    if (!track) return;
    this.outputTrackNotified = true;
    try {
      this.opts.onOutputTrack?.(track);
    } catch {
      /* observer errors must not break the engine */
    }
  }

  private createRecognizer(
    sdk: typeof import("microsoft-cognitiveservices-speech-sdk"),
    token: string,
    region: string,
  ): boolean {
    try {
      const config = sdk.SpeechTranslationConfig.fromAuthorizationToken(token, region);
      const sourceLanguage = roleSpeechSource(this.opts.role, this.patientLanguage);
      const targetLanguage = roleTranslationTarget(this.opts.role, this.patientLanguage);
      config.speechRecognitionLanguage = sourceLanguage;
      config.addTargetLanguage(targetLanguage);

      const pushStream = sdk.AudioInputStream.createPushStream();
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      this.pushStream = pushStream;

      const recognizer = new sdk.TranslationRecognizer(config, audioConfig);

      recognizer.recognizing = (_sender, e) => {
        if (e.result.reason === sdk.ResultReason.TranslatingSpeech) {
          this.emitSegment(e.result, true);
          this.setEngineState("translating");
        }
      };

      recognizer.recognized = (_sender, e) => {
        if (e.result.reason === sdk.ResultReason.TranslatedSpeech) {
          this.handleFinalResult(e.result);
        }
      };

      recognizer.canceled = (_sender, e) => {
        console.error("[voice-translation] recognizer canceled", e.errorDetails ?? "");
        // Interpreter is still ENABLED → the raw mic must stay un-published.
        this.disableTransiently();
        this.setEngineState("error");
      };

      recognizer.sessionStarted = () => {
        if (this.started) this.setEngineState("listening");
      };
      recognizer.sessionStopped = () => {
        if (this.started) this.setEngineState("paused");
      };

      this.recognizer = recognizer;
      this.recognizer.startContinuousRecognitionAsync();
      return true;
    } catch (e) {
      console.error("[voice-translation] failed to create recognizer", e);
      return false;
    }
  }

  private createSynthesizer(
    sdk: typeof import("microsoft-cognitiveservices-speech-sdk"),
    token: string,
    region: string,
  ): void {
    try {
      const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
      // Raw PCM so the pull stream hands us Int16 @ 24 kHz directly for the
      // output worklet — no container headers to strip.
      config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
      config.speechSynthesisVoiceName = roleTtsVoice(this.opts.role, this.patientLanguage);
      this.synthesizer = new sdk.SpeechSynthesizer(config);
    } catch (e) {
      console.error("[voice-translation] failed to create synthesizer", e);
      this.synthesizer = null;
    }
  }

  private async refreshToken(): Promise<void> {
    if (!this.started) return;
    const granted = await this.opts.getToken().catch(() => null);
    if (!granted?.token || granted.error) return; // keep the old (still-valid) token
    if (!this.started) return;

    this.token = granted.token;
    try {
      if (this.recognizer) this.recognizer.authorizationToken = granted.token;
      if (this.synthesizer) this.synthesizer.authorizationToken = granted.token;
    } catch {
      /* best effort */
    }
    this.tokenTimer = setTimeout(
      () => void this.refreshToken(),
      AZURE_SPEECH_TOKEN_REFRESH_SECONDS * 1000,
    );
  }
  // -------------------------------------------------------------------------
  // Result handling / TTS streaming (pull output stream → worklet → published track)
  // -------------------------------------------------------------------------

  private handleFinalResult(result: speechsdk.TranslationRecognitionResult): void {
    const sdk = this.sdk;
    if (!sdk || result.reason !== sdk.ResultReason.TranslatedSpeech) return;
    const targetLanguage = roleTranslationTarget(this.opts.role, this.patientLanguage);
    const spoken = result.translations?.get(targetLanguage) ?? "";

    this.emitSegment(result, false, spoken);

    if (!spoken.trim()) {
      this.setEngineState("listening");
      return;
    }

    this.speak(spoken);
  }

  private emitSegment(
    result: speechsdk.TranslationRecognitionResult,
    interim: boolean,
    translatedOverride?: string,
  ): void {
    const source = roleSpeechSource(this.opts.role, this.patientLanguage);
    const target = roleTranslationTarget(this.opts.role, this.patientLanguage);
    const raw = translatedOverride ?? result.translations?.get(target) ?? "";
    const originalRaw = result.text ?? "";
    // The AUDIBLE Urdu keeps its native script (correct ur-PK pronunciation
    // for the TTS); the WRITTEN Urdu is rendered in conversational Pakistani
    // Roman Urdu so transcripts read naturally.
    const forDisplay = target === URDU_TRANSLATION_CODE ? toRomanUrdu(raw) : raw;
    const originalForDisplay = isUrduCode(source) ? toRomanUrdu(originalRaw) : originalRaw;
    this.opts.onSegment?.({
      role: this.opts.role,
      sourceLanguage: source,
      targetLanguage: target,
      original: originalForDisplay,
      translated: forDisplay,
      interim,
    });
  }

  private speak(text: string): void {
    const sdk = this.sdk;
    const synth = this.synthesizer;
    if (!sdk || !synth || !this.started) return;
    // Queue discipline: a new segment landing while synthesis streams is NOT
    // queued into TTS (the transcript still records it) — this keeps latency
    // low and guarantees stale utterances never stack behind the live one.
    if (this.synthesizing) return;
    const id = ++this.speechSeq;
    this.synthesizing = true;
    this.setEngineState("speaking");

    const stream = sdk.AudioOutputStream.createPullStream();
    synth.speakTextAsync(
      text,
      () => {
        /* audio flows through the drain loop below */
      },
      (err) => {
        // TTS failure is NON-fatal: live audio continues and the transcript
        // still shows the translation.
        if (id !== this.speechSeq) return;
        console.error("[voice-translation] synthesis failed", err);
        this.synthesizing = false;
        if (this.started) {
          this.setEngineState("listening");
        }
      },
      stream,
    );
    void this.drainOutput(stream, id);
  }

  /**
   * Read the synthesized PCM off the pull stream as it is produced (pipelined
   * TTS start) and pipe it into the output worklet that drives the published
   * track. Spans are individually read while SynthesisTurn writes chunks and
   * closes the stream at the end of the utterance.
   */
  private async drainOutput(stream: speechsdk.PullAudioOutputStream, id: number): Promise<void> {
    const buf = new ArrayBuffer(VT_TTS_READ_BYTES);
    try {
      for (;;) {
        const n = await stream.read(buf);
        if (id !== this.speechSeq) return;
        if (n <= 0) break;
        const copy = buf.slice(0, n);
        this.outputWorklet?.port.postMessage({ type: "pcm", id, buffer: copy }, [copy]);
      }
    } catch {
      return; // stream closed underneath us — a newer utterance or teardown
    }
    if (id !== this.speechSeq) return;
    this.synthesizing = false;
    if (this.started) {
      this.setEngineState("listening");
    }
  }

  // -------------------------------------------------------------------------
  // Input audio graph (local mic → STT, remote → echo gate)
  // -------------------------------------------------------------------------

  private async attachInputGraph(): Promise<void> {
    const gen = ++this.attachGen;
    const ctx = this.ctx;
    const inputWorklet = this.inputWorklet;
    if (!ctx || !inputWorklet || typeof window === "undefined") return;

    try {
      this.micSource?.disconnect();
    } catch {
      /* best effort */
    }
    try {
      this.remoteSource?.disconnect();
    } catch {
      /* best effort */
    }
    this.micSource = null;
    this.remoteSource = null;
    this.micStream = null;
    this.remoteStream = null;

    try {
      const micTrack = this.localMicTrack;
      if (micTrack && micTrack.readyState === "live") {
        this.micStream = new MediaStream([micTrack]);
        const src = ctx.createMediaStreamSource(this.micStream);
        src.connect(inputWorklet, 0, 0);
        this.micSource = src;
      }

      const remoteTrack = this.remoteAudioTrack?.mediaStreamTrack;
      if (remoteTrack && remoteTrack.readyState === "live") {
        this.remoteStream = new MediaStream([remoteTrack]);
        const src = ctx.createMediaStreamSource(this.remoteStream);
        src.connect(inputWorklet, 0, 1);
        this.remoteSource = src;
      }
    } catch (e) {
      console.error("[voice-translation] attaching input graph failed", e);
      if (gen === this.attachGen && this.started) {
        this.disableTransiently();
        this.setEngineState("error");
      }
      return;
    }

    if (gen === this.attachGen && this.started) {
      void ctx.resume().catch(() => undefined);
    }
  }

  private onWorkletMessage(event: MessageEvent): void {
    const data = event.data as { type: string; buffer?: ArrayBuffer };
    if (!data) return;
    if (data.type === "pcm" && data.buffer) {
      try {
        this.pushStream?.write(data.buffer);
      } catch {
        /* stream closed mid-write — ignore */
      }
    } else if (data.type === "speech") {
      if (this.started) this.setEngineState("translating");
    } else if (data.type === "silence") {
      if (this.started && !this.synthesizing) {
        this.setEngineState("listening");
      }
    }
  }

  private tearDownInputNodes(): void {
    try {
      this.micSource?.disconnect();
    } catch {
      /* best effort */
    }
    try {
      this.remoteSource?.disconnect();
    } catch {
      /* best effort */
    }
    try {
      this.inputWorklet?.port.postMessage({ type: "gate", on: true });
    } catch {
      /* best effort */
    }
    this.micSource = null;
    this.remoteSource = null;
    this.micStream = null;
    this.remoteStream = null;
  }

  private tearDownAudioGraph(): void {
    this.attachGen++;
    this.tearDownInputNodes();
    try {
      this.outputWorklet?.port.postMessage({ type: "clear" });
    } catch {
      /* best effort */
    }
    try {
      this.synthesizer?.close();
    } catch {
      /* best effort */
    }
    this.synthesizer = null;
    this.inputWorklet = null;
    this.outputWorklet = null;
    this.mediaStreamDest = null;
    this.outputTrackNotified = false;
    void closeContext(this.ctx);
    this.ctx = null;
  }

  private setEngineState(state: VoiceTranslationState): void {
    if (this.state === state) return;
    this.state = state;
    try {
      this.opts.onStateChange(state);
    } catch {
      /* observer errors must not break the engine */
    }
  }
}

async function closeContext(ctx: AudioContext | null): Promise<void> {
  if (!ctx) return;
  try {
    if (ctx.state !== "closed") await ctx.close();
  } catch {
    /* best effort */
  }
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer) clearTimeout(timer);
  return null;
}
