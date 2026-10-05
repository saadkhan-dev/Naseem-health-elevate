/**
 * Meta WhatsApp Cloud API â€” outbound sender (server-only).
 *
 * This is the *sending* counterpart to `./meta-webhook.ts`, which only receives.
 * The two share the Graph API version default so there is a single source of
 * truth for it.
 *
 * ## Provider selection
 *
 * Outbound WhatsApp is Twilio by default (unchanged legacy behaviour). Meta is
 * used only when `WHATSAPP_PROVIDER=meta` is set explicitly â€” see
 * `resolveWhatsAppProvider` in `@/lib/notifications`.
 *
 * ## Credentials
 *
 * `META_WA_ACCESS_TOKEN` and `META_WA_PHONE_NUMBER_ID` are read on the server
 * only. Nothing in this module is reachable from the browser bundle: it lives
 * under `src/lib/server/`, is imported only by `src/lib/server/notifications.ts`,
 * and no credential is ever returned, logged or echoed in an error `detail`.
 *
 * ## Template variables (IMPORTANT)
 *
 * Meta requires the body-parameter count to match the approved template
 * *exactly* â€” a mismatch is a hard 131009 rejection, and Twilio's
 * `ContentVariables` object does not carry that constraint. So each template
 * gets its own explicit, **fixed-arity** ordered list built from the booking
 * details (see `metaTemplateParameters`). Optional values become `""` rather
 * than being dropped, because dropping one would shift every later `{{n}}`.
 *
 * These orders are the approved templates' own contracts (documented in
 * `.env.example`), NOT the Twilio `whatsappContentVariables` arrays, which
 * carry extra variables such as the status URL and the video join link that no
 * approved Meta template declares.
 */

import {
  normalizeE164Phone,
  type AppointmentNotificationDetails,
  type MetaWhatsAppTemplateId,
  type NotificationResult,
  type OrderNotificationDetails,
  type RescheduleNotificationDetails,
  type StatusChangeNotificationDetails,
  type VideoReadyNotificationDetails,
} from "@/lib/notifications";
import { metaGraphApiVersion } from "./meta-webhook";

export type { MetaWhatsAppTemplateId } from "@/lib/notifications";

/** Meta's Cloud API host. */
export const META_GRAPH_HOST = "https://graph.facebook.com";

/**
 * Fallback when neither `META_WA_TEMPLATE_LANGUAGE_CODE` nor
 * `META_WA_TEMPLATE_LANGUAGE` is set.
 *
 * Meta's official "Supported Languages" table lists three separate entries:
 *   English      -> `en`
 *   English (UK) -> `en_GB`
 *   English (US) -> `en_US`
 * These templates are shown in WhatsApp Manager as plain **"English"** (no
 * locale suffix), which is `en`. `en_US` would be correct only if the dashboard
 * showed "English (US)". Override with META_WA_TEMPLATE_LANGUAGE_CODE if the
 * dashboard actually shows a locale-qualified language.
 */
export const DEFAULT_META_TEMPLATE_LANGUAGE_CODE = "en";

/**
 * Meta language codes look like `en`, `en_US`, `ur`, `pt_BR`. Anything else is
 * treated as a misconfiguration and falls back to the default rather than
 * being sent to the API (which would reject the whole message).
 */
const META_LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:_[A-Za-z0-9]{2,4})?$/;

/**
 * Server-only Meta outbound configuration. Every field is a plain env-var name
 * so this stays structurally compatible with `NotificationEnv`.
 */
