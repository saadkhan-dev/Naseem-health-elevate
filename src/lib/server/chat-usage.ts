import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Server-only helpers for the AI chatbot usage tracker.
 *
 * Every chatbot request is recorded in the `chat_usage` table (Supabase):
 * successful replies, failed API calls, rate-limit hits and blocked spam.
 * The service-role key is used, so this module must never be imported from
 * client components — only from TanStack Start server functions.
 */

export type ChatEventStatus = "success" | "failed" | "rate_limited" | "spam";

export type ChatUserType = "guest" | "user";

export type ChatUsageRange = "today" | "7d" | "30d" | "all";

export interface ChatIdentity {
  /** Verified Supabase user id, or null for guests. */
  userId: string | null;
  /** Client-generated stable id (localStorage) used to identify guests. */
  clientId: string;
  userType: ChatUserType;
}

/** Rate limits per user type (rolling 1h / 24h windows). */
export const CHAT_LIMITS: Record<ChatUserType, { perHour: number; perDay: number }> = {
  guest: { perHour: 10, perDay: 50 },
  user: { perHour: 20, perDay: 100 },
};

export interface ChatMessageCounts {
  hour: number;
  day: number;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function recordChatEvent(input: {
  identity: ChatIdentity;
  status: ChatEventStatus;
  model: string;
  message: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from("chat_usage").insert({
      user_id: input.identity.userId,
      client_id: input.identity.clientId,
      user_type: input.identity.userType,
      status: input.status,
      model: input.model,
      message: input.message.slice(0, 500),
      error: (input.error ?? "").slice(0, 500),
      input_tokens: input.inputTokens ?? 0,
      output_tokens: input.outputTokens ?? 0,
    });
  } catch {
    // Best-effort: never break the chat if usage tracking is unavailable.
  }
}

// ---------------------------------------------------------------------------
// Rate limiting reads
// ---------------------------------------------------------------------------

async function countSince(identity: ChatIdentity, sinceIso: string): Promise<number> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from("chat_usage")
    .select("id", { count: "exact", head: true })
    .in("status", ["success", "failed"])
    .gte("created_at", sinceIso);
  if (identity.userId) {
    query = query.eq("user_id", identity.userId);
  } else {
    query = query.is("user_id", null).eq("client_id", identity.clientId);
  }
  const { count } = await query;
  return count ?? 0;
}

export async function getChatMessageCounts(identity: ChatIdentity): Promise<ChatMessageCounts> {
  try {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [hour, day] = await Promise.all([
      countSince(identity, hourAgo),
      countSince(identity, dayAgo),
    ]);
    return { hour, day };
  } catch {
    // If tracking can't be read, do not block the chat.
    return { hour: 0, day: 0 };
  }
}

// ---------------------------------------------------------------------------
// Admin analytics
// ---------------------------------------------------------------------------

export interface ChatUsageDaily {
  date: string;
  total: number;
  success: number;
  failed: number;
  rateLimited: number;
}

export interface ChatUsageRecentEntry {
  id: string;
  userType: ChatUserType;
  status: ChatEventStatus;
  message: string;
  model: string;
  createdAt: string;
}

export interface ChatUsageStats {
  ok: boolean;
  range: ChatUsageRange;
  /** All-time rows (capped at the fetch limit). */
  total: number;
  today: number;
  last7Days: number;
  last30Days: number;
  uniqueUsers: number;
  successful: number;
  failed: number;
  rateLimited: number;
  /** spam + rate_limited (requests that never reached the AI). */
  blocked: number;
  guestMessages: number;
  loggedInMessages: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  daily: ChatUsageDaily[];
  recent: ChatUsageRecentEntry[];
}

interface UsageRow {
  id: string;
  user_id: string | null;
  client_id: string;
  user_type: string;
  status: string;
  message: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

const CLINIC_TZ = "Asia/Karachi";

function clinicDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function startOfTodayInClinicISO(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-");
  return `${parts[0]}-${parts[1]}-${parts[2]}T00:00:00+05:00`;
}

function rangeStart(range: ChatUsageRange, now: Date): Date | null {
  switch (range) {
    case "today":
      return new Date(startOfTodayInClinicISO());
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "all":
      return null;
  }
}

function emptyStats(range: ChatUsageRange): ChatUsageStats {
  return {
    ok: false,
    range,
    total: 0,
    today: 0,
    last7Days: 0,
    last30Days: 0,
    uniqueUsers: 0,
    successful: 0,
    failed: 0,
    rateLimited: 0,
    blocked: 0,
    guestMessages: 0,
    loggedInMessages: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    daily: [],
    recent: [],
  };
}

export async function getChatUsageStats(range: ChatUsageRange): Promise<ChatUsageStats> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const start = rangeStart(range, now);

  let rowsQuery = admin
    .from("chat_usage")
    .select(
      "id, user_id, client_id, user_type, status, message, model, input_tokens, output_tokens, created_at",
    )
    .order("created_at", { ascending: false });
  if (start) rowsQuery = rowsQuery.gte("created_at", start.toISOString());
  rowsQuery = rowsQuery.limit(5000);

  const [rowsRes, todayRes, last7Res, last30Res] = await Promise.all([
    rowsQuery,
    admin
      .from("chat_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfTodayInClinicISO()),
    admin
      .from("chat_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    admin
      .from("chat_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  if (rowsRes.error) {
    console.error("Chatbot usage stats query failed", rowsRes.error);
    return emptyStats(range);
  }

  const rows = (rowsRes.data ?? []) as UsageRow[];

  let successful = 0;
  let failed = 0;
  let rateLimited = 0;
  let blocked = 0;
  let guestMessages = 0;
  let loggedInMessages = 0;
  let estimatedInputTokens = 0;
  let estimatedOutputTokens = 0;
  const seen = new Set<string>();
  const dailyMap = new Map<string, ChatUsageDaily>();

  for (const r of rows) {
    if (r.status === "success") successful++;
    else if (r.status === "failed") failed++;
    else if (r.status === "rate_limited") rateLimited++;
    if (r.status === "spam" || r.status === "rate_limited") blocked++;
    if (r.user_type === "guest") guestMessages++;
    else loggedInMessages++;
    estimatedInputTokens += r.input_tokens ?? 0;
    estimatedOutputTokens += r.output_tokens ?? 0;
    seen.add(r.user_id ?? `guest:${r.client_id}`);

    const day = clinicDateOf(r.created_at);
    const bucket = dailyMap.get(day) ?? {
      date: day,
      total: 0,
      success: 0,
      failed: 0,
      rateLimited: 0,
    };
    bucket.total++;
    if (r.status === "success") bucket.success++;
    else if (r.status === "failed") bucket.failed++;
    else if (r.status === "rate_limited") bucket.rateLimited++;
    dailyMap.set(day, bucket);
  }

  return {
    ok: true,
    range,
    total: rows.length,
    today: todayRes.count ?? 0,
    last7Days: last7Res.count ?? 0,
    last30Days: last30Res.count ?? 0,
    uniqueUsers: seen.size,
    successful,
    failed,
    rateLimited,
    blocked,
    guestMessages,
    loggedInMessages,
    estimatedInputTokens,
    estimatedOutputTokens,
    daily: [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    recent: rows.slice(0, 25).map((r) => ({
      id: r.id,
      userType: (r.user_type === "user" ? "user" : "guest") as ChatUserType,
      status: r.status as ChatEventStatus,
      message: r.message ?? "",
      model: r.model ?? "",
      createdAt: r.created_at,
    })),
  };
}
