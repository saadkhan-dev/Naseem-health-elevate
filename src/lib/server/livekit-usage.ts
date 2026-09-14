import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveKitConfig,
  getLiveKitPlanLabel,
  LIVEKIT_BUILD_ALLOWANCES,
  LIVEKIT_BUILD_HARD_LIMITS,
  roomServiceClient,
  VIDEO_EVENT_MAX_LEG_MS,
  VIDEO_EVENT_RECONNECT_GRACE_MS,
} from "./livekit";

/**
 * Snapshot builder for the admin "LiveKit Usage" panel.
 *
 * Honest sourcing model (no fake official numbers):
 *  - `allowances` limits : officially documented LiveKit "Build" plan constants.
 *  - `live` numbers      : queried live via the LiveKit REST API
 *                          (RoomServiceClient — requires LIVEKIT_API_SECRET +
 *                          roomList grant; server-side only).
 *  - `app-tracked`       : WebRTC minutes estimated from the `video_session_events`
 *                          table (best-effort). Verbatim note shown in the UI:
 *                          "Estimated — LiveKit official Analytics API unavailable
 *                          on this plan."
 *  - Every other official Analytics-API metric is `unavailable` (that API is a
 *    Scale+ feature) rather than guessed.
 */

export interface LiveKitUsageAllowance {
  label: string;
  unit: string;
  limit: number | null;
  /** `null` = no source of truth on this plan (show as unavailable). */
  used: number | null;
  source: "official" | "live" | "app-tracked" | "unavailable";
}

export interface LiveKitUsageSnapshot {
  ok: boolean;
  error: string | null;
  configured: boolean;
  plan: string;
  billingNotes: string[];
  allowances: LiveKitUsageAllowance[];
  live: {
    activeRooms: number | null;
    connectedParticipants: number | null;
    fetchedAt: string | null;
    warning: string | null;
    source: "live" | "unavailable";
  };
  lastUpdated: string;
}

interface ParticipantLeg {
  start: number;
  end: number;
}

/**
 * Sums the joined length of possibly overlapping/nested legs, counting each
 * second of a participant's connected time at most once (a reconnect that
 * duplicated a "joined" event must never be double-counted).
 */
function mergeParticipantLegs(legs: ParticipantLeg[]): number {
  if (legs.length === 0) return 0;
  const sorted = [...legs].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    const leg = sorted[i];
    if (leg.start <= curEnd) {
      curEnd = Math.max(curEnd, leg.end);
    } else {
      total += curEnd - curStart;
      curStart = leg.start;
      curEnd = leg.end;
    }
  }
  total += curEnd - curStart;
  return Math.max(0, total);
}

/**
 * App-tracked WebRTC minutes for the current calendar month.
 *
 * Source of truth is the server-side `video_session_events` rows (no invented
 * client timestamps). Each row is one "leg" of a participant's connection:
 * - Closed legs (left_at set) are provable and counted as-is.
 * - OPEN legs (left_at NULL — tab closed / "left" event lost) are bounded by
 *   the session's last provable activity (`sessionAnchor` = the last recorded
 *   leave, where the call evidently ended) plus the reconnect grace, and are
 *   absolutely capped by VIDEO_EVENT_MAX_LEG_MS so they can never accrue
 *   indefinitely.
 * - Overlapping legs for the SAME participant/session are merged so connected
 *   time is never double-counted.
 *
 * `now` is injectable for tests; the calendar-month window derives from it.
 */