export interface MetaWhatsAppEnv {
  META_WA_ACCESS_TOKEN?: string;
  META_WA_PHONE_NUMBER_ID?: string;
  META_WA_BUSINESS_ACCOUNT_ID?: string;
  META_WA_API_VERSION?: string;
  META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION?: string;
  META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED?: string;
  META_WA_TEMPLATE_APPOINTMENT_CANCELLED?: string;
  META_WA_TEMPLATE_APPOINTMENT_REMINDER?: string;
  META_WA_TEMPLATE_VIDEO_CONSULTATION_READY?: string;
  META_WA_TEMPLATE_PAYMENT_RECEIVED?: string;
  META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING?: string;
  META_WA_TEMPLATE_APPOINTMENT_REFUND?: string;
  META_WA_TEMPLATE_ORDER_CONFIRMATION?: string;
  META_WA_TEMPLATE_ORDER_STATUS_UPDATE?: string;
  META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED?: string;
  META_WA_TEMPLATE_ORDER_PAYMENT_PENDING?: string;
  META_WA_TEMPLATE_ORDER_REFUND?: string;
  /** Alias for META_WA_TEMPLATE_LANGUAGE_CODE (lower precedence). */
  META_WA_TEMPLATE_LANGUAGE?: string;
  /** Canonical: maps to Meta's `template.language.code`. */
  META_WA_TEMPLATE_LANGUAGE_CODE?: string;
}

/** Details for any notification kind that can carry a WhatsApp template. */
export type MetaTemplateDetails =
  | AppointmentNotificationDetails
  | StatusChangeNotificationDetails
  | RescheduleNotificationDetails
  | VideoReadyNotificationDetails
  | OrderNotificationDetails;

/**
 * Extra values only some approved templates need (e.g. `payment_received`
 * carries a payment status alongside the amount).
 */
export interface MetaTemplateExtras {
  /** Human-readable payment status, for `payment_received` and every
   * `*_payment_pending` / `*_refund` status slot. */
  paymentStatus?: string;
  /** Order date, for `order_confirmation`. */
  orderDate?: string;
  /**
   * Refunded amount, for `appointment_refund` / `order_refund`.
   *
   * The clinic records a refund by flipping the payment status only, so the
   * refunded amount is NOT derivable from the appointment/order total and is
   * only sent when the caller states it explicitly. Left out otherwise.
   */
  refundAmount?: string;
}

/**
 * Which env var holds the approved Meta template name for each template.
 *
 * The *value* of that env var is the name sent to Meta (`templateName` below),
 * so approved template names are configuration, not code. The keys on the left
 * are internal identifiers and are deliberately not the Meta names.
 *
 * Currently configured production values (language `en`):
 *
 *   META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION = appointment_confirmed
 *   META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED  = appointment_schedule_changed
 *   META_WA_TEMPLATE_APPOINTMENT_CANCELLED    = appointment_cancelled_notice
 *   META_WA_TEMPLATE_APPOINTMENT_REMINDER     = appointment_reminder_notice_category_utility
 *   META_WA_TEMPLATE_VIDEO_CONSULTATION_READY = video_consultation_ready_notice
 *   META_WA_TEMPLATE_PAYMENT_RECEIVED         = payment_received_notice
 *   META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING = appointment_payment_pending_notice
 *   META_WA_TEMPLATE_APPOINTMENT_REFUND       = refund_processed_assalamu_alaikum_1_…  (long
 *      Meta-generated name; copy it verbatim from WhatsApp Manager — see the note below)
 *   META_WA_TEMPLATE_ORDER_CONFIRMATION       = order_confirmed_notice
 *   META_WA_TEMPLATE_ORDER_STATUS_UPDATE      = order_status_update_notice
 *   META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED  = order_payment_confirmed
 *   META_WA_TEMPLATE_ORDER_PAYMENT_PENDING    = order_payment_pending_notice
 *   META_WA_TEMPLATE_ORDER_REFUND             = order_refund_notice
 *
 * `META_WA_TEMPLATE_APPOINTMENT_REFUND` is a long underscore-separated string
 * that Meta generated from the message body. It is reproduced verbatim in
 * `.env.example` and must never be shortened, sanitized, camel-cased or
 * re-typed: the env value is sent as `templateName` exactly as configured, so
 * any edit makes Meta reject the send.
 */
