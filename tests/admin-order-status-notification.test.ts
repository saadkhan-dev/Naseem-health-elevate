import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { runWithStartContext } from "@tanstack/start-storage-context";

/**
 * Focused tests for the Admin order status-change WhatsApp notification.
 *
 * Approving an order (`confirmed`) uses the dedicated approved
 * `order_confirmed` template; cancelling/rejecting it uses `order_cancelled`
 * (carrying the admin note as the cancellation reason). Every other status
 * (`shipped`, `delivered`, ...) keeps the approved `order_status_update`
 * template.
 *
 * The server function cannot be called directly (TanStack's `createServerFn`
 * needs a Start context), so each case runs it inside `runWithStartContext` and
 * stubs only two things:
 *   - the service-role Supabase client (`getSupabaseAdmin`) - no live DB
 *   - `globalThis.fetch` - so no real Meta request is made
 *
 * Everything under test is real: the real status update, history insert, status
 * label, contact fallbacks and the real `sendOrderNotifications` -> Meta path.
 */

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

/** The row `adminUpdateOrderStatus` loads from `orders`. Per-test mutable. */
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

const actualSupabaseAdmin = await import("../src/lib/server/supabase-admin");
mock.module("../src/lib/server/supabase-admin", () => ({
  ...actualSupabaseAdmin,
  getSupabaseAdmin: () => ({
    from: (table: string) => makeChain(table),
    auth: {
      getUser: async () => ({ data: { user: { id: "admin-1" } }, error: null }),
    },
  }),
}));

const { adminUpdateOrderStatus } = await import("../src/lib/actions.functions");

/** Every outbound HTTP call captured during a run. */
interface Captured {
  url: string;
  body: string;
}

/**
 * Run the server function with a stubbed Supabase admin and a captured
 * `fetch`, returning both the function result and every HTTP call made.
 */
async function runUpdate(
  row: Record<string, unknown>,
  status: string,
  note = "",
): Promise<{ calls: Captured[]; thrown: string | null }> {
  orderRow = row;
  dbCalls = [];
  const calls: Captured[] = [];
  let thrown: string | null = null;

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : input.url,
      body: String(init?.body ?? ""),
    });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    // The server function returns `{ error }` for the unchanged-status case,
    // which TanStack's `createServerFn` surfaces as a rejection here (no HTTP
    // response envelope exists outside the server runtime). So a non-null
    // `thrown` is the observable form of that documented early return.
    await runWithStartContext(
      {
        getRouter: () => ({}) as never,
        request: new Request("http://localhost/", {
          headers: { authorization: "Bearer test-token" },
        }),
        startOptions: {},
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set(),
        handlerType: "serverFn",
      },
      () =>
        adminUpdateOrderStatus({
          data: { id: String(row.id ?? ORDER_ID), status, note },
        } as never),
    );
    return { calls, thrown: null };
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
    return { calls, thrown };
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

/** A signed-in patient order with a phone on file. */
function signedInOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER_ID,
    patient_id: "patient-1",
    status: "pending",
    name: "Ali",
    order_no: "OD-9",
    total: 2400,
    // What `adminUpdateOrderStatus` reads back for the `order_confirmed` /
    // `order_cancelled` slot 3 (see `orderDateForNotification`).
    created_at: "2026-10-05T10:00:00Z",
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
  META_WA_TEMPLATE_ORDER_STATUS_UPDATE: "order_status_update_notice",
  META_WA_TEMPLATE_ORDER_CONFIRMED: "order_confirmed_app",
  META_WA_TEMPLATE_ORDER_CANCELLED: "order_cancelled_app",
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

