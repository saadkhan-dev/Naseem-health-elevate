import { describe, expect, it } from "bun:test";
import {
  decodeVoiceTranslationSegmentMessage,
  decodeVoiceTranslationStateMessage,
  encodeVoiceTranslationSegmentMessage,
  encodeVoiceTranslationStateMessage,
  isUrduCode,
  languageByCode,
  roleSpeechSource,
  roleTranslationTarget,
  roleTtsVoice,
  SUPPORTED_PATIENT_LANGUAGES,
  URDU_LANGUAGE_CODE,
  URDU_TRANSLATION_CODE,
} from "../src/lib/voice-translation";

describe("voice translation — sender-side role routing", () => {
  const urdu = languageByCode(URDU_LANGUAGE_CODE);
  const urduRow = SUPPORTED_PATIENT_LANGUAGES.find((l) => l.code === URDU_LANGUAGE_CODE);
  const pushto = languageByCode("ps-AF");

  it("STT source is the speaker's OWN language (their own mic)", () => {
    expect(roleSpeechSource("doctor", "ps-AF")).toBe(URDU_LANGUAGE_CODE);
    expect(roleSpeechSource("patient", "ps-AF")).toBe("ps-AF");
    expect(roleSpeechSource("patient", URDU_LANGUAGE_CODE)).toBe(URDU_LANGUAGE_CODE);
  });

  it("translation target is the OTHER language (what the listener must hear)", () => {
    expect(roleTranslationTarget("doctor", "ps-AF")).toBe(pushto?.translationTarget);
    expect(roleTranslationTarget("doctor", "ps-AF")).toBe("ps");
    expect(roleTranslationTarget("patient", "ps-AF")).toBe(URDU_TRANSLATION_CODE);
    expect(roleTranslationTarget("patient", "pa-PK")).toBe(URDU_TRANSLATION_CODE);
    expect(roleTranslationTarget("doctor", URDU_LANGUAGE_CODE)).toBe("ur");
  });

  it("doctor publishes the patient language's neural voice, patient publishes Urdu", () => {
    expect(roleTtsVoice("doctor", "ps-AF")).toBe(pushto?.ttsVoice);
    expect(roleTtsVoice("patient", "ps-AF")).toBe(urdu?.ttsVoice);
    expect(roleTtsVoice("patient", "ps-AF")).toBe(urduRow?.ttsVoice ?? "ur-PK-AsadNeural");
    expect(roleTtsVoice("doctor", URDU_LANGUAGE_CODE)).toBe(urdu?.ttsVoice);
  });

  it("role helpers never return an empty/invalid source or target", () => {
    for (const l of SUPPORTED_PATIENT_LANGUAGES) {
      expect(roleSpeechSource("doctor", l.code).length).toBeGreaterThan(0);
      expect(roleSpeechSource("patient", l.code)).toBe(l.code);
      expect(roleTranslationTarget("doctor", l.code).length).toBeGreaterThan(0);
      expect(roleTranslationTarget("patient", l.code)).toBe("ur");
      expect(roleTtsVoice("doctor", l.code).length).toBeGreaterThan(0);
      expect(roleTtsVoice("patient", l.code)).toBe(urdu?.ttsVoice);
    }
  });
});

describe("voice translation — data-channel state message", () => {
  it("encodes and decodes a full state broadcast", () => {
    const msg = { enabled: true, patientLanguage: "pa-PK", status: "Ready" };
    const decoded = decodeVoiceTranslationStateMessage(encodeVoiceTranslationStateMessage(msg));
    expect(decoded).toEqual(msg);
  });

  it("round-trips the optional speaking flag for the remote-speaker indicator", () => {
    const msg = { enabled: true, patientLanguage: "ps-AF", status: "Speaking…", speaking: true };
    const decoded = decodeVoiceTranslationStateMessage(encodeVoiceTranslationStateMessage(msg));
    expect(decoded).toEqual(msg);
    expect(decoded?.speaking).toBe(true);
  });

  it("leaves speaking undefined for older peers that never send it", () => {
    const msg = { enabled: true, patientLanguage: "bn-IN", status: "Listening" };
    const decoded = decodeVoiceTranslationStateMessage(encodeVoiceTranslationStateMessage(msg));
    expect(decoded?.speaking).toBeUndefined();
  });

  it("rejects malformed payloads without throwing", () => {
    expect(decodeVoiceTranslationStateMessage(new TextEncoder().encode("not json"))).toBeNull();
    expect(
      decodeVoiceTranslationStateMessage(
        new TextEncoder().encode(JSON.stringify({ enabled: "yes" })),
      ),
    ).toBeNull();
    expect(decodeVoiceTranslationStateMessage(new Uint8Array(0))).toBeNull();
  });
});

describe("voice translation — data-channel segment message", () => {
  it("encodes and decodes a finished doctor segment", () => {
    const msg = {
      role: "doctor" as const,
      sourceLanguage: "ur-IN",
      targetLanguage: "ps",
      original: "میری بات سنیں",
      translated: "تعال",
      interim: false,
    };
    expect(decodeVoiceTranslationSegmentMessage(encodeVoiceTranslationSegmentMessage(msg))).toEqual(
      msg,
    );
  });

  it("encodes and decodes an interim patient segment", () => {
    const msg = {
      role: "patient" as const,
      sourceLanguage: "pa-PK",
      targetLanguage: "ur",
      original: "mere peet vich dard",
      translated: "میرے پیٹ میں درد",
      interim: true,
    };
    expect(decodeVoiceTranslationSegmentMessage(encodeVoiceTranslationSegmentMessage(msg))).toEqual(
      msg,
    );
  });

  it("rejects a segment whose role is neither doctor nor patient", () => {
    const bad = encodeVoiceTranslationSegmentMessage({
      role: "admin" as "doctor",
      sourceLanguage: "ur-IN",
      targetLanguage: "ps",
      original: "x",
      translated: "y",
      interim: false,
    });
    expect(decodeVoiceTranslationSegmentMessage(bad)).toBeNull();
  });

  it("round-trips the optional speaking flag on a live segment", () => {
    const msg = {
      role: "doctor" as const,
      sourceLanguage: "ur-IN",
      targetLanguage: "en",
      original: "آپ کی پیٹھ",
      translated: "your back",
      interim: true,
      speaking: true,
    };
    expect(decodeVoiceTranslationSegmentMessage(encodeVoiceTranslationSegmentMessage(msg))).toEqual(
      msg,
    );
  });

  it("stamps speaking false on segments sent while the pipeline is idle", () => {
    const msg = {
      role: "patient" as const,
      sourceLanguage: "en-US",
      targetLanguage: "ur",
      original: "hello",
      translated: "ہیلو",
      interim: false,
      speaking: false,
    };
    expect(decodeVoiceTranslationSegmentMessage(encodeVoiceTranslationSegmentMessage(msg))).toEqual(
      msg,
    );
  });
});

describe("isUrduCode", () => {
  it("recognizes both the source and translation codes as Urdu", () => {
    expect(isUrduCode(URDU_LANGUAGE_CODE)).toBe(true);
    expect(isUrduCode(URDU_TRANSLATION_CODE)).toBe(true);
    expect(isUrduCode("ps-AF")).toBe(false);
    expect(isUrduCode(undefined)).toBe(false);
    expect(isUrduCode(null)).toBe(false);
    expect(isUrduCode("")).toBe(false);
  });
});
