import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setOrderPaymentStatus } from "../src/lib/server/order-payments";

/**
 * Focused tests for the Admin order-payment REFUND path.
 *
 * `setOrderPaymentStatus` is a plain exported function (it lives outside the
 * TanStack server functions so it can be called directly), so these cases drive
 * the real code with only two things stubbed:
 *   - the Supabase service-role client (no live DB)
 *   - `globalThis.fetch` (so no real Meta request is made)
 *
 * Everything under test is real: the real state machine, the real refund DB
 * write, the real contact fallbacks and the real `sendOrderNotifications` ->
 * Meta Cloud API path.
 */

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

/** The row `setOrderPaymentStatus` loads from `orders`. Per-test mutable. */
let orderRow: Record<string, unknown> = {};

/** Every Supabase access the handler makes, so tests can assert on side effects. */
let dbCalls: string[] = [];

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: orderRow, error: null });
  chain.single = async () => ({ data: { role: "admin" }, error: null });
  chain.insert = (payload: Record<string, unknown>) => {
    dbCalls.push(`${table}.insert:${JSON.stringify(payload)}`);
    return Promise.resolve({ data: null, error: null });
  };
  chain.update = (payload: Record<string, unknown>) => {
    dbCalls.push(`${table}.update:${JSON.stringify(payload)}`);
    return { eq: () => Promise.resolve({ data: null, error: null }) };
  };
  return chain;
}

const fakeAdmin = {
  from: (table: string) => makeChain(table),
  auth: { getUser: async () => ({ data: { user: { id: "admin-1" } }, error: null }) },
} as unknown as SupabaseClient;

interface Captured {
  url: string;
  body: string;
}

/**
 * Run `setOrderPaymentStatus` against a stubbed Supabase admin and a captured
 * `fetch`, returning both the result and every HTTP call made.
 */
async function runStatusChange(
  row: Record<string, unknown>,
  status: "payment_verified" | "payment_failed" | "refunded" | "waived",
): Promise<{ result: { error: string | null }; calls: Captured[] }> {
  orderRow = row;
  dbCalls = [];
  const calls: Captured[] = [];

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : input.url,
      body: String(init?.body ?? ""),
    });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await setOrderPaymentStatus(fakeAdmin, { orderId: ORDER_ID, status });
    return { result, calls };
  } finally {
    globalThis.fetch = origFetch;
  }
}

/** The Graph messages calls only. */
function graphCalls(calls: Captured[]): Captured[] {
  return calls.filter((c) => c.url.includes("graph.facebook.com"));
}

/** Body parameters of the single Graph call. */
function graphParams(calls: Captured[]): string[] {
  const call = graphCalls(calls)[0];
  if (!call) throw new Error("no graph.facebook.com call was made");
  return JSON.parse(call.body).template.components[0].parameters.map(
    (p: { text: string }) => p.text,
  );
}

/** Template name + language actually sent to Meta. */
function graphTemplate(calls: Captured[]): { name: string; language: string } {
  const call = graphCalls(calls)[0];
  if (!call) throw new Error("no graph.facebook.com call was made");
  const t = JSON.parse(call.body).template;
  return { name: t.name, language: t.language.code };
}

/** A signed-in patient order whose payment is already verified. */
function verifiedOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER_ID,
    patient_id: "patient-1",
    status: "confirmed",
    name: "Ali",
    order_no: "OD-9",
    payment_status: "payment_verified",
    payment_amount: 2400,
    email: null,
    phone: "+923001234567",
    payment_payer_phone: null,
    payment_payer_email: null,
    ...overrides,
  };
}

const META_ENV = {
  WHATSAPP_PROVIDER: "meta",
  META_WA_ACCESS_TOKEN: "EAAG_test_token_do_not_log",
  META_WA_PHONE_NUMBER_ID: "111222333",
  META_WA_BUSINESS_ACCOUNT_ID: "444555666",
  META_WA_TEMPLATE_ORDER_REFUND: "order_refund_notice",
  META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED: "order_payment_confirmed",
} as const;

const SAVED_ENV = new Map<string, string | undefined>();

beforeEach(() => {
  for (const [key, value] of Object.entries(META_ENV)) {
    SAVED_ENV.set(key, process.env[key]);
    process.env[key] = value;
  }
});

