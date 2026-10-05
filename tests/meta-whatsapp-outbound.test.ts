import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_META_TEMPLATE_LANGUAGE_CODE,
  META_GRAPH_HOST,
  META_TEMPLATE_ARITY,
  buildMetaTemplateMessage,
  metaGraphMessagesUrl,
  metaRecipientDigits,
  metaTemplateEnvName,
  metaTemplateLanguageCode,
  metaTemplateMissingConfig,
  metaTemplateParameters,
  metaWhatsAppMissingConfig,
  sendMetaWhatsAppNotification,
  type MetaWhatsAppEnv,
  type MetaWhatsAppTemplateId,
} from "../src/lib/server/whatsapp-meta";
import { getNotificationConfig, resolveWhatsAppProvider } from "../src/lib/notifications";
import {
  sendAppointmentNotifications,
  sendOrderNotifications,
  sendRescheduleNotifications,
  sendStatusChangeNotifications,
  sendSupportReplyNotifications,
  sendVideoReadyNotifications,
} from "../src/lib/server/notifications";

const ACCESS_TOKEN = "EAAG_test_token_do_not_log";
const PHONE_ID = "111222333";

/**
 * The exact approved Meta name for the appointment-refund template.
 *
 * Meta generated this string from the message body, so it is long and must be
 * reproduced character-for-character (never shortened, sanitized or re-typed).
 * The value below is the approved production name and must stay identical to
 * the `META_WA_TEMPLATE_APPOINTMENT_REFUND=` line in `.env.example`.
 */
const REFUND_APPROVED_NAME =
  "refund_processed_assalamu_alaikum_1_your_refund_has_been_processed_successfully_refund_details__appointment_id_2__refund_amount_3__refund_status_4_the_refunded_amount_will_be_returned_according_to_your_payment_providers_processing_time_if_you_have_any_questions_about_your_refund_please_contact_us_thank_you_for_choosing_rahat_homeopathic__physiotherapy_clinic";

/**
 * Meta credentials + every approved template NAME, exactly as they appear in
 * WhatsApp Manager. These values are what is sent on the wire; the internal
 * keys (`appointment_confirmation`, `video_consultation_room_ready`, ...) only
 * select which env var is read.
 */
const FULL_META: MetaWhatsAppEnv = {
  WHATSAPP_PROVIDER: "meta",
  META_WA_ACCESS_TOKEN: ACCESS_TOKEN,
  META_WA_PHONE_NUMBER_ID: PHONE_ID,
  META_WA_BUSINESS_ACCOUNT_ID: "444555666",
  META_WA_API_VERSION: undefined,
  META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION: "appointment_confirmed",
  META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED: "appointment_schedule_changed",
  META_WA_TEMPLATE_APPOINTMENT_CANCELLED: "appointment_cancelled_notice",
  META_WA_TEMPLATE_APPOINTMENT_REMINDER: "appointment_reminder_notice_category_utility",
  META_WA_TEMPLATE_VIDEO_CONSULTATION_READY: "video_consultation_ready_notice",
  META_WA_TEMPLATE_PAYMENT_RECEIVED: "payment_received_notice",
  META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING: "appointment_payment_pending_notice",
  // The long, Meta-generated name, verbatim. See REFUND_APPROVED_NAME above.
  META_WA_TEMPLATE_APPOINTMENT_REFUND: REFUND_APPROVED_NAME,
  META_WA_TEMPLATE_ORDER_CONFIRMATION: "order_confirmed_notice",
  META_WA_TEMPLATE_ORDER_STATUS_UPDATE: "order_status_update_notice",
  META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED: "order_payment_confirmed",
  META_WA_TEMPLATE_ORDER_PAYMENT_PENDING: "order_payment_pending_notice",
  META_WA_TEMPLATE_ORDER_REFUND: "order_refund_notice",
};

/** The thirteen approved Meta template names, as configured in production. */
const ACTIVE_TEMPLATE_NAMES: Record<MetaWhatsAppTemplateId, string> = {
  appointment_confirmation: "appointment_confirmed",
  appointment_rescheduled: "appointment_schedule_changed",
  appointment_cancelled: "appointment_cancelled_notice",
  appointment_reminder: "appointment_reminder_notice_category_utility",
  video_consultation_room_ready: "video_consultation_ready_notice",
  payment_received: "payment_received_notice",
  appointment_payment_pending: "appointment_payment_pending_notice",
  appointment_refund: REFUND_APPROVED_NAME,
  order_confirmation: "order_confirmed_notice",
  order_status_update: "order_status_update_notice",
  order_payment_confirmed: "order_payment_confirmed",
  order_payment_pending: "order_payment_pending_notice",
  order_refund: "order_refund_notice",
};

const ALL_TEMPLATES = Object.keys(META_TEMPLATE_ARITY) as MetaWhatsAppTemplateId[];

/** Slots that read the appointment record, vs slots that read the order record. */
const APPOINTMENT_SLOTS: MetaWhatsAppTemplateId[] = [
  "appointment_confirmation",
  "appointment_rescheduled",
  "appointment_cancelled",
  "appointment_reminder",
  "video_consultation_room_ready",
  "payment_received",
  "appointment_payment_pending",
  "appointment_refund",
];
const ORDER_SLOTS: MetaWhatsAppTemplateId[] = [
  "order_confirmation",
  "order_status_update",
  "order_payment_confirmed",
  "order_payment_pending",
  "order_refund",
];

const ORDER = {
  orderId: "ORD-77",
  patientName: "Bilal",
  total: 2400,
  paymentStatusLabel: "Payment verified",
  orderUrl: "https://clinic.example/appointment-status?tab=order",
  email: "bilal@example.com",
  phone: "+923001234567",
};

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Capture every fetch and reply with the given status/body. */
async function withFetch<T>(
  status: number,
  responseBody: string,
  fn: (calls: Captured[]) => Promise<T>,
): Promise<T> {
  const calls: Captured[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : input.url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ""),
    });
    return new Response(responseBody, { status });
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = origFetch;
  }
}

/** The single Graph messages call from a run, or undefined. */
function graphCall(calls: Captured[]): Captured | undefined {
  return calls.find((c) => c.url.includes("graph.facebook.com"));
}

/** Parse the body parameters out of a captured Graph call. */
function graphParams(calls: Captured[]): string[] {
  const call = graphCall(calls);
  if (!call) throw new Error("no graph.facebook.com call was made");
  return JSON.parse(call.body).template.components[0].parameters.map(
    (p: { text: string }) => p.text,
  );
}