const META_TEMPLATE_ENV: Record<MetaWhatsAppTemplateId, keyof MetaWhatsAppEnv> = {
  appointment_confirmation: "META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION",
  appointment_rescheduled: "META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED",
  appointment_cancelled: "META_WA_TEMPLATE_APPOINTMENT_CANCELLED",
  appointment_reminder: "META_WA_TEMPLATE_APPOINTMENT_REMINDER",
  video_consultation_room_ready: "META_WA_TEMPLATE_VIDEO_CONSULTATION_READY",
  payment_received: "META_WA_TEMPLATE_PAYMENT_RECEIVED",
  appointment_payment_pending: "META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING",
  appointment_refund: "META_WA_TEMPLATE_APPOINTMENT_REFUND",
  order_confirmation: "META_WA_TEMPLATE_ORDER_CONFIRMATION",
  order_status_update: "META_WA_TEMPLATE_ORDER_STATUS_UPDATE",
  order_payment_confirmed: "META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED",
  order_payment_pending: "META_WA_TEMPLATE_ORDER_PAYMENT_PENDING",
  order_refund: "META_WA_TEMPLATE_ORDER_REFUND",
};

/**
 * How many body variables each approved template declares.
 *
 * Meta rejects a send whose parameter count differs from the approved template
 * (error 131009), so this is asserted in the tests. Note that NO approved
 * template declares a status URL or a video join link.
 */
export const META_TEMPLATE_ARITY: Record<MetaWhatsAppTemplateId, number> = {
  appointment_confirmation: 5,
  appointment_rescheduled: 5,
  appointment_cancelled: 5,
  appointment_reminder: 5,
  video_consultation_room_ready: 4,
  payment_received: 5,
  appointment_payment_pending: 4,
  appointment_refund: 4,
  order_confirmation: 4,
  order_status_update: 3,
  order_payment_confirmed: 4,
  order_payment_pending: 4,
  order_refund: 4,
};

/** The env-var name that holds the approved template name for `template`. */
export function metaTemplateEnvName(template: MetaWhatsAppTemplateId): string {
  return META_TEMPLATE_ENV[template];
}

/**
 * Credentials required before Meta can send anything at all. A specific
 * template name is *not* required here: it is reported per-send by
 * `metaTemplateMissingConfig` so one missing template cannot mark the whole
 * WhatsApp channel as unavailable.
 */
export function metaWhatsAppMissingConfig(env: MetaWhatsAppEnv): string[] {
  const missing: string[] = [];
  if (!env.META_WA_ACCESS_TOKEN?.trim()) missing.push("META_WA_ACCESS_TOKEN");
  if (!env.META_WA_PHONE_NUMBER_ID?.trim()) missing.push("META_WA_PHONE_NUMBER_ID");
  return missing;
}

/**
 * Everything missing for one specific send: the shared credentials plus the
 * approved template name for that notification kind.
 */
export function metaTemplateMissingConfig(
  env: MetaWhatsAppEnv,
  template: MetaWhatsAppTemplateId,
): string[] {
  const missing = metaWhatsAppMissingConfig(env);
  if (!env[META_TEMPLATE_ENV[template]]?.trim()) missing.push(metaTemplateEnvName(template));
  return missing;
}

/**
 * Resolve `template.language.code`.
 *
 * `META_WA_TEMPLATE_LANGUAGE_CODE` wins (it mirrors Meta's own field name),
 * then the `META_WA_TEMPLATE_LANGUAGE` alias, then the safe `en` default.
 * A malformed value is ignored rather than sent, because Meta rejects the whole
 * message on an unknown language code.
 */
export function metaTemplateLanguageCode(env: MetaWhatsAppEnv): string {
  const candidates = [env.META_WA_TEMPLATE_LANGUAGE_CODE, env.META_WA_TEMPLATE_LANGUAGE];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    if (!META_LANGUAGE_CODE_PATTERN.test(value)) {
      // Log the fact, never the value â€” it is operator config, not patient data,
      // but there is no reason to echo it into worker logs.
      console.warn(
        "[whatsapp-meta] ignoring a malformed META_WA_TEMPLATE_LANGUAGE* value; expected a code like 'en' or 'en_US'.",
      );
      continue;
    }
    return value;
  }
  return DEFAULT_META_TEMPLATE_LANGUAGE_CODE;
}

