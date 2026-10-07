import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setVideoPaymentStatus } from "../src/lib/server/video-payments";

/**
 * Focused tests for the Admin video-consultation REFUND WhatsApp notification.
 *
 * Before this, `setVideoPaymentStatus` wrote `payment_status = refunded` and
 * wrote an in-app patient notification, but never called any notification
 * sender — so the approved `appointment_refund` Meta template was unreachable
 * and a refunded guest (no `patient_id`) was never told at all.
 *
 * `setVideoPaymentStatus` is a plain exported function (it lives outside the
 * TanStack server functions so it can be called directly), so these cases drive
 * the real code with only two things stubbed:
 *   - the Supabase service-role client (no live DB)
 *   - `globalThis.fetch` (so no real Meta request is made)
 *
 * Everything under test is real: the real state machine, the real refund DB
 * write, the real in-app notification, the real contact resolution and the real
 * `sendAppointmentNotifications` -> Meta Cloud API path.
 */

const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222";

/** The row `setVideoPaymentStatus` loads from `appointments`. Per-test mutable. */
let apptRow: Record<string, unknown> = {};

/** Every Supabase access the handler makes, so tests can assert on side effects. */
let dbCalls: string[] = [];

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: apptRow, error: null });
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
 * Run `setVideoPaymentStatus` against a stubbed Supabase admin and a captured
 * `fetch`, returning both the result and every HTTP call made.
 */
async function runStatusChange(
  row: Record<string, unknown>,
  status: "payment_verified" | "payment_failed" | "refunded" | "waived",
): Promise<{ result: { error: string | null }; calls: Captured[] }> {
  apptRow = row;
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
    const result = await setVideoPaymentStatus(fakeAdmin, {
      appointmentId: APPOINTMENT_ID,
      status,
    });
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

/** A signed-in patient on a video consultation whose payment is verified. */
function verifiedAppt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: APPOINTMENT_ID,
    patient_id: "patient-1",
    appointment_no: "APT-7K4M92",
    patient_name: "Ali",
    patient_phone: "+923001234567",
    patient_email: null,
    date: "2026-10-20",
    time: "11:30:00",
    status: "confirmed",
    payment_status: "payment_verified",
    payment_amount: 2500,
    services: { name: "Video Consultation" },
    ...overrides,
  };
}

