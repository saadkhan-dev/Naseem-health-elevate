import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

/**
 * Server-side LiveKit configuration and token minting for video consultations.
 *
 * This replaces the old Google Meet layer (src/lib/server/google-meet.ts is no
 * longer part of the consultation flow). It is ONLY ever imported by server
 * code — server functions in actions.functions.ts, the DB-backed sessions
 * module and the e2e tests. The API secret never reaches the browser; clients
 * receive a short-lived signed JWT scoped to exactly one room.
 *
 * Environment variables (Cloudflare Workers secret bindings, see README):
 *   LIVEKIT_URL         e.g. wss://your-project.livekit.cloud
 *   LIVEKIT_API_KEY     LiveKit project API key
 *   LIVEKIT_API_SECRET  LiveKit project API secret
 *   LIVEKIT_PLAN        optional display label for the admin usage panel
 *                       (defaults to "Build")
 */

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  configured: boolean;
  /** Comma-separated list of missing variable names ("" when fully configured). */
  missing: string;
}

export class LiveKitNotConfiguredError extends Error {
  constructor() {
    super(
      "LiveKit is not configured on the server yet (missing LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET).",
    );
    this.name = "LiveKitNotConfiguredError";
  }
}

function readEnv(name: string): string | undefined {
  return (process.env[name] as string | undefined) ?? (import.meta.env[name] as string | undefined);
}

export function getLiveKitConfig(): LiveKitConfig {
  const url = readEnv("LIVEKIT_URL") ?? "";
  const apiKey = readEnv("LIVEKIT_API_KEY") ?? "";
  const apiSecret = readEnv("LIVEKIT_API_SECRET") ?? "";
  const missing = [
    ["LIVEKIT_URL", url],
    ["LIVEKIT_API_KEY", apiKey],
    ["LIVEKIT_API_SECRET", apiSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name as string)
    .join(", ");
  return { url, apiKey, apiSecret, configured: !missing, missing };
}

export function liveKitConfigured(): boolean {
  return getLiveKitConfig().configured;
}

/** Convert a wss/ws LiveKit URL to the https base used by the REST API. */
export function toLiveKitHttpUrl(url: string): string {
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

/**
 * Admin/usage-panel client. Requires LIVEKIT_API_KEY + LIVEKIT_API_SECRET
 * (server secret) and a roomList/roomAdmin grant, so it is only used from the
 * authenticated admin server function.
 */
export function roomServiceClient(): RoomServiceClient {
  const config = getLiveKitConfig();
  if (!config.configured) throw new LiveKitNotConfiguredError();
  return new RoomServiceClient(toLiveKitHttpUrl(config.url), config.apiKey, config.apiSecret);
}

export interface MintVideoJoinAccessTokenArgs {
  roomName: string;
  /** Stable participant identity, e.g. "patient-naseem-vc123456". */
  identity: string;
  /** Human-friendly participant name shown inside the room. */
  name: string;
  /** Doctors/admins get the roomAdmin grant (can manage participants). */
  roomAdmin?: boolean;
}

export interface VideoJoinToken {
  token: string;
  serverUrl: string;
  roomName: string;
  identity: string;
  expiresAt: number;
}

/** How long a video join token stays valid (a full consultation window). */
export const VIDEO_JOIN_TOKEN_TTL_SECONDS = 60 * 60 * 4;

/**
 * Server-side bounds for the app-tracked usage estimate (video_session_events).
 * The app never trusts client timestamps: a participant's "left" event is the
 * only provable end of a connection. These constants reconcile the cases where
 * that event is lost (tab closed / a reconnect that raised a duplicate
 * "joined" event) so stale rows can never inflate the estimate indefinitely.
 */
export const VIDEO_EVENT_RECONNECT_GRACE_MS = 5 * 60_000;
export const VIDEO_EVENT_MAX_LEG_MS = 4 * 60 * 60_000;

/**
 * Mint a short-lived livekit-client JWT for a single participant, scoped to
 * exactly the consultation's room. Server-side only — LIVEKIT_API_SECRET is
 * never exposed to the browser.
 */
export async function mintVideoJoinAccessToken(
  args: MintVideoJoinAccessTokenArgs,
): Promise<VideoJoinToken> {
  const config = getLiveKitConfig();
  if (!config.configured) throw new LiveKitNotConfiguredError();

  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity: args.identity,
    name: args.name,
    ttl: `${VIDEO_JOIN_TOKEN_TTL_SECONDS}s`,
  });
  at.addGrant({
    room: args.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    roomAdmin: Boolean(args.roomAdmin),
  });

  return {
    token: await at.toJwt(),
    serverUrl: config.url,
    roomName: args.roomName,
    identity: args.identity,
    expiresAt: Date.now() + VIDEO_JOIN_TOKEN_TTL_SECONDS * 1000,
  };
}

/** Official plan label shown on the admin usage panel. */
export function getLiveKitPlanLabel(): string {
  return readEnv("LIVEKIT_PLAN") ?? "Build";
}

/**
 * Officially documented LiveKit "Build" (free) plan allowances — the numbers
 * the admin usage panel compares against. Source (verified at audit time):
 * https://docs.livekit.io/cloud/manage/quotas-and-limits/
 *
 * Billing period is the calendar month; free allowances reset on the 1st and
 * never roll over. The official per-project Analytics API is a Scale+ feature,
 * so on the Build plan the panel labels those columns "Estimated".
 */
export const LIVEKIT_BUILD_ALLOWANCES = {
  webrtcParticipantMinutes: 5_000,
  dataTransferGb: 50,
  concurrentParticipants: 100,
  agentSessionMinutes: 1_000,
  concurrentAgentSessions: 5,
  sttConcurrentWorkers: 5,
  ttsConcurrentWorkers: 5,
  llmRequestsPerMinute: 100,
  llmTokensPerMinute: 600_000,
  inferenceCredits: 2.5,
  transcodeMinutes: 60,
  trackEgressMinutes: 60,
  apiRequestsPerMinute: 1_000,
} as const;

/**
 * LiveKit "Build" (free) plan concurrency limits that are NOT available on the
 * official Analytics API / are enforced as hard caps rather than tracked usage.
 */
export const LIVEKIT_BUILD_HARD_LIMITS = {
  concurrentParticipants: 100,
  concurrentAgentSessions: 5,
  sttConcurrentWorkers: 5,
  ttsConcurrentWorkers: 5,
  llmRequestsPerMinute: 100,
  llmTokensPerMinute: 600_000,
  apiRequestsPerMinute: 1_000,
} as const;
