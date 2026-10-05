import { z } from "zod";
import { normalizeE164Phone } from "@/lib/notifications";

/**
 * Meta WhatsApp Cloud API — webhook core.
 *
 * Server-only. This module holds the pure, testable parts of the webhook so the
 * Nitro route handlers stay thin and every security decision is unit-testable:
 *
 *  - reading the Meta config from server env (never `VITE_*`, never shipped to
 *    the browser),
 *  - the GET verification handshake (`hub.mode` / `hub.verify_token` /
 *    `hub.challenge`),
 *  - POST authenticity via Meta's `x-hub-signature-256` (HMAC-SHA256 over the
 *    exact raw request body, keyed with the Meta **App Secret**),
 *  - defensive parsing of the nested webhook payload.
 *
 * Scope note: this layer only *receives*. It deliberately does not send
 * WhatsApp messages, does not call the Graph API, does not create message
 * templates and does not touch patient notification preferences. Those are
 * separate follow-up steps.
 */

/** Callback path Meta should call. Exported so the routes and docs stay in sync. */
export const META_WHATSAPP_WEBHOOK_PATH = "/webhooks/meta/whatsapp";

/** Used only when META_WA_API_VERSION is not set. */
export const DEFAULT_META_GRAPH_API_VERSION = "v23.0";

/** Meta's signature header. */
export const META_SIGNATURE_HEADER = "x-hub-signature-256";

/**
 * Mask a recipient for logging: keeps only the last 2 digits and a length hint,
 * e.g. `923300123456` -> `***56 (len 12)`.
 *
 * A full number never reaches a log line. Deliberately lossy: correlation is by
 * Meta's `messageId`, not by phone number.
 */
export function maskRecipient(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "unknown";
  return `***${digits.slice(-2)} (len ${digits.length})`;
}

/**
 * Collapse whitespace and clamp length so a Meta-supplied error string can never
 * smuggle a multi-line blob (or anything patient-shaped) into the logs.
 */
export function maskDiagnosticText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

export interface MetaWebhookEnv {
  /** Our own random string; Meta echoes it during subscription verification. */
  META_WA_VERIFY_TOKEN: string | undefined;
  /** Meta App Secret — keys the `x-hub-signature-256` HMAC. NOT the access token. */
  META_WA_APP_SECRET: string | undefined;
  /** Graph API bearer token. Reserved for the outbound step; unused here. */
  META_WA_ACCESS_TOKEN: string | undefined;
  META_WA_PHONE_NUMBER_ID: string | undefined;
  META_WA_BUSINESS_ACCOUNT_ID: string | undefined;
  META_WA_API_VERSION: string | undefined;
}

/** Read a server env var from process.env (Node) or import.meta.env (Vite/Workers). */
function readEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[name];
    if (value) return value;
  }
  try {
    const viteEnv = import.meta.env as Record<string, string | undefined>;
    return viteEnv[name];
  } catch {
    return undefined;
  }
}

/** All Meta WhatsApp webhook env vars currently set on the server. */
export function getMetaWebhookEnv(): MetaWebhookEnv {
  return {
    META_WA_VERIFY_TOKEN: readEnv("META_WA_VERIFY_TOKEN"),
    META_WA_APP_SECRET: readEnv("META_WA_APP_SECRET"),
    META_WA_ACCESS_TOKEN: readEnv("META_WA_ACCESS_TOKEN"),
    META_WA_PHONE_NUMBER_ID: readEnv("META_WA_PHONE_NUMBER_ID"),
    META_WA_BUSINESS_ACCOUNT_ID: readEnv("META_WA_BUSINESS_ACCOUNT_ID"),
    META_WA_API_VERSION: readEnv("META_WA_API_VERSION"),
  };
}

/**
 * Which required pieces are missing. `appSecret` gates the POST signature
 * check — without it we cannot prove a payload came from Meta, so the route
 * fails closed rather than trusting it.
 */
export function metaWebhookMissingConfig(env: MetaWebhookEnv): string[] {
  const missing: string[] = [];
  if (!env.META_WA_VERIFY_TOKEN) missing.push("META_WA_VERIFY_TOKEN");
  if (!env.META_WA_APP_SECRET) missing.push("META_WA_APP_SECRET");
  return missing;
}

/**
 * Graph API version to call, honouring the override.
 *
 * Takes only the version field so the outbound sender
 * (`./whatsapp-meta.ts`) reuses this exact default instead of repeating it.
 */
export function metaGraphApiVersion(env: { META_WA_API_VERSION?: string }): string {
  return env.META_WA_API_VERSION?.trim() || DEFAULT_META_GRAPH_API_VERSION;
}

