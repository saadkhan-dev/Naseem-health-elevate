import {
  getVoiceTranslationToken as getVoiceTranslationTokenServer,
  setVideoTranslationState as setVideoTranslationStateServer,
  getVideoTranslationState as getVideoTranslationStateServer,
} from "@/lib/actions.functions";
import type { VideoTranslationState } from "@/lib/server/voice-translation";

export interface VoiceTranslationTokenResult {
  token: string | null;
  region: string;
  expiresInSeconds: number;
  error: string | null;
  configured: boolean;
}

/** Thin client wrappers — server-side logic + auth live in actions.functions.ts. */

export function getVoiceTranslationToken(vcNo: string): Promise<VoiceTranslationTokenResult> {
  return getVoiceTranslationTokenServer({ data: { vcNo } });
}

export function setVideoTranslationState(
  vcNo: string,
  enabled: boolean,
  patientLanguage: string,
): Promise<{ error: string | null }> {
  return setVideoTranslationStateServer({ data: { vcNo, enabled, patientLanguage } });
}

export function getVideoTranslationState(vcNo: string): Promise<{
  state: VideoTranslationState | null;
  error: string | null;
}> {
  return getVideoTranslationStateServer({ data: { vcNo } });
}
