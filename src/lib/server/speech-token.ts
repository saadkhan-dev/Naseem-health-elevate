/**
 * Server-side Azure AI Speech configuration + short-lived access-token minting
 * for the real-time voice translation ("interpreter") feature.
 *
 * The browser's Speech SDK needs an Azure access token, but the `AzureSpeechKey`
 * must never reach the client. Exactly like the LiveKit join JWT flow
 * (`server/livekit.ts`), the server mints a short-lived token here — only the
 * token travels to the browser, and it is scoped/refreshed server-side.
 *
 * Environment variables (set in .env locally and as Cloudflare Worker secret
 * bindings in production, see README):
 *   AZURE_SPEECH_KEY     Azure AI Speech subscription key
 *   AZURE_SPEECH_REGION  Azure region of the speech resource (e.g. "eastus")
 *
 * Token endpoint (official): POST https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken
 * Azure-issued tokens expire after 10 minutes by default.
 */
import {
  AZURE_SPEECH_TOKEN_TTL_SECONDS,
  AZURE_SPEECH_TOKEN_REFRESH_SECONDS,
} from "@/lib/speech-token-constants";

export class AzureSpeechNotConfiguredError extends Error {
  constructor() {
    super(
      "Voice translation is not configured on the server yet (missing AZURE_SPEECH_KEY and AZURE_SPEECH_REGION).",
    );
    this.name = "AzureSpeechNotConfiguredError";
  }
}

function readEnv(name: string): string | undefined {
  return (process.env[name] as string | undefined) ?? (import.meta.env[name] as string | undefined);
}

export interface AzureSpeechConfig {
  key: string;
  region: string;
  configured: boolean;
  /** Comma-separated list of missing variable names ("" when fully configured). */
  missing: string;
}

export function getAzureSpeechConfig(): AzureSpeechConfig {
  const key = readEnv("AZURE_SPEECH_KEY") ?? "";
  const region = readEnv("AZURE_SPEECH_REGION") ?? "";
  const missing = [
    ["AZURE_SPEECH_KEY", key],
    ["AZURE_SPEECH_REGION", region],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name as string)
    .join(", ");
  return { key, region, configured: !missing, missing };
}

export function azureSpeechConfigured(): boolean {
  return getAzureSpeechConfig().configured;
}

export interface AzureSpeechAccessToken {
  token: string;
  region: string;
  /** Client keeps the token for at most this many seconds before re-minting. */
  expiresInSeconds: number;
}

/**
 * Mint a short-lived Azure AI Speech access token. Server-side only — the key
 * is sent as the `Ocp-Apim-Subscription-Key` header and never returned.
 */
export async function mintAzureSpeechAccessToken(): Promise<AzureSpeechAccessToken> {
  const config = getAzureSpeechConfig();
  if (!config.configured) throw new AzureSpeechNotConfiguredError();

  const endpoint = `https://${config.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.key,
      "Content-Length": "0",
    },
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(
      `Azure speech token request failed (${response.status}${detail ? `: ${detail}` : ""}).`,
    );
  }

  const token = (await response.text()).trim();
  if (!token) throw new Error("Azure speech token request returned an empty token.");

  return {
    token,
    region: config.region,
    expiresInSeconds: AZURE_SPEECH_TOKEN_TTL_SECONDS,
  };
}

/** The refresh window clients use so a token is always younger than its TTL. */
export function getAzureSpeechTokenRefreshAfterMs(): number {
  return AZURE_SPEECH_TOKEN_REFRESH_SECONDS * 1000;
}
