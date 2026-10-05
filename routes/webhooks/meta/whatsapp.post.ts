import { defineHandler, getRequestHeader, readRawBody, setResponseStatus } from "nitro/h3";
import {
  META_SIGNATURE_HEADER,
  getMetaWebhookEnv,
  maskDiagnosticText,
  markMetaEventSeen,
  metaWebhookMissingConfig,
  parseMetaWebhookPayload,
  verifyMetaSignature,
} from "@/lib/server/meta-webhook";

/**
 * Meta WhatsApp Cloud API — webhook events (POST).
 *
 * Receive-only, by design. This handler:
 *   1. reads the **raw** body (the HMAC must cover the exact bytes),
 *   2. verifies `X-Hub-Signature-256` against the Meta App Secret,
 *   3. parses the payload defensively,
 *   4. drops repeats of an already-seen event id,
 *   5. answers 200 so Meta stops retrying.
 *
 * It does **not** send WhatsApp messages, call the Graph API, create templates,
 * or change patient notification preferences. Counts only — never message
 * bodies, phone numbers or any other patient data — are logged.
 */
export default defineHandler(async (event) => {
  const env = getMetaWebhookEnv();

  // Fail closed: without an App Secret we cannot prove the sender is Meta.
  const missing = metaWebhookMissingConfig(env);
  if (missing.length > 0) {
    console.error("[meta-webhook] event rejected: missing server config:", missing.join(", "));
    setResponseStatus(event, 503);
    return { ok: false, error: "webhook_not_configured" };
  }

  const rawBody = await readRawBody(event, "utf8");
  if (!rawBody) {
    setResponseStatus(event, 400);
    return { ok: false, error: "empty_body" };
  }

  const signature = getRequestHeader(event, META_SIGNATURE_HEADER);
  const authentic = await verifyMetaSignature({
    rawBody,
    signatureHeader: signature,
    appSecret: env.META_WA_APP_SECRET,
  });

  if (!authentic) {
    // 401 (not 200) so Meta's own delivery log shows a rejection. Do not echo
    // the expected signature back.
    console.error("[meta-webhook] event rejected: signature verification failed.");
    setResponseStatus(event, 401);
    return { ok: false, error: "invalid_signature" };
  }

  const payload = parseMetaWebhookPayload(rawBody);
  if (!payload.ok) {
    // Authenticated but unparseable: acknowledge so Meta does not retry-loop.
    console.error("[meta-webhook] authenticated event could not be parsed.");
    setResponseStatus(event, 200);
    return { ok: false, error: "unparseable_payload" };
  }

  const fresh = payload.messages.filter((m) => markMetaEventSeen(m.id));

  // Diagnostic only: log each delivery status on its own line so a real booking
  // can be followed from "accepted" (with its messageId) to sent/delivered/failed.
  // Safe fields only: Meta's message id, its status, its timestamp, a masked
  // recipient and Meta's own error code/title. Never the full phone number,
  // never message text, never template parameters, never patient data.
  for (const status of payload.statuses) {
    const parts = [
      `[WhatsApp Meta Webhook] status=${status.status ?? "unknown"}`,
      `messageId=${status.id ?? "missing"}`,
    ];

    if (status.recipient) parts.push(`recipient=${status.recipient}`);

    if (status.timestamp) parts.push(`timestamp=${status.timestamp}`);

    if (status.errorCode) parts.push(`errorCode=${status.errorCode}`);

    if (status.errorTitle) parts.push(`errorTitle=${maskDiagnosticText(status.errorTitle)}`);

    console.log(parts.join(" "));
  }

  console.log(
    "[meta-webhook] event received",
    JSON.stringify({
      object: payload.object,
      fields: payload.fields,
      messages: payload.messages.length,
      duplicates: payload.messages.length - fresh.length,
      statuses: payload.statuses.length,
      errors: payload.errorCount,
    }),
  );

  setResponseStatus(event, 200);
  return {
    ok: true,
    received: payload.messages.length,
    statuses: payload.statuses.length,
    duplicates: payload.messages.length - fresh.length,
  };
});