export async function estimateParticipantMinutes(
  admin: SupabaseClient,
  options: { now?: number } = {},
): Promise<{
  minutes: number | null;
  source: "app-tracked" | "unavailable";
}> {
  const now = options.now ?? Date.now();
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from("video_session_events")
    .select("session_id, participant_role, joined_at, left_at")
    .gte("joined_at", monthStart.toISOString());

  // The migration table (supabase/livekit-video-sessions.sql) has not been run.
  if (error || !data) return { minutes: null, source: "unavailable" };

  // Last provable "call ended" moment per session: the latest left_at any
  // participant left. Used to bound OPEN legs so they stop growing.
  const sessionAnchor = new Map<string, number>();
  for (const row of data) {
    const left = row.left_at ? new Date(row.left_at as string).getTime() : Number.NaN;
    if (Number.isNaN(left)) continue;
    const sessionId = String(row.session_id);
    sessionAnchor.set(sessionId, Math.max(sessionAnchor.get(sessionId) ?? 0, left));
  }

  const byParticipant = new Map<string, ParticipantLeg[]>();
  for (const row of data) {
    const start = new Date(row.joined_at as string).getTime();
    if (Number.isNaN(start)) continue;
    const sessionId = String(row.session_id);
    const role = String(row.participant_role);
    const key = `${sessionId}|${role}`;

    const rawEnd = row.left_at ? new Date(row.left_at as string).getTime() : Number.NaN;
    let end: number;
    if (!Number.isNaN(rawEnd)) {
      end = rawEnd; // Provable leave — trust it.
    } else {
      // Open leg: bound it by the session's last known activity (or, when the
      // session has no closed leg at all, by an absolute per-leg cap).
      const anchor = sessionAnchor.get(sessionId);
      end =
        anchor !== undefined
          ? anchor + VIDEO_EVENT_RECONNECT_GRACE_MS
          : start + VIDEO_EVENT_MAX_LEG_MS;
    }
    end = Math.min(end, now);
    if (end < start) end = start; // never below its own start

    const legs = byParticipant.get(key) ?? [];
    legs.push({ start, end });
    byParticipant.set(key, legs);
  }

  let totalMs = 0;
  for (const legs of byParticipant.values()) {
    totalMs += mergeParticipantLegs(legs);
  }
  return { minutes: Math.round(totalMs / 60_000), source: "app-tracked" };
}

export async function getLiveKitUsageSnapshot(
  admin: SupabaseClient,
): Promise<LiveKitUsageSnapshot> {
  const now = new Date().toISOString();
  const billingNotes = [
    "Billing period: calendar month — free allowances reset on the 1st and do not roll over.",
    "Estimated — LiveKit official Analytics API unavailable on this plan.",
  ];

  const config = getLiveKitConfig();
  if (!config.configured) {
    return {
      ok: false,
      error:
        "LiveKit is not configured on the server yet (missing LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).",
      configured: false,
      plan: getLiveKitPlanLabel(),
      billingNotes,
      allowances: [],
      live: {
        activeRooms: null,
        connectedParticipants: null,
        fetchedAt: null,
        warning: null,
        source: "unavailable",
      },
      lastUpdated: now,
    };
  }

  // Live concurrency from the LiveKit REST API.
  let activeRooms: number | null = null;
  let connectedParticipants: number | null = null;
  let liveWarning: string | null = null;
  try {
    const client = roomServiceClient();
    const rooms = await client.listRooms();
    activeRooms = rooms.length;
    connectedParticipants = rooms.reduce((sum, room) => sum + (room.numParticipants ?? 0), 0);
  } catch (e) {
    liveWarning = e instanceof Error ? e.message : "Could not reach the LiveKit REST API.";
  }

  const estimate = await estimateParticipantMinutes(admin);

  const allowances: LiveKitUsageAllowance[] = [
    {
      label: "WebRTC participant minutes",
      unit: "min",
      limit: LIVEKIT_BUILD_ALLOWANCES.webrtcParticipantMinutes,
      used: estimate.minutes,
      source: estimate.source,
    },
    {
      label: "Downstream data transfer",
      unit: "GB",
      limit: LIVEKIT_BUILD_ALLOWANCES.dataTransferGb,
      used: null,
      source: "unavailable",
    },
    {
      label: "Concurrent participants (live)",
      unit: "participants",
      limit: LIVEKIT_BUILD_HARD_LIMITS.concurrentParticipants,
      used: connectedParticipants,
      source: liveWarning ? "unavailable" : "live",
    },
    {
      label: "Agent session minutes",
      unit: "min",
      limit: LIVEKIT_BUILD_ALLOWANCES.agentSessionMinutes,
      used: null,
      source: "unavailable",
    },
    {
      label: "STT concurrency",
      unit: "workers",
      limit: LIVEKIT_BUILD_HARD_LIMITS.sttConcurrentWorkers,
      used: null,
      source: "unavailable",
    },
    {
      label: "TTS concurrency",
      unit: "workers",
      limit: LIVEKIT_BUILD_HARD_LIMITS.ttsConcurrentWorkers,
      used: null,
      source: "unavailable",
    },
    {
      label: "Project API requests",
      unit: "req/min",
      limit: LIVEKIT_BUILD_HARD_LIMITS.apiRequestsPerMinute,
      used: null,
      source: "unavailable",
    },
  ];

  return {
    ok: true,
    error: null,
    configured: true,
    plan: getLiveKitPlanLabel(),
    billingNotes,
    allowances,
    live: {
      activeRooms,
      connectedParticipants,
      fetchedAt: now,
      warning: liveWarning,
      source: liveWarning ? "unavailable" : "live",
    },
    lastUpdated: now,
  };
}
