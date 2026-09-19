import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminOrDoctor } from "./supabase-admin";
import {
  azureSpeechConfigured,
  mintAzureSpeechAccessToken,
  AzureSpeechNotConfiguredError,
} from "./speech-token";
import { languageByCode } from "@/lib/voice-translation";

/**
 * Server-side logic for the real-time voice translation ("interpreter") feature.
 *
 * Lives in its own module (like `video-sessions.ts`) so the e2e tests can
 * exercise it against the live Supabase project without the TanStack Start
 * wrapper. The thin server functions in `actions.functions.ts` are the auth
 * boundary on top.
 *
 * Rules enforced here:
 *  - The interpreter is OFF by default and can ONLY be turned on by a
 *    doctor/admin (the staff-only `setVideoTranslationState` wrapper guards the
 *    write; patients cannot enable it for anyone else).
 *  - The DOCTOR controls the patient's language: no auto-detection, no default.
 *    `setVideoTranslationState` only accepts a known `SupportedLanguage.code`;
 *    anything else (including the legacy "auto" sentinel from the old
 *    auto-detection build) is rejected so a bad value can never be persisted.
 *  - Per-consultation state lives on the `video_sessions` row
 *    (`translation_enabled`, `patient_language`) so a patient who joins late —
 *    or reconnects — picks up the active interpreter without needing a live
 *    data-channel history. Columns are created by the
 *    `supabase/migrations/0083_voice_translation.sql` migration.
 *  - A speech access token is granted to a doctor/admin caller for any valid
 *    consultation, and to a patient/guest caller ONLY when the interpreter is
 *    currently enabled for that session. The TextView of the grant rule is
 *    intentionally strict: a guest who can join the video call cannot mint an
 *    Azure token while the doctor has the interpreter off.
 */

export interface VideoTranslationState {
  enabled: boolean;
  patientLanguage: string;
}

const VIDEO_TRANSLATION_DEFAULT: VideoTranslationState = {
  enabled: false,
  patientLanguage: "",
};

export async function getVideoTranslationState(
  admin: SupabaseClient,
  vcNo: string,
): Promise<{ state: VideoTranslationState | null; error: string | null }> {
  const { data: session, error } = await admin
    .from("video_sessions")
    .select("id, translation_enabled, patient_language")
    .eq("vc_no", vcNo)
    .maybeSingle();

  if (error) return { state: null, error: error.message };
  if (!session) return { state: null, error: "No video session found for that code." };

  const raw = (session.patient_language as string | null) || "";
  return {
    state: {
      enabled: (session.translation_enabled as boolean) ?? false,
      // Normalize legacy "auto" / unknown values to "" so a reconnecting client
      // re-selects a language instead of assuming one.
      patientLanguage: languageByCode(raw) ? raw : "",
    },
    error: null,
  };
}

/**
 * Persist the doctor's interpreter state for a consultation. Only ever called
 * through the staff-only server function. `patientLanguage` must be a known
 * supported code (doctor-selected — there is NO auto-detection and no assumed
 * default); a code for a language the pipeline cannot actually support is
 * rejected rather than silently accepted.
 */
export async function setVideoTranslationState(
  admin: SupabaseClient,
  vcNo: string,
  enabled: boolean,
  patientLanguage: string,
): Promise<{ error: string | null }> {
  if (!languageByCode(patientLanguage)) {
    return { error: "Choose the patient's language first." };
  }
  const { error } = await admin
    .from("video_sessions")
    .update({
      translation_enabled: enabled,
      patient_language: patientLanguage,
    })
    .eq("vc_no", vcNo);
  return { error: error?.message ?? null };
}

export interface VideoTranslationGrant {
  token: string | null;
  region: string;
  expiresInSeconds: number;
  error: string | null;
  /** False when Azure speech is not configured on the server yet. */
  configured: boolean;
}

/**
 * Grant an Azure speech token for a consultation's interpreter. Staff callers
 * may always mint; everyone else only while the interpreter is enabled.
 */
export async function grantVideoTranslationToken(
  admin: SupabaseClient,
  vcNo: string,
  staffAccessToken: string | null | undefined,
): Promise<VideoTranslationGrant> {
  if (!azureSpeechConfigured()) {
    return {
      token: null,
      region: "",
      expiresInSeconds: 0,
      configured: false,
      error: new AzureSpeechNotConfiguredError().message,
    };
  }

  const { data: session } = await admin
    .from("video_sessions")
    .select("id, translation_enabled")
    .eq("vc_no", vcNo)
    .maybeSingle();
  if (!session) {
    return {
      token: null,
      region: "",
      expiresInSeconds: 0,
      configured: true,
      error: "No video session found for that code.",
    };
  }

  const isStaff = await isAdminOrDoctor(admin, staffAccessToken);
  const enabled = (session.translation_enabled as boolean) ?? false;
  if (!isStaff && !enabled) {
    return {
      token: null,
      region: "",
      expiresInSeconds: 0,
      configured: true,
      error: "Voice translation is available during the call once the doctor turns it on.",
    };
  }

  try {
    const minted = await mintAzureSpeechAccessToken();
    return {
      token: minted.token,
      region: minted.region,
      expiresInSeconds: minted.expiresInSeconds,
      configured: true,
      error: null,
    };
  } catch (e) {
    return {
      token: null,
      region: "",
      expiresInSeconds: 0,
      configured: true,
      error: e instanceof Error ? e.message : "Could not start voice translation.",
    };
  }
}

export { VIDEO_TRANSLATION_DEFAULT };
