import { describe, expect, it, beforeEach } from "bun:test";
import {
  DEFAULT_META_GRAPH_API_VERSION,
  constantTimeEqual,
  getMetaWebhookEnv,
  maskDiagnosticText,
  maskRecipient,
  markMetaEventSeen,
  metaGraphApiVersion,
  metaWebhookMissingConfig,
  parseMetaWebhookPayload,
  resetMetaSeenCache,
  resolveMetaVerificationChallenge,
  verifyMetaSignature,
  type MetaWebhookEnv,
} from "../src/lib/server/meta-webhook";

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";

const FULL_ENV: MetaWebhookEnv = {
  META_WA_VERIFY_TOKEN: VERIFY_TOKEN,
  META_WA_APP_SECRET: APP_SECRET,
  META_WA_ACCESS_TOKEN: "EAAG_test_token",
  META_WA_PHONE_NUMBER_ID: "111222333",
  META_WA_BUSINESS_ACCOUNT_ID: "444555666",
  META_WA_API_VERSION: undefined,
};

/** Mirrors the strict `BufferSource` copy in src/lib/server/meta-webhook.ts. */
function utf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const out = new Uint8Array(encoded.byteLength);
  out.set(encoded);
  return out;
}

async function sign(body: string, secret = APP_SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, utf8(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

const MESSAGE_EVENT = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "0",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "923152968384", phone_number_id: "111222333" },
            messages: [
              {
                from: "923001234567",
                id: "wamid.HBgLMTU1N2U",
                timestamp: "1730000000",
                type: "text",
              },
            ],
          },
        },
      ],
    },
  ],
});

beforeEach(() => {
  resetMetaSeenCache();
  delete process.env.META_WA_VERIFY_TOKEN;
  delete process.env.META_WA_APP_SECRET;
  delete process.env.META_WA_API_VERSION;
});

describe("Meta webhook configuration", () => {
  it("reports no missing config when the two required secrets are set", () => {
    expect(metaWebhookMissingConfig(FULL_ENV)).toEqual([]);
  });

  it("flags the app secret as required (it keys the signature HMAC)", () => {
    const missing = metaWebhookMissingConfig({ ...FULL_ENV, META_WA_APP_SECRET: undefined });
    expect(missing).toContain("META_WA_APP_SECRET");
  });

  it("flags the verify token when absent", () => {
    const missing = metaWebhookMissingConfig({ ...FULL_ENV, META_WA_VERIFY_TOKEN: undefined });
    expect(missing).toContain("META_WA_VERIFY_TOKEN");
  });

  it("defaults the Graph API version and honours an override", () => {
    expect(metaGraphApiVersion(FULL_ENV)).toBe(DEFAULT_META_GRAPH_API_VERSION);
    expect(metaGraphApiVersion({ ...FULL_ENV, META_WA_API_VERSION: "v24.0" })).toBe("v24.0");
  });

  it("reads the verify token from server env (never a VITE_ var)", () => {
    process.env.META_WA_VERIFY_TOKEN = "from-process-env";
    expect(getMetaWebhookEnv().META_WA_VERIFY_TOKEN).toBe("from-process-env");
  });
});