afterAll(() => {
  for (const [key, value] of SAVED_ENV) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("order payment refund -> order_refund WhatsApp", () => {
  // A. The state transition the admin UI now offers actually succeeds.
  it("A. allows payment_verified -> refunded and writes the refund", async () => {
    const { result } = await runStatusChange(verifiedOrder(), "refunded");

    expect(result.error).toBeNull();
    const update = dbCalls.find((c) => c.startsWith("orders.update:"));
    expect(update).toBeDefined();
    expect(JSON.parse(String(update).slice("orders.update:".length))).toMatchObject({
      payment_status: "refunded",
    });
    // Refunding must not rewrite the amount or confirm/cancel the order.
    expect(update).not.toContain("payment_amount");
    expect(update).not.toContain('"status"');
  });

  // B. The invalid transition the old UI offered stays rejected, and stays quiet.
  it("B. still rejects payment_submitted -> refunded with no DB write and no send", async () => {
    const { result, calls } = await runStatusChange(
      verifiedOrder({ payment_status: "payment_submitted", payment_verified_at: null }),
      "refunded",
    );

    expect(result.error).toBe("Only verified (genuinely paid) payments can be refunded.");
    expect(dbCalls.some((c) => c.startsWith("orders.update:"))).toBe(false);
    expect(graphCalls(calls)).toHaveLength(0);
  });

  // C. The refund notification selects the approved `order_refund` template.
  it("C. selects order_refund_notice with exactly the four Meta parameters", async () => {
    const { calls } = await runStatusChange(verifiedOrder(), "refunded");

    const graph = graphCalls(calls);
    expect(graph).toHaveLength(1);
    expect(graphTemplate(calls)).toEqual({ name: "order_refund_notice", language: "en" });

    // patient name, order ID, full refund amount, refunded status label.
    const params = graphParams(calls);
    expect(params).toEqual(["Ali", "OD-9", "Rs. 2400", "Payment refunded"]);
    expect(params).toHaveLength(4);
  });

  // D. Orders never use SMS, whatever the template.
  it("D. still sends over WhatsApp only, never SMS", async () => {
    const { calls } = await runStatusChange(verifiedOrder(), "refunded");
    expect(calls.some((c) => c.url.includes("api.twilio.com"))).toBe(false);
  });

  // E. Guest order: no patient_id, and the phone comes from the payment proof.
  it("E. falls back to the payment-payer phone for a guest order", async () => {
    const { result, calls } = await runStatusChange(
      verifiedOrder({
        patient_id: null,
        phone: null,
        payment_payer_phone: "+923009999999",
      }),
      "refunded",
    );

    expect(result.error).toBeNull();
    // No in-app row for a guest, but the outbound send still happens.
    expect(dbCalls.some((c) => c.includes("patient_notifications.insert"))).toBe(false);

    expect(graphTemplate(calls).name).toBe("order_refund_notice");
    expect(graphParams(calls)).toEqual(["Ali", "OD-9", "Rs. 2400", "Payment refunded"]);
  });

  // F. A verified order keeps its `order_payment_confirmed` behaviour.
  it("F. keeps order_payment_confirmed for payment_verified unchanged", async () => {
    const { result, calls } = await runStatusChange(
      verifiedOrder({
        payment_status: "payment_submitted",
        payment_verified_at: null,
        status: "pending",
      }),
      "payment_verified",
    );

    expect(result.error).toBeNull();
    expect(graphTemplate(calls)).toEqual({ name: "order_payment_confirmed", language: "en" });
    expect(graphParams(calls)).toEqual([
      "Ali",
      "OD-9",
      "Rs. 2400",
      "Payment verified — order confirmed",
    ]);
    expect(graphParams(calls)).toHaveLength(4);
  });

  // G. Existing same-status / invalid-transition protections are untouched.
  it("G. still rejects the same-status and other invalid transitions", async () => {
    const alreadyRefunded = await runStatusChange(
      verifiedOrder({ payment_status: "refunded" }),
      "refunded",
    );
    expect(alreadyRefunded.result.error).toBe(
      "Only verified (genuinely paid) payments can be refunded.",
    );
    expect(alreadyRefunded.calls).toHaveLength(0);

    const notSubmitted = await runStatusChange(
      verifiedOrder({ payment_status: "payment_pending" }),
      "payment_verified",
    );
    expect(notSubmitted.result.error).toBe(
      "Payment can only be verified after it has been submitted.",
    );

    const notSubmittedFail = await runStatusChange(
      verifiedOrder({ payment_status: "payment_verified" }),
      "payment_failed",
    );
    expect(notSubmittedFail.result.error).toBe(
      "Payment can only be marked as failed after it has been submitted.",
    );

    const notWaivable = await runStatusChange(
      verifiedOrder({ payment_status: "refunded" }),
      "waived",
    );
    expect(notWaivable.result.error).toBe(
      "Payment can only be waived when it is pending or has been submitted.",
    );
  });

  // H. Missing amount still yields exact arity (empty slot, never `undefined`).
  it("H. keeps arity at 4 when payment_amount is not recorded", async () => {
    const { calls } = await runStatusChange(verifiedOrder({ payment_amount: null }), "refunded");

    const params = graphParams(calls);
    expect(params).toEqual(["Ali", "OD-9", "", "Payment refunded"]);
    expect(params).toHaveLength(4);
  });

  // I. order_no fallback: a row without an order_no still sends.
  it("I. falls back to the order id when order_no is missing", async () => {
    const { calls } = await runStatusChange(verifiedOrder({ order_no: null }), "refunded");
    expect(graphParams(calls)).toEqual(["Ali", ORDER_ID, "Rs. 2400", "Payment refunded"]);
  });

  // J. No contact on file: the refund still succeeds, nothing goes out.
  it("J. makes no Meta request when the order has no contact details", async () => {
    const { result, calls } = await runStatusChange(
      verifiedOrder({
        email: null,
        phone: null,
        payment_payer_phone: null,
        payment_payer_email: null,
      }),
      "refunded",
    );

    expect(result.error).toBeNull();
    expect(dbCalls.some((c) => c.startsWith("orders.update:"))).toBe(true);
    expect(graphCalls(calls)).toHaveLength(0);
  });
});