const META_ENV = {
  WHATSAPP_PROVIDER: "meta",
  META_WA_ACCESS_TOKEN: "EAAG_test_token_do_not_log",
  META_WA_PHONE_NUMBER_ID: "111222333",
  META_WA_BUSINESS_ACCOUNT_ID: "444555666",
  META_WA_TEMPLATE_APPOINTMENT_REFUND: "refund_processed_assalamu_alaikum_1",
  META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION: "appointment_confirmed",
  META_WA_TEMPLATE_APPOINTMENT_PAYMENT_VERIFIED: "appointment_payment_verified_notice",
  META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING: "appointment_payment_pending_notice",
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

describe("video payment refund -> appointment_refund WhatsApp", () => {
  // A. The transition succeeds and writes the refund.
  it("A. allows payment_verified -> refunded and writes the refund", async () => {
    const { result } = await runStatusChange(verifiedAppt(), "refunded");

    expect(result.error).toBeNull();
    const update = dbCalls.find((c) => c.startsWith("appointments.update:"));
    expect(update).toBeDefined();
    expect(JSON.parse(String(update).slice("appointments.update:".length))).toMatchObject({
      payment_status: "refunded",
    });
    // Refunding must not rewrite the amount or touch the appointment status.
    expect(update).not.toContain("payment_amount");
    expect(update).not.toContain('"status"');
  });

  // B. The approved template is selected, by the env var's VALUE.
  it("B. selects appointment_refund from META_WA_TEMPLATE_APPOINTMENT_REFUND", async () => {
    const { calls } = await runStatusChange(verifiedAppt(), "refunded");

    const graph = graphCalls(calls);
    expect(graph).toHaveLength(1);
    expect(graphTemplate(calls)).toEqual({
      name: "refund_processed_assalamu_alaikum_1",
      language: "en",
    });
  });

  // C. Exactly the four documented parameters, at arity 4.
  it("C. sends patientName, appointment_no, Rs. payment_amount, Refunded (4)", async () => {
    const { calls } = await runStatusChange(verifiedAppt(), "refunded");

    const params = graphParams(calls);
    expect(params).toEqual(["Ali", "APT-7K4M92", "Rs. 2500", "Refunded"]);
    expect(params).toHaveLength(4);
  });

  // D. Over WhatsApp only — appointments never use the SMS channel here.
  it("D. never sends over SMS", async () => {
    const { calls } = await runStatusChange(verifiedAppt(), "refunded");
    expect(calls.some((c) => c.url.includes("api.twilio.com"))).toBe(false);
  });

  // E. Guest: no patient_id, but a phone captured at booking.
  it("E. still sends WhatsApp for a guest appointment (patient_id null)", async () => {
    const { result, calls } = await runStatusChange(verifiedAppt({ patient_id: null }), "refunded");

    expect(result.error).toBeNull();
    // No in-app row for a guest, but the outbound send still happens.
    expect(dbCalls.some((c) => c.includes("patient_notifications.insert"))).toBe(false);

    expect(graphTemplate(calls).name).toBe("refund_processed_assalamu_alaikum_1");
    expect(graphParams(calls)).toEqual(["Ali", "APT-7K4M92", "Rs. 2500", "Refunded"]);
  });

  // F. No contact on file: the refund still succeeds, nothing goes out.
  it("F. makes no external send when the appointment has no contact details", async () => {
    const { result, calls } = await runStatusChange(
      verifiedAppt({ patient_phone: null, patient_email: null }),
      "refunded",
    );

    expect(result.error).toBeNull();
    expect(dbCalls.some((c) => c.startsWith("appointments.update:"))).toBe(true);
    expect(graphCalls(calls)).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  // G. appointment_no fallback: a legacy row must still send.
  it("G. falls back to the appointment uuid when appointment_no is missing", async () => {
    const { calls } = await runStatusChange(verifiedAppt({ appointment_no: null }), "refunded");

    expect(graphParams(calls)).toEqual(["Ali", APPOINTMENT_ID, "Rs. 2500", "Refunded"]);
    expect(graphParams(calls)).toHaveLength(4);
  });

  // H. A missing amount still yields arity 4 and never a non-string slot.
  it("H. keeps arity 4 with no undefined when payment_amount is null", async () => {
    const { calls } = await runStatusChange(verifiedAppt({ payment_amount: null }), "refunded");

    const params = graphParams(calls);
    expect(params).toEqual(["Ali", "APT-7K4M92", "Rs. 0", "Refunded"]);
    expect(params).toHaveLength(4);
    for (const value of params) {
      expect(typeof value).toBe("string");
      expect(value).not.toBe("undefined");
      expect(value).not.toBe("null");
    }
  });

  // I. The in-app notification for a signed-in patient is unchanged.
  it("I. keeps the existing in-app patient notification intact", async () => {
    const { result } = await runStatusChange(verifiedAppt(), "refunded");

    expect(result.error).toBeNull();
    const insert = dbCalls.find((c) => c.startsWith("patient_notifications.insert:"));
    expect(insert).toBeDefined();
    const payload = JSON.parse(String(insert).slice("patient_notifications.insert:".length));
    expect(payload).toMatchObject({
      user_id: "patient-1",
      type: "payment",
      title: "Payment refunded",
    });
    expect(payload.body).toBe("Your video consultation payment of Rs. 2500 has been refunded.");
  });

  // J. Existing invalid-transition protections are untouched.
  it("J. still rejects payment_submitted -> refunded", async () => {
    const { result, calls } = await runStatusChange(
      verifiedAppt({ payment_status: "payment_submitted" }),
      "refunded",
    );

    expect(result.error).toMatch(/only verified/i);
    expect(dbCalls.some((c) => c.startsWith("appointments.update:"))).toBe(false);
    expect(graphCalls(calls)).toHaveLength(0);
  });

  it("K. still rejects payment_pending -> refunded", async () => {
    const { result, calls } = await runStatusChange(
      verifiedAppt({ payment_status: "payment_pending" }),
      "refunded",
    );

    expect(result.error).toMatch(/only verified/i);
    expect(dbCalls.some((c) => c.startsWith("appointments.update:"))).toBe(false);
    expect(graphCalls(calls)).toHaveLength(0);
  });

  it("L. still refuses a duplicate refund (refunded -> refunded)", async () => {
    const { result, calls } = await runStatusChange(
      verifiedAppt({ payment_status: "refunded" }),
      "refunded",
    );

    expect(result.error).toMatch(/only verified/i);
    expect(dbCalls.some((c) => c.startsWith("appointments.update:"))).toBe(false);
    expect(graphCalls(calls)).toHaveLength(0);
  });

  // K/L/M. The refund template must ONLY ever be selected for a refund.
  it("M. sends appointment_payment_verified, never appointment_refund, for payment_verified", async () => {
    const { result, calls } = await runStatusChange(
      verifiedAppt({ payment_status: "payment_submitted" }),
      "payment_verified",
    );

    expect(result.error).toBeNull();
    // Exactly one Meta call, and it is the verified template — not the refund slot.
    expect(graphCalls(calls)).toHaveLength(1);
    expect(graphTemplate(calls).name).toBe("appointment_payment_verified_notice");
    const params = graphParams(calls);
    expect(params).toEqual([
      "Ali",
      "APT-7K4M92",
      "Rs. 2500",
      "Payment verified",
      "Video Consultation",
    ]);
    expect(params).toHaveLength(5);
  });

  it("N. sends appointment_payment_pending, never appointment_refund, for payment_failed", async () => {
    const { result, calls } = await runStatusChange(
      verifiedAppt({ payment_status: "payment_submitted" }),
      "payment_failed",
    );

    expect(result.error).toBeNull();
    expect(graphCalls(calls)).toHaveLength(1);
    expect(graphTemplate(calls).name).toBe("appointment_payment_pending_notice");
    const params = graphParams(calls);
    expect(params).toEqual(["Ali", "APT-7K4M92", "Rs. 2500", "Payment pending"]);
    expect(params).toHaveLength(4);
  });

  it("O. never selects appointment_refund for waived", async () => {
    const { result, calls } = await runStatusChange(
      verifiedAppt({ payment_status: "payment_pending" }),
      "waived",
    );

    expect(result.error).toBeNull();
    expect(graphCalls(calls)).toHaveLength(0);
  });
});
