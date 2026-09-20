/**
 * Shared constants + pure helpers for the real-time voice translation feature
 * (a.k.a. the consultation "interpreter"). Everything here is stateless and
 * safe to import from both client components AND server functions — nothing in
 * this module touches `window`, `process` or the Azure Speech SDK.
 *
 * Architecture (SENDER-SIDE translation — one authoritative audio stream per
 * direction, no double audio):
 *   - While the interpreter is ON, each participant's OWN device runs the full
 *     pipeline for the speech it generates and PUBLISHES the synthesized TTS as
 *     its LiveKit audio track. The raw microphone audio is never sent over
 *     LiveKit in translation mode — the only remote audio the other side
 *     receives is the translation, so there is exactly one stream per direction
 *     and no local TTS echo loop.
 *   - DOCTOR side  : doctor mic → ur-IN STT → translate → PATIENT-language TTS
 *                    (the `ttsVoice` of the doctor's selection) → published.
 *   - PATIENT side : patient mic → patient-language STT → translate → Urdu TTS
 *                    (`ur-PK-AsadNeural`) → published.
 *   - Translation OFF restores the normal direct LiveKit audio call (raw mic
 *     re-published). Urdu ↔ Urdu needs no interpreter: the doctor selecting
 *     Urdu for the patient naturally bypasses the engine entirely.
 *   - Only the doctor can enable/disable the interpreter AND pick the patient's
 *     language. The patient's device follows the doctor via a LiveKit
 *     data-channel state message (and the persisted row for late joiners).
 *   - Azure Speech access tokens are minted server-side (short-lived), exactly
 *     like the LiveKit join JWTs — the API key never reaches the browser.
 *
 * Language model (doctor-controlled, NO auto-detection):
 *   - The doctor's base language is Urdu (fixed, `ur-IN` STT; `ur-PK` TTS).
 *   - The doctor EXPLICITLY selects the patient's language during the call.
 *     There is no automatic detection and no assumed default.
 *   - When Patient Language = Urdu, no interpretation is needed and both sides
 *     simply speak naturally (natural bypass; nothing is translated).
 *   - Otherwise: doctor's Urdu → DoctorSelectedLang (patient hears), and the
 *     patient's speech → Urdu (doctor hears).
 *   - Urdu WRITTEN output (transcripts) is rendered as conversational Pakistani
 *     Roman Urdu — e.g. "Aap ko ye dard kab se ho raha hai?" — via the shared
 *     `toRomanUrdu` helper. The AUDIBLE Urdu keeps its native script so the
 *     `ur-PK-AsadNeural` voice pronounces it correctly. The engine therefore
 *     always speaks native-script Urdu to the TTS, and only the WRITTEN form is
 *     romanized.
 *   - A `SupportedLanguage.translationTarget` is the SHORT code Azure
 *     Speech-Translation requires for the target side (e.g. `pa`, `ps`), while
 *     `code` is the full STT source locale used by `speechRecognitionLanguage`.
 *
 * Role routing (pure, testable — the engine and the components share this so
 * sender-side STT/TTS configuration can never drift):
 *   - `roleSpeechSource(role, patientLanguage)`        : doctor → `ur-IN`,
 *     patient → `patientLanguage` (their own mic is the STT source).
 *   - `roleTranslationTarget(role, patientLanguage)`   : doctor → the selected
 *     language's short target, patient → `ur`.
 *   - `roleTtsVoice(role, patientLanguage)`            : doctor → the selected
 *     language's neural voice, patient → `ur-PK-AsadNeural`.
 */

export type TranslationRole = "doctor" | "patient";

export type VoiceTranslationState =
  "off" | "starting" | "listening" | "translating" | "speaking" | "paused" | "error";

export interface SupportedLanguage {
  /** Full Azure Speech BCP-47 locale used as the STT source language. */
  code: string;
  /** Short Azure Speech-Translation target code (e.g. `pa`, `ps`, `ur`). */
  translationTarget: string;
  /** English label shown in the doctor's picker. */
  label: string;
  /** Native-language label. */
  native: string;
  /** Azure neural voice used to speak translated text INTO this language. */
  ttsVoice: string;
  flag: string;
  /** Optional hint rendered next to a language (e.g. Urdu needs no translation). */
  note?: string;
}

/** Doctor's fixed base language (Urdu): STT locale when the patient speaks the doctor's language. */
export const URDU_LANGUAGE_CODE = "ur-IN";
/** Azure Speech translation target code for Urdu (short form, per Azure docs). */
export const URDU_TRANSLATION_CODE = "ur";

/**
 * Non-Urdu languages are offered to the doctor as the patient's selectable
 * language. Urdu is listed first as "no interpretation needed" so the doctor
 * can explicitly pick it for an Urdu-speaking patient (that selection simply
 * leaves both sides speaking naturally — never an Urdu→Urdu translation).
 *
 * Every row is fully supported by the configured Azure Speech pipeline today:
 * STT (source locale) + speech translation (target code) + a neural TTS voice.
 * Do NOT add a language unless all three exist. Notable exclusions:
 *   - Sindhi (`sd`) has NO Azure Speech STT locale, NO translation target and
 *     NO neural TTS voice, so it cannot be truthfully offered.
 */