describe("constantTimeEqual", () => {
  it("matches identical strings", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects different content and different lengths", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeEqual("abc", "abcdef")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });
});

describe("Meta GET verification handshake", () => {
  it("echoes the challenge when mode and verify token both match", () => {
    const challenge = resolveMetaVerificationChallenge(
      { mode: "subscribe", verifyToken: VERIFY_TOKEN, challenge: "1158201444" },
      VERIFY_TOKEN,
    );
    expect(challenge).toBe("1158201444");
  });

  it("refuses a wrong verify token", () => {
    expect(
      resolveMetaVerificationChallenge(
        { mode: "subscribe", verifyToken: "wrong", challenge: "1158201444" },
        VERIFY_TOKEN,
      ),
    ).toBeNull();
  });

  it("refuses a mode other than subscribe", () => {
    expect(
      resolveMetaVerificationChallenge(
        { mode: "unsubscribe", verifyToken: VERIFY_TOKEN, challenge: "1158201444" },
        VERIFY_TOKEN,
      ),
    ).toBeNull();
  });

  it("refuses when our own verify token is not configured (no accidental echo)", () => {
    expect(
      resolveMetaVerificationChallenge(
        { mode: "subscribe", verifyToken: VERIFY_TOKEN, challenge: "1158201444" },
        undefined,
      ),
    ).toBeNull();
  });

  it("refuses when the challenge is missing", () => {
    expect(
      resolveMetaVerificationChallenge(
        { mode: "subscribe", verifyToken: VERIFY_TOKEN, challenge: undefined },
        VERIFY_TOKEN,
      ),
    ).toBeNull();
  });
});

describe("Meta X-Hub-Signature-256 verification", () => {
  it("accepts a signature produced with the app secret", async () => {
    const body = JSON.stringify({ hello: "world" });
    const header = await sign(body);
    expect(
      await verifyMetaSignature({ rawBody: body, signatureHeader: header, appSecret: APP_SECRET }),
    ).toBe(true);
  });

  it("accepts an upper-case hex signature", async () => {
    const body = JSON.stringify({ hello: "world" });
    const header = (await sign(body)).toUpperCase();
    expect(
      await verifyMetaSignature({ rawBody: body, signatureHeader: header, appSecret: APP_SECRET }),
    ).toBe(true);
  });

  it("rejects a body that was tampered with after signing", async () => {
    const header = await sign(MESSAGE_EVENT);
    expect(
      await verifyMetaSignature({
        rawBody: MESSAGE_EVENT.replace("wamid.HBgLMTU1N2U", "wamid.TAMPERED"),
        signatureHeader: header,
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    const header = await sign(MESSAGE_EVENT, "attacker-secret");
    expect(
      await verifyMetaSignature({
        rawBody: MESSAGE_EVENT,
        signatureHeader: header,
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
  });

  it("fails closed when the app secret is not configured", async () => {
    const header = await sign(MESSAGE_EVENT);
    expect(
      await verifyMetaSignature({
        rawBody: MESSAGE_EVENT,
        signatureHeader: header,
        appSecret: undefined,
      }),
    ).toBe(false);
  });

  it("fails closed on a missing or malformed header", async () => {
    expect(
      await verifyMetaSignature({
        rawBody: MESSAGE_EVENT,
        signatureHeader: undefined,
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
    expect(
      await verifyMetaSignature({
        rawBody: MESSAGE_EVENT,
        signatureHeader: "sha1=abc",
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
    expect(
      await verifyMetaSignature({
        rawBody: MESSAGE_EVENT,
        signatureHeader: "sha256=not-hex",
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
  });
});

describe("Meta webhook payload parsing", () => {
  it("flattens an inbound message and normalizes the sender to E.164", () => {
    const parsed = parseMetaWebhookPayload(MESSAGE_EVENT);
    expect(parsed.ok).toBe(true);
    expect(parsed.object).toBe("whatsapp_business_account");
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].id).toBe("wamid.HBgLMTU1N2U");
    expect(parsed.messages[0].rawFrom).toBe("923001234567");
    expect(parsed.messages[0].from).toBe("+923001234567");
    expect(parsed.messages[0].type).toBe("text");
    expect(parsed.messages[0].phoneNumberId).toBe("111222333");
    expect(parsed.fields).toEqual(["messages"]);
  });

  it("parses delivery statuses", () => {
    const parsed = parseMetaWebhookPayload(
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "0",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  statuses: [{ id: "wamid.OUT1", status: "delivered" }],
                },
              },
            ],
          },
        ],
      }),
    );
    expect(parsed.statuses).toEqual([
      {
        id: "wamid.OUT1",
        status: "delivered",
        recipient: null,
        timestamp: null,
        errorCode: null,
        errorTitle: null,
      },
    ]);
  });

  it("masks recipients so no full phone number can reach a log", () => {
    expect(maskRecipient("923001234567")).toBe("***67 (len 12)");
    expect(maskRecipient("+92 300 1234567")).toBe("***67 (len 12)");
    expect(maskRecipient("")).toBe("unknown");
    expect(maskRecipient("ab")).toBe("unknown");
  });

  it("clamps and flattens Meta-supplied text before it is logged", () => {
    expect(maskDiagnosticText("a\n\nb   c")).toBe("a b c");
    expect(maskDiagnosticText("x".repeat(500))).toHaveLength(300);
  });

  it("extracts a failed status's error code and masks the recipient", () => {
    const parsed = parseMetaWebhookPayload(
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "0",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  statuses: [
                    {
                      id: "wamid.OUT2",
                      status: "failed",
                      timestamp: "1730000000",
                      recipient_id: "923001234567",
                      errors: [{ code: 131009, title: "Message   not\n delivered" }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );

    expect(parsed.statuses).toEqual([
      {
        id: "wamid.OUT2",
        status: "failed",
        // Masked: never the full number.
        recipient: "***67 (len 12)",
        timestamp: "1730000000",
        errorCode: "131009",
        // Whitespace collapsed so a Meta string cannot span log lines.
        errorTitle: "Message not delivered",
      },
    ]);
  });

  it("counts Meta-reported errors without throwing", () => {
    const parsed = parseMetaWebhookPayload(
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "0",
            changes: [
              { field: "messages", value: { errors: [{ code: 131009, title: "Parameter" }] } },
            ],
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.errorCount).toBe(1);
    expect(parsed.messages).toHaveLength(0);
  });

  it("returns ok:false for malformed JSON instead of throwing", () => {
    const parsed = parseMetaWebhookPayload("{not json");
    expect(parsed.ok).toBe(false);
    expect(parsed.messages).toHaveLength(0);
  });

  it("returns ok:false for a JSON body of the wrong shape", () => {
    expect(parseMetaWebhookPayload("[1,2,3]").ok).toBe(false);
    expect(parseMetaWebhookPayload("42").ok).toBe(false);
  });

  it("tolerates an entry with no changes", () => {
    const parsed = parseMetaWebhookPayload(
      JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "0" }] }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.messages).toHaveLength(0);
  });

  it("coerces a numeric sender instead of discarding the whole batch", () => {
    const parsed = parseMetaWebhookPayload(
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "0",
            changes: [
              {
                field: "messages",
                value: { messages: [{ from: 923001234567, id: "wamid.BAD" }] },
              },
            ],
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].rawFrom).toBe("923001234567");
    expect(parsed.messages[0].from).toBe("+923001234567");
  });

  it("keeps the message but nulls the sender when `from` is unusable", () => {
    const parsed = parseMetaWebhookPayload(
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "0",
            changes: [
              {
                field: "messages",
                value: { messages: [{ from: { nope: true }, id: "wamid.ODD" }] },
              },
            ],
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].rawFrom).toBeNull();
    expect(parsed.messages[0].from).toBeNull();
  });
});

describe("Meta webhook idempotency guard", () => {
  it("accepts an event id once and rejects repeats", () => {
    expect(markMetaEventSeen("wamid.ABC")).toBe(true);
    expect(markMetaEventSeen("wamid.ABC")).toBe(false);
    expect(markMetaEventSeen("wamid.XYZ")).toBe(true);
  });

  it("never drops an event that carries no id", () => {
    expect(markMetaEventSeen(null)).toBe(true);
    expect(markMetaEventSeen(null)).toBe(true);
  });
});