describe("adminUpdateOrderStatus -> approved order WhatsApp template", () => {
  // A. Confirmed status with a phone on file.
  it("A. sends order_confirmed_notice with the Confirmed label (4 params)", async () => {
    const { calls } = await runUpdate(signedInOrder(), "confirmed");

    // The existing DB behaviour is untouched.
    expect(dbCalls.some((c) => c.startsWith("orders.update:"))).toBe(true);
    expect(dbCalls.some((c) => c.includes("order_status_history.insert"))).toBe(true);

    // Exactly one Meta request, and it is the dedicated order-approved template,
    // NOT the generic order_status_update template.
    const graph = graphCalls(calls);
    expect(graph).toHaveLength(1);
    expect(graphTemplate(calls)).toEqual({
      name: "order_confirmed_app",
      language: "en",
    });

    // name, order ID, order date (from created_at), total amount.
    const params = graphParams(calls);
    expect(params).toEqual(["Ali", "OD-9", "05 Oct 2026", "Rs. 2400"]);
    expect(params).toHaveLength(4);

    // Orders never use SMS.
    expect(calls.some((c) => c.url.includes("api.twilio.com"))).toBe(false);
  });

  // B. Shipped status with a phone on file.
  it("B. sends slot 3 as Shipped and keeps arity at 3", async () => {
    const { calls } = await runUpdate(signedInOrder({ status: "confirmed" }), "shipped");

    expect(graphCalls(calls)).toHaveLength(1);
    expect(graphTemplate(calls).name).toBe("order_status_update_notice");
    const params = graphParams(calls);
    expect(params[2]).toBe("Shipped");
    expect(params).toHaveLength(3);
    expect(calls.some((c) => c.url.includes("api.twilio.com"))).toBe(false);
  });

  // C. Guest order: no patient_id, but a phone number is on file.
  it("C. still notifies a guest order that has a phone", async () => {
    const { calls } = await runUpdate(
      signedInOrder({ patient_id: null, status: "pending" }),
      "confirmed",
    );

    // No in-app row for a guest, but the outbound send still happens.
    expect(dbCalls.some((c) => c.includes("patient_notifications.insert"))).toBe(false);

    expect(graphCalls(calls)).toHaveLength(1);
    expect(graphTemplate(calls).name).toBe("order_confirmed_app");
    expect(graphParams(calls)).toEqual(["Ali", "OD-9", "05 Oct 2026", "Rs. 2400"]);
  });

  // D. No email and no phone on the order: nothing is sent and nothing throws.
  it("D. makes no Meta request when the order has no contact details", async () => {
    const { calls } = await runUpdate(
      signedInOrder({
        email: null,
        phone: null,
        payment_payer_phone: null,
        payment_payer_email: null,
      }),
      "confirmed",
    );

    // The status change itself still happened.
    expect(dbCalls.some((c) => c.startsWith("orders.update:"))).toBe(true);
    expect(dbCalls.some((c) => c.includes("order_status_history.insert"))).toBe(true);

    // No outbound attempt at all - not a failed one either.
    expect(graphCalls(calls)).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  // E. Same status: the pre-existing early return means zero outbound calls.
  it("E. returns early with zero Meta requests when the status is unchanged", async () => {
    const { thrown, calls } = await runUpdate(signedInOrder({ status: "confirmed" }), "confirmed");

    // The pre-existing early return, unchanged: no status write, no history
    // row, and nothing leaves the building.
    expect(thrown).toBe("Order is already confirmed.");
    expect(dbCalls.some((c) => c.startsWith("orders.update:"))).toBe(false);
    expect(dbCalls.some((c) => c.includes("order_status_history.insert"))).toBe(false);
    expect(calls).toHaveLength(0);
  });

  // Contact fallbacks match the working order-payment path.
  it("falls back to the payment-proposer contact when the order has none", async () => {
    const { calls } = await runUpdate(
      signedInOrder({
        email: null,
        phone: null,
        payment_payer_phone: "+923009999999",
        payment_payer_email: null,
      }),
      "confirmed",
    );

    expect(graphCalls(calls)).toHaveLength(1);
    expect(graphParams(calls)).toEqual(["Ali", "OD-9", "05 Oct 2026", "Rs. 2400"]);
  });

  // `order.order_no ?? order.id` guard: a row missing order_no must still send.
  it("falls back to the order id when order_no is missing", async () => {
    const { calls } = await runUpdate(
      signedInOrder({ order_no: null, status: "pending" }),
      "confirmed",
    );

    expect(graphParams(calls)).toEqual(["Ali", ORDER_ID, "05 Oct 2026", "Rs. 2400"]);
    expect(graphParams(calls)).toHaveLength(4);
  });

  // Cancelling uses the dedicated `order_cancelled` template, slot 4 being the
  // admin note (falling back to a neutral phrase when the note is blank).
  it("cancelled -> order_cancelled with the admin note as the cancellation reason", async () => {
    const { calls } = await runUpdate(
      signedInOrder({ status: "pending" }),
      "cancelled",
      "Not enough stock",
    );

    expect(graphCalls(calls)).toHaveLength(1);
    expect(graphTemplate(calls)).toEqual({
      name: "order_cancelled_app",
      language: "en",
    });
    const params = graphParams(calls);
    expect(params).toEqual(["Ali", "OD-9", "05 Oct 2026", "Not enough stock"]);
    expect(params).toHaveLength(4);
  });

  it("cancelled with no note falls back to a neutral cancellation reason", async () => {
    const { calls } = await runUpdate(signedInOrder({ status: "pending" }), "cancelled");

    expect(graphTemplate(calls).name).toBe("order_cancelled_app");
    expect(graphParams(calls)).toEqual(["Ali", "OD-9", "05 Oct 2026", "Order cancelled"]);
  });
});
