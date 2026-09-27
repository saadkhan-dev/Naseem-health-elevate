import { defineHandler, getQuery, setResponseHeader, setResponseStatus } from "nitro/h3";
import {
  META_WHATSAPP_WEBHOOK_PATH,
  getMetaWebhookEnv,
  metaWebhookMissingConfig,
  resolveMetaVerificationChallenge,
} from "@/lib/server/meta-webhook";

/**
 * Meta WhatsApp Cloud API — webhook verification (GET).
 *
 * Meta calls this once when you save the Callback URL in Developers → Webhooks.
 * It sends `hub.mode`, `hub.verify_token` and `hub.challenge`; we echo
 * `hub.challenge` back as plain text **only** when the verify token matches.
 *
 * Must stay a plain `text/plain` body — Meta compares the response verbatim.
 */
export default defineHandler((event) => {
  const env = getMetaWebhookEnv();
  const query = getQuery(event) as Record<string, string | undefined>;

  const challenge = resolveMetaVerificationChallenge(
    {
      mode: query["hub.mode"],
      verifyToken: query["hub.verify_token"],
      challenge: query["hub.challenge"],
    },
    env.META_WA_VERIFY_TOKEN,
  );

  if (challenge !== null) {
    setResponseStatus(event, 200);
    setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
    return challenge;
  }

  // Never leak why the handshake failed, and never echo a challenge we did not
  // verify. Log which side is unconfigured for the operator only.
  const missing = metaWebhookMissingConfig(env);
  if (missing.includes("META_WA_VERIFY_TOKEN")) {
    console.error(
      "[meta-webhook] verification rejected: META_WA_VERIFY_TOKEN is not configured on the server.",
    );
  } else {
    console.error(
      "[meta-webhook] verification rejected: mode or verify token did not match. Callback path:",
      META_WHATSAPP_WEBHOOK_PATH,
    );
  }

  setResponseStatus(event, 403);
  return "Verification failed";
});