/**
 * The Cloud API send endpoint for a phone number id.
 *
 * `POST /{graph-version}/{phone-number-id}/messages`
 */
export function metaGraphMessagesUrl(version: string, phoneNumberId: string): string {
  return `${META_GRAPH_HOST}/${version}/${phoneNumberId}/messages`;
}

/**
 * Meta expects the recipient as bare digits (no `+`, no separators), e.g.
 * `"to": "923001234567"`.
 */
export function metaRecipientDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}

/**
 * Ordered body parameters for each APPROVED Meta template, in the exact
 * `{{1}}`, `{{2}}` … order the template body declares.
 *
 * Arity is fixed and MUST equal `META_TEMPLATE_ARITY` — Meta rejects a send
 * whose parameter count differs from the approved template (error 131009).
 *
 * Left column is the internal key, right column the approved Meta template the
 * configured env var holds. The orders are what the Meta bodies declare:
 *
 *   appointment_confirmation        (appointment_confirmed)
 *     1 name  2 date  3 time  4 appointment ID  5 service
 *   appointment_rescheduled         (appointment_schedule_changed)
 *     1 name  2 new date  3 new time  4 appointment ID  5 service
 *   appointment_cancelled           (appointment_cancelled_notice)
 *     1 name  2 date  3 time  4 appointment ID  5 service
 *   appointment_reminder            (appointment_reminder_notice_category_utility)
 *     1 name  2 date  3 time  4 appointment ID  5 service
 *   video_consultation_room_ready   (video_consultation_ready_notice)
 *     1 name  2 date  3 time  4 appointment ID
 *   payment_received                (payment_received_notice)
 *     1 name  2 appointment ID  3 amount  4 payment status  5 service
 *   appointment_payment_pending     (appointment_payment_pending_notice)
 *     1 name  2 appointment ID  3 amount due  4 payment status
 *   appointment_refund              (refund_processed_assalamu_alaikum_1_...)
 *     1 name  2 appointment ID  3 refund amount  4 refund status
 *   order_confirmation              (order_confirmed_notice)
 *     1 name  2 order ID  3 order date  4 total amount
 *   order_status_update             (order_status_update_notice)
 *     1 name  2 order ID  3 order status
 *   order_payment_confirmed         (order_payment_confirmed)
 *     1 name  2 order ID  3 amount paid  4 payment status
 *   order_payment_pending           (order_payment_pending_notice)
 *     1 name  2 order ID  3 amount due  4 payment status
 *   order_refund                    (order_refund_notice)
 *     1 name  2 order ID  3 refund amount  4 refund status
 *
 * The appointment-ID slots (`{{2}}`) and the order-ID slots (`{{2}}`) read
 * different fields of different detail types, so the two families can never be
 * crossed even if a caller mixes them up.
 *
 * Deliberately NOT sent, because no approved template declares them:
 *   - the appointment status URL (`statusUrl`)
 *   - the video join link (`joinUrl`) and the video consultation code (`vcNo`)
 *   - `previousDate` / `previousTime` on a reschedule
 *   - the order URL
 * Sending any of those would be an invented variable and would fail the send,
 * so this mapping is intentionally NOT the Twilio `ContentVariables` array.
 *
 * Every slot goes through `metaBodyValues`, so the count is always exactly
 * `META_TEMPLATE_ARITY` and never contains `undefined`/`null`.
 */