export const SUPPORTED_PATIENT_LANGUAGES: readonly SupportedLanguage[] = [
  {
    code: "ur-IN",
    translationTarget: "ur",
    label: "Urdu",
    native: "اردو",
    ttsVoice: "ur-PK-AsadNeural",
    flag: "🇵🇰",
    note: "no translation needed",
  },
  {
    code: "en-US",
    translationTarget: "en",
    label: "English",
    native: "English",
    ttsVoice: "en-US-GuyNeural",
    flag: "🇬🇧",
  },
  {
    code: "ar-SA",
    translationTarget: "ar",
    label: "Arabic",
    native: "العربية",
    ttsVoice: "ar-SA-HamedNeural",
    flag: "🇸🇦",
  },
  {
    code: "pa-IN",
    translationTarget: "pa",
    label: "Punjabi",
    native: "ਪੰਜਾਬੀ",
    ttsVoice: "pa-IN-OjasNeural",
    flag: "🇮🇳",
  },
  {
    code: "ps-AF",
    translationTarget: "ps",
    label: "Pashto",
    native: "پښتو",
    ttsVoice: "ps-AF-GulNawazNeural",
    flag: "🇦🇫",
  },
  {
    code: "hi-IN",
    translationTarget: "hi",
    label: "Hindi",
    native: "हिन्दी",
    ttsVoice: "hi-IN-MadhurNeural",
    flag: "🇮🇳",
  },
  {
    code: "bn-IN",
    translationTarget: "bn",
    label: "Bengali",
    native: "বাংলা",
    ttsVoice: "bn-IN-BashkarNeural",
    flag: "🇮🇳",
  },
];

export function languageByCode(code: string | undefined | null): SupportedLanguage | undefined {
  if (!code) return undefined;
  return (
    SUPPORTED_PATIENT_LANGUAGES.find((l) => l.code === code) ??
    (code === URDU_TRANSLATION_CODE
      ? SUPPORTED_PATIENT_LANGUAGES.find((l) => l.code === URDU_LANGUAGE_CODE)
      : undefined)
  );
}

export function isUrduCode(code: string | undefined | null): boolean {
  return code === URDU_LANGUAGE_CODE || code === URDU_TRANSLATION_CODE;
}

// ---------------------------------------------------------------------------
// STT phrase-list boost (medical vocabulary)
// ---------------------------------------------------------------------------
//
// The Azure TranslationRecognizer transcribes the speaker's OWN language, and a
// raw general-model recognizer can fumble medical words that matter (body
// parts, symptoms, numeric durations, medication names) — especially when the
// speech mixes Urdu with English loanwords (e.g. "painkiller", "blood
// pressure"). Each STT source locale gets a short phrase list applied through
// `SpeechSDK.PhraseListGrammar` — a pure recognition BIAS, not a translation or
// behaviour change: it only helps the service transcribe these tokens, and if
// the API is ever unavailable it is skipped entirely (never breaks the call).
// The keys are the STT source locales from `roleSpeechSource` (doctor → ur-IN,
// patient → their selected language). Keep entries short phrases / single
// words — the phrase list is a hint, not a constraint.
export const MEDICAL_STT_BOOST: Readonly<Record<string, readonly string[]>> = {
  "ur-IN": [
    "کمر میں درد",
    "درد",
    "بخار",
    "کھانسی",
    "بلڈ پریشر",
    "شوگر",
    "دوا",
    "گولی",
    "ٹانگ",
    "ڈاکٹر صاحب",
    "سانس لینے میں دشواری",
    "چکر آنا",
    "متلی",
    "قے",
    "اسہال",
    "جوڑوں کا درد",
    "معدہ",
    "سر میں درد",
    "آرام",
    "شدید",
  ],
  "en-US": [
    "back pain",
    "severe pain",
    "painkiller",
    "right leg",
    "left leg",
    "numb",
    "radiating",
    "three days",
    "fever",
    "cough",
    "headache",
    "blood pressure",
    "sugar",
    "medicine",
    "tablet",
    "stomach pain",
    "shortness of breath",
    "dizziness",
    "nausea",
    "vomiting",
    "knee pain",
    "rest",
  ],
  "hi-IN": ["पीठ दर्द", "दर्द", "बुखार", "खांसी", "ब्लड प्रेशर", "दवा", "गोली", "सिरदर्द", "चक्कर"],
  "pa-IN": ["ਪਿੱਠ ਦਰਦ", "ਦਰਦ", "ਬੁਖ਼ਾਰ", "ਖੰਘ", "ਬਲੱਡ ਪ੍ਰੈਸ਼ਰ", "ਦਵਾਈ"],
  "bn-IN": ["পিঠে ব্যথা", "ব্যথা", "জ্বর", "কাশি", "ব্লাড প্রেসার", "ঔষধ"],
  "ps-AF": ["د کمر درد", "درد", "تبه", "خبره", "میډیسین"],
  "ar-SA": ["آلام الظهر", "ألم", "حمى", "سعال", "ضغط الدم", "دواء"],
};