/** The template name + language Meta was actually sent. */
function graphTemplate(calls: Captured[]): { name: string; language: string } {
  const call = graphCall(calls);
  if (!call) throw new Error("no graph.facebook.com call was made");
  const t = JSON.parse(call.body).template;
  return { name: t.name, language: t.language.code };
}

const PATIENT = {
  appointmentId: "APT-1",
  patientName: "Ali",
  serviceName: "Homeopathy",
  date: "2026-09-01",
  time: "19:00",
  statusUrl: "https://clinic.example/appointment-status",
  phone: "+923001234567",
};

// ---------------------------------------------------------------------------
// Approved template registry
// ---------------------------------------------------------------------------

describe("approved Meta template registry", () => {
  it("exposes exactly the thirteen real clinic templates", () => {
    expect(ALL_TEMPLATES.slice().sort()).toEqual(
      [
        "appointment_cancelled",
        "appointment_confirmation",
        "appointment_payment_pending",
        "appointment_refund",
        "appointment_reminder",
        "appointment_rescheduled",
        "order_confirmation",
        "order_payment_confirmed",
        "order_payment_pending",
        "order_refund",
        "order_status_update",
        "payment_received",
        "video_consultation_room_ready",
      ].sort(),
    );
  });

  it("maps every template to its own env var (one per approved template)", () => {
    const names = ALL_TEMPLATES.map(metaTemplateEnvName);
    expect(names.slice().sort()).toEqual(
      [
        "META_WA_TEMPLATE_APPOINTMENT_CANCELLED",
        "META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION",
        "META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING",
        "META_WA_TEMPLATE_APPOINTMENT_REFUND",
        "META_WA_TEMPLATE_APPOINTMENT_REMINDER",
        "META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED",
        "META_WA_TEMPLATE_ORDER_CONFIRMATION",
        "META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED",
        "META_WA_TEMPLATE_ORDER_PAYMENT_PENDING",
        "META_WA_TEMPLATE_ORDER_REFUND",
        "META_WA_TEMPLATE_ORDER_STATUS_UPDATE",
        "META_WA_TEMPLATE_PAYMENT_RECEIVED",
        "META_WA_TEMPLATE_VIDEO_CONSULTATION_READY",
      ].sort(),
    );
    // One env var per template, and never the same var twice.
    expect(new Set(names).size).toBe(names.length);
  });

  it("never exposes Meta's hello_world demo template", () => {
    // No internal key, no env var and no configured value may be hello_world.
    expect(ALL_TEMPLATES).not.toContain("hello_world");
    for (const template of ALL_TEMPLATES) {
      expect(metaTemplateEnvName(template)).not.toContain("HELLO_WORLD");
      expect(ACTIVE_TEMPLATE_NAMES[template]).not.toBe("hello_world");
    }
  });

  it("has no leftover generic STATUS/TEMPLATE_* env vars", () => {
    for (const key of Object.keys(FULL_META)) {
      expect(key).not.toBe("META_WA_TEMPLATE_STATUS");
      expect(key).not.toBe("META_WA_TEMPLATE_APPOINTMENT");
    }
  });

  it("sends the ACTIVE WhatsApp Manager name, not the internal key", async () => {
    // The internal keys are deliberately not the Meta names: each key only
    // selects an env var, and the env var's VALUE is the wire template name.
    // This is what makes a Meta rename a configuration-only change.
    for (const template of ALL_TEMPLATES) {
      const wireName = ACTIVE_TEMPLATE_NAMES[template];
      // The wire name is the env var's VALUE, never the internal key.
      expect(wireName).toBe(FULL_META[metaTemplateEnvName(template)]);
      const details = APPOINTMENT_SLOTS.includes(template) ? PATIENT : ORDER;
      await withFetch(200, "{}", async (calls) => {
        await sendMetaWhatsAppNotification({
          env: FULL_META,
          template,
          details: details as never,
          to: "+923001234567",
        });
        expect(graphTemplate(calls).name).toBe(wireName);
        expect(graphTemplate(calls).language).toBe(DEFAULT_META_TEMPLATE_LANGUAGE_CODE);
      });
    }
  });

  it("never sends the internal key: renaming the env value renames the send", async () => {
    // Strongest form of "internal key != Meta wire name" for EVERY slot. The
    // one coincidence to know about: Meta happens to have named the order
    // payment template `order_payment_confirmed`, identical to the internal key
    // `order_payment_confirmed`. That is a coincidence, not a hardcode — this
    // test proves the name is still read from the environment.
    for (const template of ALL_TEMPLATES) {
      const envVar = metaTemplateEnvName(template);
      const details = APPOINTMENT_SLOTS.includes(template) ? PATIENT : ORDER;
      await withFetch(200, "{}", async (calls) => {
        await sendMetaWhatsAppNotification({
          env: { ...FULL_META, [envVar]: `renamed_${template}` },
          template,
          details: details as never,
          to: "+923001234567",
        });
        expect(graphTemplate(calls).name).toBe(`renamed_${template}`);
      });
    }
  });

  it("uses whatever name the env var holds, verbatim", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendMetaWhatsAppNotification({
        env: {
          ...FULL_META,
          META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION: "some_reapproved_name_v2",
        },
        template: "appointment_confirmation",
        details: PATIENT,
        to: "+923001234567",
      });
      expect(graphTemplate(calls).name).toBe("some_reapproved_name_v2");
    });
  });

  it("forwards the appointment-refund template name exactly as configured", async () => {
    // The real Meta name is unknown locally; what must hold is that whatever is
    // configured reaches the wire unmodified (no trimming of the long
    // generated name beyond surrounding whitespace, no case change).
    await withFetch(200, "{}", async (calls) => {
      await sendMetaWhatsAppNotification({
        env: FULL_META,
        template: "appointment_refund",
        details: PATIENT,
        extras: { refundAmount: "Rs. 1500", paymentStatus: "Refunded" },
        to: "+923001234567",
      });
      expect(graphTemplate(calls).name).toBe(REFUND_APPROVED_NAME);
      expect(graphParams(calls)).toEqual(["Ali", "APT-1", "Rs. 1500", "Refunded"]);
    });
  });

  it("never reports a configured template as missing", () => {
    // All thirteen slots are configured, so nothing should be flagged.
    for (const template of ALL_TEMPLATES) {
      expect(metaTemplateMissingConfig(FULL_META, template).length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// EXACT parameter order / arity per approved template
// ---------------------------------------------------------------------------

describe("exact parameter order for every approved template", () => {
  it("appointment_confirmation: name, date, time, appointment ID, service (5)", () => {
    const params = metaTemplateParameters("appointment_confirmation", PATIENT);
    expect(params).toEqual(["Ali", "2026-09-01", "19:00", "APT-1", "Homeopathy"]);
    expect(params).toHaveLength(5);
  });

  it("appointment_reminder: name, date, time, appointment ID, service (5)", () => {
    const params = metaTemplateParameters("appointment_reminder", PATIENT);
    expect(params).toEqual(["Ali", "2026-09-01", "19:00", "APT-1", "Homeopathy"]);
    expect(params).toHaveLength(5);
  });

  it("appointment_cancelled: name, date, time, appointment ID, service (5)", () => {
    const params = metaTemplateParameters("appointment_cancelled", {
      ...PATIENT,
      newStatus: "cancelled",
    });
    expect(params).toEqual(["Ali", "2026-09-01", "19:00", "APT-1", "Homeopathy"]);
    expect(params).toHaveLength(5);
  });

  it("appointment_rescheduled: name, NEW date, NEW time, appointment ID, service (5)", () => {
    const params = metaTemplateParameters("appointment_rescheduled", {
      appointmentId: "APT-4",
      patientName: "Ayesha",
      serviceName: "Physiotherapy",
      date: "2026-09-05",
      time: "16:00",
      previousDate: "2026-09-04",
      previousTime: "09:00",
      statusUrl: "https://clinic.example/status",
      phone: "+923001234567",
    });
    expect(params).toEqual(["Ayesha", "2026-09-05", "16:00", "APT-4", "Physiotherapy"]);
    expect(params).toHaveLength(5);
    // The previous slot must never leak in — no such variable exists.
    expect(params).not.toContain("2026-09-04");
    expect(params).not.toContain("09:00");
  });

  it("video_consultation_room_ready: name, date, time, appointment ID (4) — NO join link", () => {
    const params = metaTemplateParameters("video_consultation_room_ready", {
      appointmentId: "APT-2",
      patientName: "Sara",
      serviceName: "Video Consultation",
      date: "2026-09-02",
      time: "10:30",
      vcNo: "VC-8F3K21",
      joinUrl: "https://clinic.example/video/VC-8F3K21",
      statusUrl: "https://clinic.example/status",
      phone: "+923001234567",
    });
    expect(params).toEqual(["Sara", "2026-09-02", "10:30", "APT-2"]);
    expect(params).toHaveLength(4);
    // The approved body has no join-link / VC-code variable.
    expect(params).not.toContain("https://clinic.example/video/VC-8F3K21");
    expect(params).not.toContain("VC-8F3K21");
  });

  it("payment_received: name, appointment ID, amount, payment status, service (5)", () => {
    const params = metaTemplateParameters(
      "payment_received",
      { ...PATIENT, isVideo: true, amount: 2500 },
      { paymentStatus: "Payment verified" },
    );
    expect(params).toEqual(["Ali", "APT-1", "Rs. 2500", "Payment verified", "Homeopathy"]);
    expect(params).toHaveLength(5);
  });

  it("order_confirmation: name, order ID, order date, total amount (4)", () => {
    const params = metaTemplateParameters(
      "order_confirmation",
      {
        orderId: "OD-1",
        patientName: "Ali",
        total: 1200,
        orderUrl: "https://clinic.example/order",
        phone: "+923001234567",
      },
      { orderDate: "2026-09-07" },
    );
    expect(params).toEqual(["Ali", "OD-1", "2026-09-07", "Rs. 1200"]);
    expect(params).toHaveLength(4);
    // No order-URL variable is approved.
    expect(params).not.toContain("https://clinic.example/order");
  });

  it("order_status_update: name, order ID, order status (3)", () => {
    const params = metaTemplateParameters("order_status_update", {
      orderId: "OD-2",
      patientName: "Bilal",
      paymentStatusLabel: "Order shipped / on its way",
      orderUrl: "https://clinic.example/order",
      phone: "+923001234567",
    });
    expect(params).toEqual(["Bilal", "OD-2", "Order shipped / on its way"]);
    expect(params).toHaveLength(3);
  });

  it("appointment_payment_pending: name, appointment ID, amount due, status (4)", () => {
    const params = metaTemplateParameters(
      "appointment_payment_pending",
      { ...PATIENT, amount: 2500 },
      { paymentStatus: "Payment pending" },
    );
    expect(params).toEqual(["Ali", "APT-1", "Rs. 2500", "Payment pending"]);
    expect(params).toHaveLength(4);
    // This template declares no service variable.
    expect(params).not.toContain("Homeopathy");
  });

  it("appointment_refund: name, appointment ID, refund amount, refund status (4)", () => {
    const params = metaTemplateParameters(
      "appointment_refund",
      { ...PATIENT, amount: 2500 },
      { refundAmount: "Rs. 2500", paymentStatus: "Refunded" },
    );
    expect(params).toEqual(["Ali", "APT-1", "Rs. 2500", "Refunded"]);
    expect(params).toHaveLength(4);
  });

  it("order_payment_confirmed: name, order ID, amount paid, status (4)", () => {
    const params = metaTemplateParameters("order_payment_confirmed", ORDER, {
      paymentStatus: "Payment verified",
    });
    expect(params).toEqual(["Bilal", "ORD-77", "Rs. 2400", "Payment verified"]);
    expect(params).toHaveLength(4);
  });

  it("order_payment_pending: name, order ID, amount due, status (4)", () => {
    const params = metaTemplateParameters("order_payment_pending", ORDER, {
      paymentStatus: "Payment pending",
    });
    expect(params).toEqual(["Bilal", "ORD-77", "Rs. 2400", "Payment pending"]);
    expect(params).toHaveLength(4);
  });

  it("order_refund: name, order ID, refund amount, refund status (4)", () => {
    const params = metaTemplateParameters("order_refund", ORDER, {
      refundAmount: "Rs. 900",
      paymentStatus: "Refunded",
    });
    expect(params).toEqual(["Bilal", "ORD-77", "Rs. 900", "Refunded"]);
    expect(params).toHaveLength(4);
  });

  it("fills every slot of every template, with no undefined or null", () => {
    // PHASE 4: a missing value must become "" rather than a non-string, and the
    // arity must always match META_TEMPLATE_ARITY exactly.
    for (const template of APPOINTMENT_SLOTS) {
      for (const details of [PATIENT, { ...PATIENT, amount: undefined, serviceName: undefined }]) {
        const params = metaTemplateParameters(template, details as never, {});
        expect(params).toHaveLength(META_TEMPLATE_ARITY[template]);
        for (const value of params) {
          expect(typeof value).toBe("string");
          expect(value).not.toBe("undefined");
          expect(value).not.toBe("null");
        }
      }
    }
    for (const template of ORDER_SLOTS) {
      for (const details of [ORDER, { ...ORDER, total: null, paymentStatusLabel: undefined }]) {
        const params = metaTemplateParameters(template, details as never, {});
        expect(params).toHaveLength(META_TEMPLATE_ARITY[template]);
        for (const value of params) {
          expect(typeof value).toBe("string");
          expect(value).not.toBe("undefined");
          expect(value).not.toBe("null");
        }
      }
    }
  });

  it("never confuses an appointment ID with an order ID in slot 2", () => {
    // Slot {{2}} is the appointment ID for the appointment family and the
    // order ID for the order family. Passing the wrong detail shape must not
    // leak the other identifier.
    for (const template of APPOINTMENT_SLOTS) {
      expect(metaTemplateParameters(template, ORDER as never)[1]).toBe("");
    }
    for (const template of ORDER_SLOTS) {
      expect(metaTemplateParameters(template, PATIENT as never)[1]).toBe("");
    }
  });

  it("never sends a status URL, join link or order URL in any template", () => {
    const cases: Array<[MetaWhatsAppTemplateId, unknown]> = [
      ["appointment_confirmation", PATIENT],
      ["appointment_reminder", PATIENT],
      ["appointment_cancelled", { ...PATIENT, newStatus: "cancelled" }],
      [
        "appointment_rescheduled",
        {
          appointmentId: "APT-4",
          patientName: "Ayesha",
          serviceName: "Physiotherapy",
          date: "D",
          time: "T",
        },
      ],
      [
        "video_consultation_room_ready",
        {
          appointmentId: "APT-2",
          patientName: "Sara",
          serviceName: "Video",
          date: "D",
          time: "T",
          vcNo: "VC-1",
          joinUrl: "https://clinic.example/video/VC-1",
        },
      ],
      ["payment_received", PATIENT],
      [
        "order_confirmation",
        {
          orderId: "OD-1",
          patientName: "Ali",
          total: 10,
          orderUrl: "https://clinic.example/order",
        },
      ],
      [
        "order_status_update",
        {
          orderId: "OD-2",
          patientName: "Bilal",
          paymentStatusLabel: "shipped",
          orderUrl: "https://clinic.example/order",
        },
      ],
    ];

    for (const [template, details] of cases) {
      const params = metaTemplateParameters(template, details as never, {
        paymentStatus: "verified",
        orderDate: "2026-09-07",
      });
      // Every slot is filled with a string, and no link/URL leaks through.
      expect(params.every((p) => typeof p === "string")).toBe(true);
      expect(params.some((p) => p.includes("clinic.example"))).toBe(false);
      expect(params.some((p) => p.includes("VC-1"))).toBe(false);
      expect(params.some((p) => p.includes("http"))).toBe(false);
    }
  });

  it("every template's arity matches its declared variable count", () => {
    const cases: Array<[MetaWhatsAppTemplateId, unknown]> = [
      ["appointment_confirmation", PATIENT],
      ["appointment_reminder", PATIENT],
      ["appointment_cancelled", { ...PATIENT, newStatus: "cancelled" }],
      [
        "appointment_rescheduled",
        { appointmentId: "A", patientName: "B", serviceName: "C", date: "D", time: "T" },
      ],
      [
        "video_consultation_room_ready",
        { appointmentId: "A", patientName: "B", serviceName: "C", date: "D", time: "T" },
      ],
      ["payment_received", PATIENT],
      ["order_confirmation", { orderId: "O", patientName: "P", total: 1 }],
      ["order_status_update", { orderId: "O", patientName: "P", paymentStatusLabel: "s" }],
    ];
    for (const [template, details] of cases) {
      expect(metaTemplateParameters(template, details as never)).toHaveLength(
        META_TEMPLATE_ARITY[template],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Language code
// ---------------------------------------------------------------------------

describe("Meta template language code", () => {
  it("defaults to `en`, which is Meta's code for the label 'English'", () => {
    expect(metaTemplateLanguageCode({})).toBe("en");
    expect(DEFAULT_META_TEMPLATE_LANGUAGE_CODE).toBe("en");
  });

  it("prefers META_WA_TEMPLATE_LANGUAGE_CODE over the alias", () => {
    expect(
      metaTemplateLanguageCode({
        META_WA_TEMPLATE_LANGUAGE_CODE: "en_US",
        META_WA_TEMPLATE_LANGUAGE: "en",
      }),
    ).toBe("en_US");
  });

  it("accepts the META_WA_TEMPLATE_LANGUAGE alias", () => {
    expect(metaTemplateLanguageCode({ META_WA_TEMPLATE_LANGUAGE: "en_GB" })).toBe("en_GB");
  });

  it("ignores a malformed code instead of sending it", () => {
    expect(metaTemplateLanguageCode({ META_WA_TEMPLATE_LANGUAGE_CODE: "not a code!" })).toBe("en");
  });

  it("sends `en` in the payload by default", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendMetaWhatsAppNotification({
        env: FULL_META,
        template: "appointment_confirmation",
        details: PATIENT,
        to: "+923001234567",
      });
      expect(graphTemplate(calls)).toEqual({ name: "appointment_confirmed", language: "en" });
    });
  });
});

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

describe("resolveWhatsAppProvider", () => {
  it("defaults to twilio when unset so production behaviour is unchanged", () => {
    expect(resolveWhatsAppProvider(undefined)).toBe("twilio");
    expect(resolveWhatsAppProvider("")).toBe("twilio");
    expect(resolveWhatsAppProvider("   ")).toBe("twilio");
  });

  it("selects meta only for an explicit 'meta'", () => {
    expect(resolveWhatsAppProvider("meta")).toBe("meta");
    expect(resolveWhatsAppProvider("  META  ")).toBe("meta");
  });

  it("falls back to twilio for any unknown value (fail-safe)", () => {
    expect(resolveWhatsAppProvider("twilio")).toBe("twilio");
    expect(resolveWhatsAppProvider("metaa")).toBe("twilio");
    expect(resolveWhatsAppProvider("bogus")).toBe("twilio");
  });
});

describe("getNotificationConfig with WHATSAPP_PROVIDER", () => {
  it("ignores Twilio creds and uses Meta creds when provider=meta", () => {
    const cfg = getNotificationConfig({ ...FULL_META, TWILIO_WHATSAPP_FROM: undefined });
    expect(cfg.whatsapp.configured).toBe(true);
    expect(cfg.whatsapp.missing).toEqual([]);
  });

  it("reports Meta env vars as missing when Meta creds are absent", () => {
    const cfg = getNotificationConfig({
      WHATSAPP_PROVIDER: "meta",
      TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
      TWILIO_ACCOUNT_SID: "AC1",
      TWILIO_AUTH_TOKEN: "t",
    });
    expect(cfg.whatsapp.configured).toBe(false);
    expect(cfg.whatsapp.missing).toEqual(["META_WA_ACCESS_TOKEN", "META_WA_PHONE_NUMBER_ID"]);
  });

  it("leaves Twilio gating unchanged when the provider is unset", () => {
    const twilio = {
      TWILIO_ACCOUNT_SID: "AC1",
      TWILIO_AUTH_TOKEN: "t",
      TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
    };
    expect(getNotificationConfig(twilio).whatsapp).toEqual(
      getNotificationConfig({ ...twilio, WHATSAPP_PROVIDER: "twilio" }).whatsapp,
    );
  });

  it("never lets the provider setting change SMS or email", () => {
    const base = {
      RESEND_API_KEY: "re",
      NOTIFICATION_FROM_EMAIL: "c@e.com",
      TWILIO_SMS_FROM: "+1",
    };
    expect(getNotificationConfig({ ...base, WHATSAPP_PROVIDER: "meta" }).sms).toEqual(
      getNotificationConfig(base).sms,
    );
    expect(getNotificationConfig({ ...base, WHATSAPP_PROVIDER: "meta" }).email).toEqual(
      getNotificationConfig(base).email,
    );
  });
});

// ---------------------------------------------------------------------------
// Not configured -> safe no-op
// ---------------------------------------------------------------------------

describe("Meta not configured", () => {
  it("is a safe no-op that makes no network call", async () => {
    await withFetch(200, "{}", async (calls) => {
      const result = await sendMetaWhatsAppNotification({
        env: {},
        template: "appointment_confirmation",
        details: PATIENT,
        to: "+923001234567",
      });

      expect(result.status).toBe("not_configured");
      expect(result.channel).toBe("whatsapp");
      expect(result.detail).toContain("META_WA_ACCESS_TOKEN");
      expect(result.detail).toContain("META_WA_PHONE_NUMBER_ID");
      expect(calls).toHaveLength(0);
    });
  });

  it("names the one missing template without disabling the channel", async () => {
    const env = { ...FULL_META, META_WA_TEMPLATE_APPOINTMENT_CANCELLED: undefined };
    expect(metaWhatsAppMissingConfig(env)).toEqual([]);
    expect(metaTemplateMissingConfig(env, "appointment_cancelled")).toEqual([
      "META_WA_TEMPLATE_APPOINTMENT_CANCELLED",
    ]);

    await withFetch(200, "{}", async (calls) => {
      const result = await sendMetaWhatsAppNotification({
        env,
        template: "appointment_cancelled",
        details: { ...PATIENT, newStatus: "cancelled" },
        to: "+923001234567",
      });
      expect(result.status).toBe("not_configured");
      expect(result.detail).toContain("META_WA_TEMPLATE_APPOINTMENT_CANCELLED");
      expect(calls).toHaveLength(0);
    });
  });

  it("reports not_configured when no approved template covers the event", async () => {
    const result = await sendMetaWhatsAppNotification({
      env: FULL_META,
      template: null,
      details: PATIENT,
      to: "+923001234567",
    });
    expect(result.status).toBe("not_configured");
    expect(result.detail).toContain("META_WA_TEMPLATE_");
  });
});

// ---------------------------------------------------------------------------
// Payload + endpoint
// ---------------------------------------------------------------------------

describe("Meta payload and Graph endpoint", () => {
  it("builds the exact Cloud API template payload", () => {
    const payload = buildMetaTemplateMessage({
      to: "+923001234567",
      templateName: "appointment_confirmed",
      languageCode: "en",
      parameters: ["Ali", "2026-09-01", "19:00", "APT-1", "Homeopathy"],
    });

    expect(payload).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "923001234567",
      type: "template",
      template: {
        name: "appointment_confirmed",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Ali" },
              { type: "text", text: "2026-09-01" },
              { type: "text", text: "19:00" },
              { type: "text", text: "APT-1" },
              { type: "text", text: "Homeopathy" },
            ],
          },
        ],
      },
    });
  });

  it("targets the Graph messages endpoint for the phone number id", () => {
    expect(metaGraphMessagesUrl("v23.0", PHONE_ID)).toBe(
      `${META_GRAPH_HOST}/v23.0/111222333/messages`,
    );
  });

  it("POSTs to the v23.0 default endpoint with a JSON template body", async () => {
    await withFetch(200, '{"messages":[{"id":"wamid.X"}]}', async (calls) => {
      const result = await sendMetaWhatsAppNotification({
        env: FULL_META,
        template: "appointment_confirmation",
        details: PATIENT,
        to: "+923001234567",
      });

      expect(result.status).toBe("sent");
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${META_GRAPH_HOST}/v23.0/${PHONE_ID}/messages`);
      expect(calls[0].headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(calls[0].body).type).toBe("template");
    });
  });

  it("honours a version override", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendMetaWhatsAppNotification({
        env: { ...FULL_META, META_WA_API_VERSION: "v24.0" },
        template: "appointment_confirmation",
        details: PATIENT,
        to: "+923001234567",
      });
      expect(calls[0].url).toContain("/v24.0/");
    });
  });

  it("sends the access token as a Bearer header only", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendMetaWhatsAppNotification({
        env: FULL_META,
        template: "appointment_confirmation",
        details: PATIENT,
        to: "+923001234567",
      });

      expect(calls[0].headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(calls[0].url).not.toContain(ACCESS_TOKEN);
      expect(calls[0].body).not.toContain(ACCESS_TOKEN);
    });
  });

  it("never returns the token in a failure detail", async () => {
    await withFetch(401, '{"error":{"message":"Invalid OAuth access token."}}', async () => {
      const result = await sendMetaWhatsAppNotification({
        env: FULL_META,
        template: "appointment_confirmation",
        details: PATIENT,
        to: "+923001234567",
      });
      expect(result.status).toBe("error");
      expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
      expect(result.detail).toContain("401");
    });
  });
});

// ---------------------------------------------------------------------------
// Phone normalization
// ---------------------------------------------------------------------------

describe("Meta phone normalization", () => {
  it("strips the + for Meta and reuses normalizeE164Phone", () => {
    expect(metaRecipientDigits("+923001234567")).toBe("923001234567");
  });

  it("converts a local number to E.164 digits before sending", async () => {
    await withFetch(200, "{}", async (calls) => {
      const result = await sendMetaWhatsAppNotification({
        env: FULL_META,
        template: "appointment_confirmation",
        details: PATIENT,
        to: "0315 296 8384",
      });
      expect(result.status).toBe("sent");
      expect(JSON.parse(calls[0].body).to).toBe("923152968384");
    });
  });

  it("errors instead of sending an unusable number", async () => {
    await withFetch(200, "{}", async (calls) => {
      const result = await sendMetaWhatsAppNotification({
        env: FULL_META,
        template: "appointment_confirmation",
        details: PATIENT,
        to: "abc",
      });
      expect(result.status).toBe("error");
      expect(result.detail).toContain("Invalid phone number");
      expect(calls).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// END-TO-END: notification event -> exact Meta template
// ---------------------------------------------------------------------------

describe("event -> approved Meta template", () => {
  it("booking created -> appointment_confirmation slot / appointment_confirmed wire name", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendAppointmentNotifications(PATIENT, FULL_META);
      expect(graphTemplate(calls)).toEqual({
        name: "appointment_confirmed",
        language: "en",
      });
      expect(graphParams(calls)).toEqual(["Ali", "2026-09-01", "19:00", "APT-1", "Homeopathy"]);
      expect(graphParams(calls)).toHaveLength(5);
    });
  });

  it("status change to cancelled -> appointment_cancelled", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendStatusChangeNotifications({ ...PATIENT, newStatus: "cancelled" }, FULL_META);
      expect(graphTemplate(calls).name).toBe("appointment_cancelled_notice");
      expect(graphParams(calls)).toEqual(["Ali", "2026-09-01", "19:00", "APT-1", "Homeopathy"]);
    });
  });

  it("every other status reports not_configured — no invented template", async () => {
    for (const status of [
      "pending",
      "confirmed",
      "rejected",
      "completed",
      "arrived",
      "no_show",
    ] as const) {
      await withFetch(200, "{}", async (calls) => {
        const results = await sendStatusChangeNotifications(
          { ...PATIENT, newStatus: status },
          FULL_META,
        );
        const whatsapp = results.find((r) => r.channel === "whatsapp")!;
        expect(whatsapp.status).toBe("not_configured");
        expect(whatsapp.detail).toContain("no Meta template applies");
        // Nothing is invented and nothing is sent for an uncovered status.
        expect(calls).toHaveLength(0);
      });
    }
  });

  it("reschedule -> appointment_rescheduled", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendRescheduleNotifications(
        {
          appointmentId: "APT-4",
          patientName: "Ayesha",
          serviceName: "Physiotherapy",
          date: "2026-09-05",
          time: "16:00",
          previousDate: "2026-09-04",
          previousTime: "09:00",
          statusUrl: "https://clinic.example/status",
          phone: "+923001234567",
        },
        FULL_META,
      );
      expect(graphTemplate(calls).name).toBe("appointment_schedule_changed");
      expect(graphParams(calls)).toEqual([
        "Ayesha",
        "2026-09-05",
        "16:00",
        "APT-4",
        "Physiotherapy",
      ]);
    });
  });

  it("reminder overrides to appointment_reminder without touching Twilio", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendAppointmentNotifications(PATIENT, FULL_META, {
        metaTemplate: "appointment_reminder",
      });
      expect(graphTemplate(calls).name).toBe("appointment_reminder_notice_category_utility");
      expect(graphParams(calls)).toEqual(["Ali", "2026-09-01", "19:00", "APT-1", "Homeopathy"]);
    });
  });

  it("video ready -> video_consultation_ready_notice with 4 params, no join link", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendVideoReadyNotifications(
        {
          appointmentId: "APT-2",
          patientName: "Sara",
          serviceName: "Video Consultation",
          date: "2026-09-02",
          time: "10:30",
          vcNo: "VC-8F3K21",
          joinUrl: "https://clinic.example/video/VC-8F3K21",
          phone: "+923001234567",
        },
        FULL_META,
      );
      expect(graphTemplate(calls)).toEqual({
        name: "video_consultation_ready_notice",
        language: "en",
      });
      const params = graphParams(calls);
      expect(params).toEqual(["Sara", "2026-09-02", "10:30", "APT-2"]);
      expect(params).toHaveLength(4);
    });
  });

  it("a video REMINDER uses appointment_reminder, not video_consultation_ready_notice", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendVideoReadyNotifications(
        {
          appointmentId: "APT-2",
          patientName: "Sara",
          serviceName: "Video Consultation",
          date: "2026-09-02",
          time: "10:30",
          vcNo: "VC-8F3K21",
          joinUrl: "https://clinic.example/video/VC-8F3K21",
          phone: "+923001234567",
        },
        FULL_META,
        { metaTemplate: "appointment_reminder" },
      );
      expect(graphTemplate(calls).name).toBe("appointment_reminder_notice_category_utility");
      expect(graphParams(calls)).toEqual([
        "Sara",
        "2026-09-02",
        "10:30",
        "APT-2",
        "Video Consultation",
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// Order / support policy unchanged
// ---------------------------------------------------------------------------

describe("order + support stay on SMS + email", () => {
  it("order created never reaches WhatsApp even with the template configured", async () => {
    await withFetch(200, "{}", async (calls) => {
      const results = await sendOrderNotifications(
        {
          orderId: "OD-1",
          patientName: "Ali",
          total: 1200,
          orderUrl: "https://clinic.example/order",
          phone: "+923001234567",
          email: "ali@example.com",
        },
        "created",
        { ...FULL_META, RESEND_API_KEY: "re_test", NOTIFICATION_FROM_EMAIL: "c@e.com" },
      );

      expect(results.map((r) => r.channel)).toEqual(["email", "sms"]);
      expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
    });
  });

  it("order status update never reaches WhatsApp", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendOrderNotifications(
        {
          orderId: "OD-2",
          patientName: "Bilal",
          paymentStatusLabel: "Order shipped",
          phone: "+923001234567",
        },
        "status",
        { ...FULL_META, RESEND_API_KEY: "re_test", NOTIFICATION_FROM_EMAIL: "c@e.com" },
      );
      expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
    });
  });

  it("support replies never reach WhatsApp", async () => {
    await withFetch(200, "{}", async (calls) => {
      const results = await sendSupportReplyNotifications(
        {
          name: "Ali",
          clinicName: "Rahat Clinic",
          reply: "Thanks!",
          originalSubject: "Homeopathy",
          phone: "+923001234567",
          email: "ali@example.com",
        },
        FULL_META,
      );
      expect(results.map((r) => r.channel)).toEqual(["email", "sms"]);
      expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Newly mapped templates
// ---------------------------------------------------------------------------

describe("newly mapped templates", () => {
  it("sends each new template's exact approved name and declared arity", async () => {
    const cases: Array<[MetaWhatsAppTemplateId, string, number]> = [
      ["appointment_payment_pending", "appointment_payment_pending_notice", 4],
      ["appointment_refund", REFUND_APPROVED_NAME, 4],
      ["order_payment_confirmed", "order_payment_confirmed", 4],
      ["order_payment_pending", "order_payment_pending_notice", 4],
      ["order_refund", "order_refund_notice", 4],
    ];
    for (const [template, wireName, arity] of cases) {
      const isOrder = ORDER_SLOTS.includes(template);
      const details = isOrder ? ORDER : { ...PATIENT, amount: 2500 };
      await withFetch(200, "{}", async (calls) => {
        await sendMetaWhatsAppNotification({
          env: FULL_META,
          template,
          details: details as never,
          extras: {
            paymentStatus: isOrder ? "Payment verified" : "Refunded",
            refundAmount: "Rs. 2500",
          },
          to: "+923001234567",
        });
        expect(graphTemplate(calls).name).toBe(wireName);
        expect(graphParams(calls)).toHaveLength(arity);
        expect(graphParams(calls)).toHaveLength(META_TEMPLATE_ARITY[template]);
      });
    }
  });

  it("reports not_configured and sends nothing when a new template is unset", async () => {
    // Fail-safe for any template whose secret is missing or blank: it must
    // report not_configured and make no network call, rather than sending an
    // empty or invented name.
    const env = { ...FULL_META, META_WA_TEMPLATE_APPOINTMENT_REFUND: "" };
    const result = await withFetch(200, "{}", async (calls) => {
      const r = await sendMetaWhatsAppNotification({
        env,
        template: "appointment_refund",
        details: PATIENT,
        to: "+923001234567",
      });
      expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
      return r;
    });
    expect(result.status).toBe("not_configured");
    expect(result.detail).toContain("META_WA_TEMPLATE_APPOINTMENT_REFUND");
  });

  it("keeps the order payment slot on SMS + email only, like every order slot", async () => {
    // `setOrderPaymentStatus` passes metaTemplate=order_payment_confirmed, which
    // must NOT switch orders onto WhatsApp.
    await withFetch(200, "{}", async (calls) => {
      const results = await sendOrderNotifications(
        {
          orderId: "ORD-77",
          patientName: "Bilal",
          total: 2400,
          paymentStatusLabel: "Payment verified",
          phone: "+923001234567",
          email: "bilal@example.com",
        },
        "status",
        { ...FULL_META, RESEND_API_KEY: "re_test", NOTIFICATION_FROM_EMAIL: "c@e.com" },
        { metaTemplate: "order_payment_confirmed" },
      );
      expect(results.map((r) => r.channel)).toEqual(["email", "sms"]);
      expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
    });
  });

  it("does not let a Meta slot override leak into the Twilio ContentSid", async () => {
    // The Twilio fixtures live in the "Twilio remains intact" describe below,
    // where this behaviour is asserted directly against Twilio's own SIDs.
    expect(metaTemplateEnvName("appointment_refund")).toBe("META_WA_TEMPLATE_APPOINTMENT_REFUND");
  });

  it("keeps hello_world out of every notification source file", () => {
    // Requirement: Meta's demo template can never be selected by an event. Only
    // prose may mention it; no quoted string literal may exist.
    for (const file of [
      "src/lib/notifications.ts",
      "src/lib/server/notifications.ts",
      "src/lib/server/whatsapp-meta.ts",
      "src/lib/server/reminders.ts",
      "src/lib/server/meta-webhook.ts",
      "src/lib/server/order-payments.ts",
      "src/lib/server/video-payments.ts",
    ]) {
      const contents = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(contents).not.toContain('"hello_world"');
      expect(contents).not.toContain("'hello_world'");
      expect(contents).not.toContain('metaTemplate: "hello_world"');
    }
  });

  it("configures the exact approved appointment-refund name in .env.example", () => {
    // The long Meta-generated name must appear character-for-character: one
    // shortened, sanitized or re-typed character makes Meta reject the send.
    const contents = readFileSync(resolve(process.cwd(), ".env.example"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(contents).toContain(`META_WA_TEMPLATE_APPOINTMENT_REFUND=${REFUND_APPROVED_NAME}\n`);
    // And nothing else may claim a different refund name for that variable.
    const matches = contents.match(/^META_WA_TEMPLATE_APPOINTMENT_REFUND=(.*)$/gm) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("configures every other new template name in .env.example", () => {
    const contents = readFileSync(resolve(process.cwd(), ".env.example"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const expected: Array<[string, string]> = [
      ["META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING", "appointment_payment_pending_notice"],
      ["META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED", "order_payment_confirmed"],
      ["META_WA_TEMPLATE_ORDER_PAYMENT_PENDING", "order_payment_pending_notice"],
      ["META_WA_TEMPLATE_ORDER_REFUND", "order_refund_notice"],
    ];
    for (const [key, value] of expected) {
      expect(contents).toContain(`${key}=${value}\n`);
    }
  });

  it("leaves the eight already-correct production template names untouched", () => {
    const contents = readFileSync(resolve(process.cwd(), ".env.example"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    for (const [key, value] of [
      ["META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION", "appointment_confirmed"],
      ["META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED", "appointment_schedule_changed"],
      ["META_WA_TEMPLATE_APPOINTMENT_CANCELLED", "appointment_cancelled_notice"],
      ["META_WA_TEMPLATE_APPOINTMENT_REMINDER", "appointment_reminder_notice_category_utility"],
      ["META_WA_TEMPLATE_VIDEO_CONSULTATION_READY", "video_consultation_ready_notice"],
      ["META_WA_TEMPLATE_PAYMENT_RECEIVED", "payment_received_notice"],
      ["META_WA_TEMPLATE_LANGUAGE_CODE", "en"],
    ] as Array<[string, string]>) {
      expect(contents).toContain(`${key}=${value}\n`);
    }
  });
});

// ---------------------------------------------------------------------------
// Failures are contained
// ---------------------------------------------------------------------------

describe("Meta failures are contained", () => {
  it("returns an error result instead of throwing on a Graph rejection", async () => {
    await withFetch(
      400,
      '{"error":{"code":131009,"message":"Parameter count does not match"}}',
      async () => {
        const result = await sendMetaWhatsAppNotification({
          env: FULL_META,
          template: "appointment_confirmation",
          details: PATIENT,
          to: "+923001234567",
        });
        expect(result.status).toBe("error");
        expect(result.detail).toContain("400");
        expect(result.detail).toContain("131009");
      },
    );
  });

  it("returns an error result when fetch itself throws", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    try {
      const result = await sendMetaWhatsAppNotification({
        env: FULL_META,
        template: "appointment_confirmation",
        details: PATIENT,
        to: "+923001234567",
      });
      expect(result.status).toBe("error");
      expect(result.detail).toContain("network down");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("a Meta outage still reports email as sent from the real sender", async () => {
    const calls: Captured[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      calls.push({
        url,
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: String(init?.body ?? ""),
      });
      return url.includes("graph.facebook.com")
        ? new Response("upstream unavailable", { status: 503 })
        : new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const results = await sendAppointmentNotifications(
        { ...PATIENT, email: "ali@example.com" },
        {
          ...FULL_META,
          RESEND_API_KEY: "re_test",
          NOTIFICATION_FROM_EMAIL: "clinic@example.com",
        },
      );

      expect(results.map((r) => r.channel)).toEqual(["email", "whatsapp"]);
      expect(results.find((r) => r.channel === "email")!.status).toBe("sent");
      expect(results.find((r) => r.channel === "whatsapp")!.status).toBe("error");
      expect(calls.some((c) => c.url === "https://api.resend.com/emails")).toBe(true);
      expect(results).toHaveLength(2);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Twilio behaviour untouched
// ---------------------------------------------------------------------------

describe("Twilio remains intact", () => {
  const TWILIO_ENV = {
    RESEND_API_KEY: "re_test",
    NOTIFICATION_FROM_EMAIL: "clinic@example.com",
    TWILIO_ACCOUNT_SID: "ACxxxxxxxx",
    TWILIO_AUTH_TOKEN: "tok",
    TWILIO_SMS_FROM: "+15005550006",
    TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
    // Meta creds + templates present but must be ignored on the Twilio path.
    META_WA_ACCESS_TOKEN: ACCESS_TOKEN,
    META_WA_PHONE_NUMBER_ID: PHONE_ID,
    META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION: "appointment_confirmed",
  };

  it("sends via Twilio when WHATSAPP_PROVIDER=twilio", async () => {
    await withFetch(200, "{}", async (calls) => {
      const results = await sendAppointmentNotifications(
        { ...PATIENT, email: "ali@example.com" },
        { ...TWILIO_ENV, WHATSAPP_PROVIDER: "twilio" },
      );

      expect(results.every((r) => r.status === "sent")).toBe(true);
      const twilio = calls.find((c) => c.url.includes("api.twilio.com"))!;
      expect(twilio.body).toContain("To=whatsapp%3A%2B923001234567");
      expect(twilio.body).toContain("From=whatsapp%3A%2B14155238886");
      expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
    });
  });

  it("behaves identically when WHATSAPP_PROVIDER is unset", async () => {
    const run = (env: Record<string, unknown>) =>
      withFetch(200, "{}", async (calls) => {
        const results = await sendAppointmentNotifications(
          { ...PATIENT, email: "ali@example.com" },
          env as never,
        );
        return { results, calls };
      });

    const unset = await run(TWILIO_ENV);
    const explicit = await run({ ...TWILIO_ENV, WHATSAPP_PROVIDER: "twilio" });
    expect(unset.results).toEqual(explicit.results);
    expect(unset.calls.map((c) => c.url)).toEqual(explicit.calls.map((c) => c.url));
    expect(unset.calls.map((c) => c.body)).toEqual(explicit.calls.map((c) => c.body));
  });

  it("still uses the APPOINTMENT ContentSid, unaffected by the Meta rename", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendAppointmentNotifications(PATIENT, {
        ...TWILIO_ENV,
        TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT: "HXdeadbeef",
      });
      const twilio = calls.find((c) => c.url.includes("api.twilio.com"))!;
      expect(twilio.body).toContain("ContentSid=HXdeadbeef");
      expect(twilio.body).toContain("ContentVariables=");
    });
  });

  it("a reminder still uses the APPOINTMENT ContentSid on Twilio", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendAppointmentNotifications(
        PATIENT,
        {
          ...TWILIO_ENV,
          TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT: "HXappointment",
        },
        { metaTemplate: "appointment_reminder" },
      );
      const twilio = calls.find((c) => c.url.includes("api.twilio.com"))!;
      // The Meta reminder template must NOT change the Twilio ContentSid.
      expect(twilio.body).toContain("ContentSid=HXappointment");
    });
  });

  it("ignores every newly added Meta slot on the Twilio path", async () => {
    // Adding five Meta templates must not add, remove or alter any Twilio
    // ContentSid: Twilio keeps using only its own four SIDs.
    for (const metaTemplate of [
      "appointment_payment_pending",
      "appointment_refund",
      "order_payment_confirmed",
      "order_payment_pending",
      "order_refund",
    ] as MetaWhatsAppTemplateId[]) {
      await withFetch(200, "{}", async (calls) => {
        await sendAppointmentNotifications(
          PATIENT,
          {
            ...TWILIO_ENV,
            TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT: "HXappointment",
          },
          { metaTemplate },
        );
        expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
        const twilio = calls.find((c) => c.url.includes("api.twilio.com"))!;
        expect(twilio.body).toContain("ContentSid=HXappointment");
        expect(twilio.body).not.toContain("order_payment_confirmed");
        expect(twilio.body).not.toContain("appointment_refund");
      });
    }
  });

  it("routes WhatsApp to Meta and leaves SMS/email on their own providers", async () => {
    await withFetch(200, "{}", async (calls) => {
      const results = await sendAppointmentNotifications(
        { ...PATIENT, email: "ali@example.com" },
        {
          ...FULL_META,
          RESEND_API_KEY: "re_test",
          NOTIFICATION_FROM_EMAIL: "clinic@example.com",
        },
      );

      expect(results.map((r) => r.channel)).toEqual(["email", "whatsapp"]);
      expect(calls.some((c) => c.url === "https://api.resend.com/emails")).toBe(true);
      expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(true);
      expect(calls.some((c) => c.url.includes("api.twilio.com"))).toBe(false);
    });
  });

  it("does not send SMS over Meta when the provider is meta", async () => {
    await withFetch(200, "{}", async (calls) => {
      await sendAppointmentNotifications(PATIENT, FULL_META);
      expect(calls.every((c) => c.url.includes("graph.facebook.com"))).toBe(true);
    });
  });
});