export function metaTemplateParameters(
  template: MetaWhatsAppTemplateId,
  details: MetaTemplateDetails,
  extras: MetaTemplateExtras = {},
): string[] {
  switch (template) {
    case "appointment_confirmation": {
      const d = details as AppointmentNotificationDetails;
      return metaBodyValues([d.patientName, d.date, d.time, d.appointmentId, d.serviceName]);
    }
    case "appointment_reminder": {
      const d = details as AppointmentNotificationDetails;
      return metaBodyValues([d.patientName, d.date, d.time, d.appointmentId, d.serviceName]);
    }
    case "appointment_cancelled": {
      const d = details as StatusChangeNotificationDetails;
      return metaBodyValues([
        d.patientName,
        d.date,
        d.time,
        d.appointmentId,
        d.serviceName ?? "Your appointment",
      ]);
    }
    case "appointment_rescheduled": {
      const d = details as RescheduleNotificationDetails;
      return metaBodyValues([
        d.patientName,
        d.date,
        d.time,
        d.appointmentId,
        d.serviceName ?? "Your appointment",
      ]);
    }
    case "video_consultation_room_ready": {
      // 4 slots only — the approved body has NO join-link variable.
      const d = details as VideoReadyNotificationDetails;
      return metaBodyValues([d.patientName, d.date, d.time, d.appointmentId]);
    }
    case "payment_received": {
      const d = details as AppointmentNotificationDetails;
      return metaBodyValues([
        d.patientName,
        d.appointmentId,
        d.amount != null ? `Rs. ${d.amount}` : "",
        extras.paymentStatus ?? "",
        d.serviceName,
      ]);
    }
    case "appointment_payment_pending": {
      const d = details as AppointmentNotificationDetails;
      // 4 slots: the pending template carries no service variable.
      return metaBodyValues([
        d.patientName,
        d.appointmentId,
        d.amount != null ? `Rs. ${d.amount}` : "",
        extras.paymentStatus ?? "",
      ]);
    }
    case "appointment_refund": {
      const d = details as AppointmentNotificationDetails;
      // Amount is the REFUNDED amount, which the caller must state; it is never
      // substituted with the appointment total.
      return metaBodyValues([
        d.patientName,
        d.appointmentId,
        extras.refundAmount ?? "",
        extras.paymentStatus ?? "",
      ]);
    }
    case "order_confirmation": {
      const d = details as OrderNotificationDetails;
      return metaBodyValues([
        d.patientName,
        d.orderId,
        extras.orderDate ?? "",
        d.total != null ? `Rs. ${d.total}` : "",
      ]);
    }
    case "order_status_update": {
      const d = details as OrderNotificationDetails;
      return metaBodyValues([d.patientName, d.orderId, d.paymentStatusLabel ?? "updated"]);
    }
    case "order_payment_confirmed": {
      const d = details as OrderNotificationDetails;
      return metaBodyValues([
        d.patientName,
        d.orderId,
        d.total != null ? `Rs. ${d.total}` : "",
        extras.paymentStatus ?? d.paymentStatusLabel ?? "",
      ]);
    }
    case "order_payment_pending": {
      const d = details as OrderNotificationDetails;
      return metaBodyValues([
        d.patientName,
        d.orderId,
        d.total != null ? `Rs. ${d.total}` : "",
        extras.paymentStatus ?? d.paymentStatusLabel ?? "",
      ]);
    }
    case "order_refund": {
      const d = details as OrderNotificationDetails;
      return metaBodyValues([
        d.patientName,
        d.orderId,
        extras.refundAmount ?? "",
        extras.paymentStatus ?? d.paymentStatusLabel ?? "",
      ]);
    }
  }
}

/**
 * Force every body slot to a string.
 *
 * The param arrays above cast `details` to the domain shape the template belongs
 * to, so a caller that passes the wrong detail type would otherwise put
 * `undefined` on the wire (Meta rejects a non-string parameter) — this converts
 * any absent value to `""`, keeping the arity exact.
 */
function metaBodyValues(values: Array<string | number | null | undefined>): string[] {
  return values.map((value) => (value == null ? "" : String(value)));
}

/** The exact JSON body POSTed to the Graph API `messages` endpoint. */
export interface MetaTemplateMessagePayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components: Array<{
      type: "body";
      parameters: Array<{ type: "text"; text: string }>;
    }>;
  };
}