/**
 * Length-independent, content-constant-time string compare. Avoids leaking the
 * verify token or signature through response timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  // Compare fixed-length digests of both sides so the loop length never reveals
  // the secret's length.
  const lenA = a.length;
  const lenB = b.length;
  let diff = lenA ^ lenB;
  const max = Math.max(lenA, lenB);
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export interface MetaVerificationParams {
  mode: string | undefined;
  verifyToken: string | undefined;
  challenge: string | undefined;
}

/**
 * Meta's GET subscription handshake.
 *
 * Returns the `hub.challenge` value to echo back **only** when `hub.mode` is
 * `subscribe` and `hub.verify_token` matches our token exactly. Returns `null`
 * for anything else, including a missing/blank token on our side — an
 * unconfigured webhook must never echo a challenge.
 */
export function resolveMetaVerificationChallenge(
  params: MetaVerificationParams,
  expectedToken: string | undefined,
): string | null {
  if (params.mode !== "subscribe") return null;
  if (!expectedToken) return null;
  if (!params.verifyToken) return null;
  if (!params.challenge) return null;
  if (!constantTimeEqual(params.verifyToken, expectedToken)) return null;
  return params.challenge;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) out += HEX[view[i]];
  return out;
}

/**
 * UTF-8 bytes as a `Uint8Array<ArrayBuffer>`, which is what WebCrypto's strict
 * `BufferSource` requires. `TextEncoder.encode()` is typed against the wider
 * `ArrayBufferLike`, so copy into a plain `ArrayBuffer`-backed view.
 */
function fromUtf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const out = new Uint8Array(encoded.byteLength);
  out.set(encoded);
  return out;
}

async function sha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    fromUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, fromUtf8(payload)));
}

/**
 * Verify Meta's `X-Hub-Signature-256` (`sha256=<hex>`) against the exact raw
 * body bytes. Uses WebCrypto so it works on both the Worker runtime and Node.
 *
 * Fails closed: a missing secret, a missing/malformed header, or a non-`sha256`
 * algorithm is a rejection, never a pass.
 */