/**
 * SENDER-SIDE role routing. The doctor speaks Urdu and the patient speaks their
 * selected language, so each device's OWN mic is the STT source and the OTHER
 * language is where the speech is translated + synthesized for publication.
 */
export function roleSpeechSource(role: TranslationRole, patientLanguage: string): string {
  return role === "doctor" ? URDU_LANGUAGE_CODE : patientLanguage;
}

export function roleTranslationTarget(role: TranslationRole, patientLanguage: string): string {
  return role === "doctor"
    ? (languageByCode(patientLanguage)?.translationTarget ?? URDU_TRANSLATION_CODE)
    : URDU_TRANSLATION_CODE;
}

/**
 * Neural TTS voice used for the PUBLISHED translation. Doctor: the selected
 * patient language's voice (the patient hears their own language). Patient:
 * always the doctor's Urdu voice so the doctor hears Urdu back.
 */
export function roleTtsVoice(role: TranslationRole, patientLanguage: string): string {
  if (role === "patient") {
    return languageByCode(URDU_LANGUAGE_CODE)?.ttsVoice ?? "ur-PK-AsadNeural";
  }
  return languageByCode(patientLanguage)?.ttsVoice ?? "ur-PK-AsadNeural";
}

/** e.g. "English → Urdu" / "Urdu → English" for pills, transcripts and the patient indicator. */
export function translationDirectionLabel(fromCode: string, toCode: string): string {
  return `${languageByCode(fromCode)?.label ?? fromCode} → ${languageByCode(toCode)?.label ?? toCode}`;
}

/**
 * Human-friendly status text for an engine state (used by pill/indicator).
 */
export function translationStateLabel(state: VoiceTranslationState): string {
  switch (state) {
    case "off":
      return "Off";
    case "starting":
      return "Starting…";
    case "listening":
      return "Listening";
    case "translating":
      return "Translating…";
    case "speaking":
      return "Speaking…";
    case "paused":
      return "Paused";
    case "error":
      return "Unavailable";
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// LiveKit data-channel protocol (doctor → patient interpreter state sync)
// ---------------------------------------------------------------------------

export const VOICE_TRANSLATION_TOPIC = "voice-translation-state";

export interface VoiceTranslationStateMessage {
  enabled: boolean;
  /** The doctor-selected patient language (a `SupportedLanguage.code`, or "" while none is selected). */
  patientLanguage: string;
  /** Compact human status snapshot for the patient indicator (e.g. "Translating…"). */
  status: string;
}

export function encodeVoiceTranslationStateMessage(msg: VoiceTranslationStateMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeVoiceTranslationStateMessage(
  payload: Uint8Array | ArrayBuffer,
): VoiceTranslationStateMessage | null {
  try {
    const data = payload instanceof ArrayBuffer ? new Uint8Array(payload) : payload;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(data));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { enabled?: unknown }).enabled === "boolean" &&
      typeof (parsed as { patientLanguage?: unknown }).patientLanguage === "string"
    ) {
      return parsed as VoiceTranslationStateMessage;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LiveKit data-channel protocol (transcript segments). Sender-side translation
// means each side generates the segments for ITS OWN speech — the doctor's
// (Urdu → patient language) and the patient's (patient language → Urdu). Each
// device broadcasts its own segments so the other side can show a combined
// conversation transcript. Receivers simply ignore segments carrying their own
// `role`.
// ---------------------------------------------------------------------------

export const VOICE_TRANSLATION_SEGMENT_TOPIC = "voice-translation-segment";

export interface VoiceTranslationSegmentMessage {
  role: TranslationRole;
  sourceLanguage: string;
  targetLanguage: string;
  original: string;
  translated: string;
  interim: boolean;
}

export function encodeVoiceTranslationSegmentMessage(
  msg: VoiceTranslationSegmentMessage,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeVoiceTranslationSegmentMessage(
  payload: Uint8Array | ArrayBuffer,
): VoiceTranslationSegmentMessage | null {
  try {
    const data = payload instanceof ArrayBuffer ? new Uint8Array(payload) : payload;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(data));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      ((parsed as { role?: unknown }).role === "doctor" ||
        (parsed as { role?: unknown }).role === "patient") &&
      typeof (parsed as { sourceLanguage?: unknown }).sourceLanguage === "string" &&
      typeof (parsed as { targetLanguage?: unknown }).targetLanguage === "string" &&
      typeof (parsed as { original?: unknown }).original === "string" &&
      typeof (parsed as { translated?: unknown }).translated === "string" &&
      typeof (parsed as { interim?: unknown }).interim === "boolean"
    ) {
      return parsed as VoiceTranslationSegmentMessage;
    }
    return null;
  } catch {
    return null;
  }
}