/**
 * Build the Cloud API template payload.
 *
 * Exported so the exact wire shape is unit-testable without a network call.
 */
export function buildMetaTemplateMessage(input: {
  to: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
}): MetaTemplateMessagePayload {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: metaRecipientDigits(input.to),
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: [
        {
          type: "body",
          parameters: input.parameters.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}

/**
 * Never leak a credential through an error string. Meta error bodies are echoed
 * (truncated) because they carry the actionable code (e.g. 131009 parameter
 * mismatch, 131047 re-engagement), but the token is not part of that body and
 * the URL we build never contains one.
 */
function safeDetail(prefix: string, raw: string): string {
  return `${prefix}: ${raw.replace(/\s+/g, " ").trim().slice(0, 300)}`;
}

/**
 * Send one approved-template WhatsApp message through the Meta Cloud API.
 *
 * Best-effort by contract: it never throws. Any missing configuration, invalid
 * number or API failure comes back as a `NotificationResult` so the caller's
 * delivery loop â€” and therefore booking, payment and video flows â€” is never
 * broken by WhatsApp.
 *
 * `to` is re-normalized here (rather than trusted) so the sender is safe to call
 * directly; `normalizeE164Phone` is idempotent on an already-E.164 value.
 */
export async function sendMetaWhatsAppNotification(input: {
  env: MetaWhatsAppEnv;
  /** Approved template to fill, or `null` when no approved template applies. */
  template: MetaWhatsAppTemplateId | null;
  details: MetaTemplateDetails;
  /** Extra values some approved templates need (e.g. a payment status). */
  extras?: MetaTemplateExtras;
  /** Raw recipient; normalized to E.164 before sending. */
  to: string;
  /** Dial prefix for numbers written without a country code. */
  defaultCountryCode?: string;
}): Promise<NotificationResult> {
  const channel = "whatsapp" as const;
  const { env, template, details, to } = input;

  try {
    if (!template) {
      return {
        channel,
        status: "not_configured",
        to,
        detail:
          "Not configured. Missing: no Meta template applies to this notification type " +
          "(set the matching META_WA_TEMPLATE_* variable).",
      };
    }

    const missing = metaTemplateMissingConfig(env, template);
    if (missing.length > 0) {
      return {
        channel,
        status: "not_configured",
        to,
        detail: `Not configured. Missing: ${missing.join(", ")}`,
      };
    }

    const e164 = normalizeE164Phone(to, input.defaultCountryCode ?? "+92");
    if (!e164) {
      return {
        channel,
        status: "error",
        to,
        detail:
          "Invalid phone number for whatsapp. Expected a 6-15 digit international number like +92 300 1234567.",
      };
    }

    const version = metaGraphApiVersion(env);
    const phoneNumberId = env.META_WA_PHONE_NUMBER_ID!.trim();
    const url = metaGraphMessagesUrl(version, phoneNumberId);
    const payload = buildMetaTemplateMessage({
      to: e164,
      // The approved Meta template name is configuration: it is whatever the
      // mapped env var holds, not the internal key. Renaming or re-approving a
      // template in Meta Business Manager therefore needs no code change.
      templateName: env[META_TEMPLATE_ENV[template]]!.trim(),
      languageCode: metaTemplateLanguageCode(env),
      parameters: metaTemplateParameters(template, details, input.extras),
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        // The access token is only ever a request header. It is never logged,
        // never placed in the URL, and never returned to the caller.
        Authorization: `Bearer ${env.META_WA_ACCESS_TOKEN!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        channel,
        status: "error",
        to: e164,
        detail: safeDetail(`Meta Graph HTTP ${res.status}`, detail),
      };
    }

    return { channel, status: "sent", to: e164 };
  } catch (e) {
    return {
      channel,
      status: "error",
      to,
      detail: e instanceof Error ? e.message : "Unknown Meta WhatsApp error",
    };
  }
}