export async function verifyMetaSignature(params: {
  rawBody: string;
  signatureHeader: string | undefined;
  appSecret: string | undefined;
}): Promise<boolean> {
  if (!params.appSecret) return false;
  if (!params.signatureHeader) return false;
  const header = params.signatureHeader.trim();
  if (!header.toLowerCase().startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = await sha256Hex(params.appSecret, params.rawBody);
  return constantTimeEqual(expected, provided);
}

/* -------------------------------------------------------------------------- */
/* Payload parsing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately permissive on `id`/`from`: Meta sends strings, but one odd
 * message must not make us discard an otherwise valid batch. The values are
 * never trusted — the E.164 normalizer and the runtime type check below decide
 * what is usable, and anything unusable simply becomes `null`.
 */
const metaMessageSchema = z
  .object({
    id: z.unknown().optional(),
    from: z.unknown().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
  })
  .passthrough();

const metaValueSchema = z
  .object({
    messaging_product: z.string().optional(),
    metadata: z
      .object({
        display_phone_number: z.string().optional(),
        phone_number_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    messages: z.array(metaMessageSchema).optional(),
    statuses: z
      .array(
        z
          .object({
            id: z.string().optional(),
            status: z.string().optional(),
            timestamp: z.union([z.string(), z.number()]).optional(),
            recipient_id: z.string().optional(),
            errors: z
              .array(
                z
                  .object({
                    code: z.union([z.string(), z.number()]).optional(),
                    title: z.string().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    errors: z.array(z.unknown()).optional(),
  })
  .passthrough();

const metaChangeSchema = z
  .object({
    field: z.string().optional(),
    value: metaValueSchema.optional(),
  })
  .passthrough();

const metaEntrySchema = z
  .object({
    id: z.string().optional(),
    changes: z.array(metaChangeSchema).optional(),
  })
  .passthrough();

const metaWebhookBodySchema = z
  .object({
    object: z.string().optional(),
    entry: z.array(metaEntrySchema).optional(),
  })
  .passthrough();

/** One flattened WhatsApp message taken off a webhook change. */
export interface MetaInboundMessage {
  /** Meta's own message id (`wamid…`) — the natural idempotency key. */
  id: string | null;
  /** Sender in E.164, via the clinic's existing normalizer. */
  from: string | null;
  /** Raw sender exactly as Meta sent it. */
  rawFrom: string | null;
  timestamp: string | null;
  type: string | null;
  /** Phone number id the message arrived on, when present. */
  phoneNumberId: string | null;
}

export interface MetaDeliveryStatus {
  id: string | null;
  status: string | null;
  /** Recipient, already masked. Never the full number — see `maskRecipient`. */
  recipient: string | null;
  timestamp: string | null;
  /** Meta's error code, only present on a `failed` status. */
  errorCode: string | null;
  /** Meta's error title, only present on a `failed` status. Already truncated. */
  errorTitle: string | null;
}

export interface MetaParsedWebhook {
  /** True when the body matched the expected shape. */
  ok: boolean;
  object: string | null;
  messages: MetaInboundMessage[];
  statuses: MetaDeliveryStatus[];
  /** Fields we saw but do not act on yet (e.g. `messages` interactivity). */
  fields: string[];
  errorCount: number;
}

/**
 * Defensively flatten Meta's deeply nested `entry[].changes[].value` payload.
 *
 * Never throws — an unexpected shape yields `ok: false` so the route can still
 * answer 200 and let Meta stop retrying, instead of turning a malformed event
 * into a retry storm.
 */
export function parseMetaWebhookPayload(raw: unknown): MetaParsedWebhook {
  const empty: MetaParsedWebhook = {
    ok: false,
    object: null,
    messages: [],
    statuses: [],
    fields: [],
    errorCount: 0,
  };

  let json: unknown = raw;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      return empty;
    }
  }

  const parsed = metaWebhookBodySchema.safeParse(json);
  if (!parsed.success) return empty;

  const messages: MetaInboundMessage[] = [];
  const statuses: MetaDeliveryStatus[] = [];
  const fields = new Set<string>();
  let errorCount = 0;

  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field) fields.add(change.field);
      const value = change.value;
      if (!value) continue;
      if (Array.isArray(value.errors) && value.errors.length > 0) errorCount += value.errors.length;

      for (const message of value.messages ?? []) {
        const rawFrom =
          typeof message.from === "string" || typeof message.from === "number"
            ? String(message.from)
            : null;
        messages.push({
          id:
            typeof message.id === "string" || typeof message.id === "number"
              ? String(message.id)
              : null,
          from: rawFrom ? normalizeE164Phone(rawFrom) : null,
          rawFrom,
          timestamp: message.timestamp === undefined ? null : String(message.timestamp),
          type: message.type ?? null,
          phoneNumberId: value.metadata?.phone_number_id ?? null,
        });
      }

      for (const status of value.statuses ?? []) {
        // First error wins; Meta puts the actionable code there on a `failed`.
        const firstError = status.errors?.[0];
        statuses.push({
          id: status.id ?? null,
          status: status.status ?? null,
          recipient: status.recipient_id ? maskRecipient(status.recipient_id) : null,
          timestamp: status.timestamp === undefined ? null : String(status.timestamp),
          errorCode:
            firstError?.code === undefined || firstError.code === null
              ? null
              : String(firstError.code),
          errorTitle: firstError?.title ? maskDiagnosticText(firstError.title) : null,
        });
      }
    }
  }

  return {
    ok: true,
    object: parsed.data.object ?? null,
    messages,
    statuses,
    fields: Array.from(fields),
    errorCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Idempotency                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Bounded TTL set of already-seen event ids, so a Meta retry does not process
 * the same event twice inside one Worker instance.
 *
 * Deliberately in-memory and dependency-free: Cloudflare isolates are
 * ephemeral, so this is a best-effort guard, not a durable guarantee. When the
 * receive-side work lands it should claim events in a Supabase table (unique
 * index on the Meta message id) the way `src/lib/server/reminders.ts` claims
 * reminder rows. That is a follow-up, not part of this receive-only step.
 */
const SEEN_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEEN_MAX = 5000;

const seen = new Map<string, number>();

/** Test hook — clears the dedup cache. */
export function resetMetaSeenCache(): void {
  seen.clear();
}

/** True the first time an id is offered; false for repeats (or when unusable). */
export function markMetaEventSeen(id: string | null): boolean {
  if (!id) return true; // nothing to dedup on — do not silently drop the event
  const now = Date.now();
  const at = seen.get(id);
  if (at !== undefined && now - at < SEEN_TTL_MS) return false;

  if (seen.size >= SEEN_MAX) {
    for (const [key, when] of seen) {
      if (now - when >= SEEN_TTL_MS) seen.delete(key);
    }
    // Still full after pruning: evict oldest so the cache stays bounded.
    while (seen.size >= SEEN_MAX) {
      const oldest = seen.keys().next();
      if (oldest.done) break;
      seen.delete(oldest.value);
    }
  }

  seen.set(id, now);
  return true;
}
