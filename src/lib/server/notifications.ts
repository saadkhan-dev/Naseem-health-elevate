/**
 * Server-only notification senders. Runs inside TanStack Start server
 * functions (see `src/lib/actions.functions.ts`), so it has access to the
 * server environment.
 *
 * Providers are real integrations (no stubs or fake "sent" results):
 *  - email    -> Resend  (POST https://api.resend.com/emails)
 *  - sms      -> Twilio  (POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json)
 *  - whatsapp -> Twilio  (same API, whatsapp:+… destinations) by default, or
 *                Meta Cloud API (POST https://graph.facebook.com/{v}/{id}/messages)
 *                when WHATSAPP_PROVIDER=meta
 *
 * SMS, email and the in-app notification tables are completely unaffected by the
 * WhatsApp provider setting.
 *
 * A channel that has no credentials configured is reported as
 * `status: "not_configured"` with the exact env vars required — it is never
 * silently faked.
 */

import {
  buildAppointmentMessages,
  buildOrderMessages,
  buildRescheduleMessages,
  buildStatusChangeMessages,
  buildSupportReplyMessages,
  buildVideoReadyMessages,
  getNotificationConfig,
  normalizeE164Phone,
  resolveNotificationChannels,
  resolveWhatsAppProvider,
  whatsAppContentVariables,
  type AppointmentNotificationDetails,
  type NotificationChannel,
  type NotificationDeliveryOptions,
  type NotificationEnv,
  type MetaWhatsAppTemplateId,
  type NotificationResult,
  type OrderNotificationDetails,
  type OrderNotificationKind,
  type RescheduleNotificationDetails,
  type StatusChangeNotificationDetails,
  type SupportReplyNotificationDetails,
  type VideoReadyNotificationDetails,
  type WhatsAppTemplateId,
} from "@/lib/notifications";
import { sendMetaWhatsAppNotification, type MetaTemplateDetails } from "./whatsapp-meta";

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

/** All notification-related env vars currently set on the server. */
export function getServerNotificationEnv(): NotificationEnv {
  return {
    RESEND_API_KEY: readEnv("RESEND_API_KEY"),
    NOTIFICATION_FROM_EMAIL: readEnv("NOTIFICATION_FROM_EMAIL"),
    TWILIO_ACCOUNT_SID: readEnv("TWILIO_ACCOUNT_SID"),
    TWILIO_AUTH_TOKEN: readEnv("TWILIO_AUTH_TOKEN"),
    TWILIO_SMS_FROM: readEnv("TWILIO_SMS_FROM"),
    TWILIO_WHATSAPP_FROM: readEnv("TWILIO_WHATSAPP_FROM"),
    TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT: readEnv("TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT"),
    TWILIO_WHATSAPP_CONTENT_SID_STATUS: readEnv("TWILIO_WHATSAPP_CONTENT_SID_STATUS"),
    TWILIO_WHATSAPP_CONTENT_SID_RESCHEDULE: readEnv("TWILIO_WHATSAPP_CONTENT_SID_RESCHEDULE"),
    TWILIO_WHATSAPP_CONTENT_SID_VIDEO: readEnv("TWILIO_WHATSAPP_CONTENT_SID_VIDEO"),
    PHONE_COUNTRY_CODE: readEnv("PHONE_COUNTRY_CODE"),
    // Outbound WhatsApp provider. Absent/blank keeps the historical Twilio path.
    WHATSAPP_PROVIDER: readEnv("WHATSAPP_PROVIDER"),
    // Meta WhatsApp Cloud API (server-only; used only when provider = meta).
    META_WA_ACCESS_TOKEN: readEnv("META_WA_ACCESS_TOKEN"),
    META_WA_PHONE_NUMBER_ID: readEnv("META_WA_PHONE_NUMBER_ID"),
    META_WA_BUSINESS_ACCOUNT_ID: readEnv("META_WA_BUSINESS_ACCOUNT_ID"),
    META_WA_API_VERSION: readEnv("META_WA_API_VERSION"),
    META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION: readEnv("META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION"),
    META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED: readEnv("META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED"),
    META_WA_TEMPLATE_APPOINTMENT_CANCELLED: readEnv("META_WA_TEMPLATE_APPOINTMENT_CANCELLED"),
    META_WA_TEMPLATE_APPOINTMENT_REMINDER: readEnv("META_WA_TEMPLATE_APPOINTMENT_REMINDER"),
    META_WA_TEMPLATE_VIDEO_CONSULTATION_READY: readEnv("META_WA_TEMPLATE_VIDEO_CONSULTATION_READY"),
    META_WA_TEMPLATE_PAYMENT_RECEIVED: readEnv("META_WA_TEMPLATE_PAYMENT_RECEIVED"),
    META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING: readEnv(
      "META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING",
    ),
    // Long Meta-generated name; forwarded to Meta verbatim (see .env.example).
    META_WA_TEMPLATE_APPOINTMENT_REFUND: readEnv("META_WA_TEMPLATE_APPOINTMENT_REFUND"),
    META_WA_TEMPLATE_ORDER_CONFIRMATION: readEnv("META_WA_TEMPLATE_ORDER_CONFIRMATION"),
    META_WA_TEMPLATE_ORDER_STATUS_UPDATE: readEnv("META_WA_TEMPLATE_ORDER_STATUS_UPDATE"),
    META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED: readEnv("META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED"),
    META_WA_TEMPLATE_ORDER_PAYMENT_PENDING: readEnv("META_WA_TEMPLATE_ORDER_PAYMENT_PENDING"),
    META_WA_TEMPLATE_ORDER_REFUND: readEnv("META_WA_TEMPLATE_ORDER_REFUND"),
    META_WA_TEMPLATE_LANGUAGE: readEnv("META_WA_TEMPLATE_LANGUAGE"),
    META_WA_TEMPLATE_LANGUAGE_CODE: readEnv("META_WA_TEMPLATE_LANGUAGE_CODE"),
  };
}

/** Which env var holds the approved content-template SID per message kind. */
const WHATSAPP_CONTENT_SID_ENV: Record<
  WhatsAppTemplateId,
  Exclude<keyof NotificationEnv, "PHONE_COUNTRY_CODE">
> = {
  appointment: "TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT",
  status: "TWILIO_WHATSAPP_CONTENT_SID_STATUS",
  reschedule: "TWILIO_WHATSAPP_CONTENT_SID_RESCHEDULE",
  video: "TWILIO_WHATSAPP_CONTENT_SID_VIDEO",
};

/** Public site URL used to build the status-check link in messages. */
export function getSiteUrl(): string | undefined {
  const url = readEnv("SITE_URL");
  return url ? url.replace(/\/+$/, "") : undefined;
}

function basicAuth(username: string, password: string): string {
  // Global on Node.js >=16 and Cloudflare Workers.
  return btoa(`${username}:${password}`);
}

async function sendResendEmail(
  env: NotificationEnv,
  to: string,
  messages: { emailSubject: string; emailText: string },
): Promise<NotificationResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.NOTIFICATION_FROM_EMAIL,
        to: [to],
        subject: messages.emailSubject,
        text: messages.emailText,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return {
        channel: "email",
        status: "error",
        to,
        detail: `Resend HTTP ${res.status}: ${detail.slice(0, 300)}`,
      };
    }
    return { channel: "email", status: "sent", to };
  } catch (e) {
    return {
      channel: "email",
      status: "error",
      to,
      detail: e instanceof Error ? e.message : "Unknown email error",
    };
  }
}

async function sendTwilioMessage(
  env: NotificationEnv,
  channel: "sms" | "whatsapp",
  to: string,
  body: string,
  content?: { contentSid?: string; contentVariables?: string[] },
): Promise<NotificationResult> {
  try {
    const accountSid = env.TWILIO_ACCOUNT_SID!;
    const from = channel === "whatsapp" ? env.TWILIO_WHATSAPP_FROM! : env.TWILIO_SMS_FROM!;
    const target = channel === "whatsapp" ? `whatsapp:${to}` : to;

    // Twilio accepts both To & From in either E.164 or WhatsApp URI form for
    // SMS/WhatsApp; `to` is always normalized E.164 by the delivery loop.
    const params = new URLSearchParams({ To: target, From: from, Body: body });
    if (channel === "whatsapp" && content?.contentSid) {
      // WhatsApp Business Platform requires an approved content template for
      // out-of-session recipients. Body stays as a fallback; the template text
      // is rendered from ContentVariables keyed {{1}}..{{n}}.
      params.set("ContentSid", content.contentSid);
      params.set(
        "ContentVariables",
        JSON.stringify(whatsAppContentVariables(content.contentVariables ?? [])),
      );
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth(accountSid, env.TWILIO_AUTH_TOKEN ?? "")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      return {
        channel,
        status: "error",
        to,
        detail: `Twilio HTTP ${res.status}: ${detail.slice(0, 300)}`,
      };
    }
    return { channel, status: "sent", to };
  } catch (e) {
    return {
      channel,
      status: "error",
      to,
      detail: e instanceof Error ? e.message : "Unknown message error",
    };
  }
}

/**
 * Send the Appointment ID to every channel the booking details call for.
 * Best-effort: failures never throw — they are returned as per-channel results
 * so the UI can surface them. Unconfigured channels return `not_configured`.
 *
 * `env` is injectable for tests; it defaults to the live server environment.
 */
export async function sendAppointmentNotifications(
  details: AppointmentNotificationDetails,
  env: NotificationEnv = getServerNotificationEnv(),
  options?: NotificationDeliveryOptions,
): Promise<NotificationResult[]> {
  return deliverToChannels({
    env,
    details,
    messages: buildAppointmentMessages(details),
    template: "appointment",
    // Booking created/requested -> the `appointment_confirmation` Meta slot,
    // which resolves to the approved `appointment_confirmed` template via
    // META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION. Reminders reuse this sender
    // but override via `options.metaTemplate` (see reminders.ts).
    metaTemplate: "appointment_confirmation",
    options,
  });
}

/**
 * Notify the patient that their online video consultation is ready to join.
 * The message carries the secure VC-code join link (`/video/VC-XXXXXX`).
 * Same best-effort rules as the other senders.
 */
export async function sendVideoReadyNotifications(
  details: VideoReadyNotificationDetails,
  env: NotificationEnv = getServerNotificationEnv(),
  options?: NotificationDeliveryOptions,
): Promise<NotificationResult[]> {
  return deliverToChannels({
    env,
    details,
    messages: buildVideoReadyMessages(details),
    template: "video",
    // The consultation room is ready -> the `video_consultation_room_ready` Meta
    // slot, i.e. the approved `video_consultation_ready_notice` template.
    metaTemplate: "video_consultation_room_ready",
    options,
  });
}

/**
 * Notify the patient that their appointment status changed (confirmed /
 * rejected / cancelled / completed). Same best-effort rules as booking
 * notifications.
 *
 * Meta: only `cancelled` and `rejected` map to a Meta template slot
 * (`appointment_cancelled` -> approved `appointment_cancelled_notice`).
 * Both statuses are the same event from the patient's point of view — the
 * appointment will not happen — so they deliberately share one template.
 * There is deliberately NO generic "status" template — for every other status
 * this resolves to `null`, so Meta reports `not_configured` instead of us
 * inventing a template name or reusing the wrong one. Email/SMS are unaffected.
 */
export async function sendStatusChangeNotifications(
  details: StatusChangeNotificationDetails,
  env: NotificationEnv = getServerNotificationEnv(),
  options?: NotificationDeliveryOptions,
): Promise<NotificationResult[]> {
  return deliverToChannels({
    env,
    details,
    messages: buildStatusChangeMessages(details),
    template: "status",
    metaTemplate:
      details.newStatus === "cancelled" || details.newStatus === "rejected"
        ? "appointment_cancelled"
        : null,
    options,
  });
}

/**
 * Notify the patient that their appointment was rescheduled to a new slot.
 * Same best-effort rules as booking notifications.
 */
export async function sendRescheduleNotifications(
  details: RescheduleNotificationDetails,
  env: NotificationEnv = getServerNotificationEnv(),
  options?: NotificationDeliveryOptions,
): Promise<NotificationResult[]> {
  return deliverToChannels({
    env,
    details,
    messages: buildRescheduleMessages(details),
    template: "reschedule",
    metaTemplate: "appointment_rescheduled",
    options,
  });
}

/**
 * Send the clinic's reply to a public support-form message.
 *
 * Delivers only to channels the sender actually provided (email and/or SMS).
 * WhatsApp is intentionally excluded here because out-of-session WhatsApp
 * requires an approved content template that does not exist for support
 * replies; email + SMS cover the contact details captured on the form. Same
 * best-effort + `not_configured` reporting rules as every other sender.
 */
export async function sendSupportReplyNotifications(
  details: SupportReplyNotificationDetails,
  env: NotificationEnv = getServerNotificationEnv(),
  options?: NotificationDeliveryOptions,
): Promise<NotificationResult[]> {
  return deliverToChannels({
    env,
    details,
    messages: buildSupportReplyMessages(details),
    options: {
      defaultCountryCode: env.PHONE_COUNTRY_CODE ?? "+92",
      ...options,
      // Only email + SMS (see note above), capped to the channels the sender
      // actually provided by the channel resolver.
      only: [
        ...(details.email ? (["email"] as const) : []),
        ...(details.phone ? (["sms"] as const) : []),
      ],
      phoneChannel: "sms",
    },
  });
}

/**
 * The single thing that decides which phone channel order notifications use.
 *
 * Today that is WhatsApp, because the clinic has approved Meta templates for
 * these events. SMS is intentionally NOT removed - the Twilio path, its env
 * vars and `phoneChannel: "sms"` support all remain intact and reachable;
 * flipping this constant back to "sms" is the whole of any future SMS change,
 * with no other edit required.
 */
const ORDER_PHONE_CHANNEL: "whatsapp" | "sms" = "whatsapp";

/**
 * Notify the patient that their product order was created or its status
 * changed. Delivers to the contact detail(s) in the order: email (when an
 * address is on file) and, per `ORDER_PHONE_CHANNEL` above, WhatsApp (when a
 * phone number is on file). Same best-effort + `not_configured` reporting rules
 * as every other sender.
 */
export async function sendOrderNotifications(
  details: OrderNotificationDetails,
  kind: OrderNotificationKind = "created",
  env: NotificationEnv = getServerNotificationEnv(),
  options?: NotificationDeliveryOptions,
): Promise<NotificationResult[]> {
  return deliverToChannels({
    env,
    details,
    messages: buildOrderMessages(details, kind),
    // Reached only when `ORDER_PHONE_CHANNEL` is "whatsapp". A caller may still
    // override the slot (e.g. order-payments.ts sends
    // `order_payment_confirmed`); both land in the same approved Meta slot.
    metaTemplate: kind === "created" ? "order_confirmation" : "order_status_update",
    options: {
      defaultCountryCode: env.PHONE_COUNTRY_CODE ?? "+92",
      ...options,
      // `only` is authoritative: it names the phone channel so WhatsApp is
      // actually selected and SMS is NOT silently kept alongside it.
      only: [
        ...(details.email ? (["email"] as const) : []),
        ...(details.phone ? ([ORDER_PHONE_CHANNEL] as const) : []),
      ],
      phoneChannel: ORDER_PHONE_CHANNEL,
    },
  });
}

/** Log a provider failure so failures are visible server-side, not just in the UI. */
function logDeliveryError(result: NotificationResult): void {
  console.error(
    `[notifications] ${result.channel} delivery failed for ${result.to}: ${result.detail ?? "unknown error"}`,
  );
}

/** Shared delivery loop: config check → provider call per channel. */
async function deliverToChannels({
  env,
  details,
  messages,
  template,
  metaTemplate,
  options,
}: {
  env: NotificationEnv;
  details: Pick<AppointmentNotificationDetails, "phone" | "email">;
  messages: {
    emailSubject: string;
    emailText: string;
    smsText: string;
    whatsappText: string;
    whatsappContentVariables: string[];
  };
  /** Drives the Twilio ContentSid lookup. Never changed for Meta. */
  template?: WhatsAppTemplateId;
  /**
   * The APPROVED Meta template for this event, or `null` when no approved
   * template covers the event. `options.metaTemplate` overrides it (used by
   * reminders, which reuse the booking/video senders).
   */
  metaTemplate?: MetaWhatsAppTemplateId | null;
  options?: NotificationDeliveryOptions;
}): Promise<NotificationResult[]> {
  const config = getNotificationConfig(env);
  const channels = resolveNotificationChannels(details, config, options);
  const results: NotificationResult[] = [];

  // SMS/WhatsApp must reach Twilio in E.164 form. Normalize once for all phone
  // channels; a raw (never-normalized) value fails loudly instead of being sent.
  const phone = normalizeE164Phone(
    details.phone ?? "",
    options?.defaultCountryCode ?? env.PHONE_COUNTRY_CODE ?? "+92",
  );

  for (const channel of channels) {
    const cfg = config[channel];
    const to = channel === "email" ? details.email! : details.phone!;
    const destination = channel === "email" ? to : phone;

    if (!cfg.configured) {
      results.push({
        channel,
        status: "not_configured",
        to,
        detail: `Not configured. Missing: ${cfg.missing.join(", ")}`,
      });
      continue;
    }

    if (channel !== "email" && !destination) {
      const result: NotificationResult = {
        channel,
        status: "error",
        to,
        detail: `Invalid phone number for ${channel}. Expected a 6–15 digit international number like +92 300 1234567.`,
      };
      logDeliveryError(result);
      results.push(result);
      continue;
    }

    let result: NotificationResult;
    if (channel === "email") {
      result = await sendResendEmail(env, to, messages);
    } else if (
      channel === "whatsapp" &&
      resolveWhatsAppProvider(env.WHATSAPP_PROVIDER) === "meta"
    ) {
      // Meta Cloud API. `sendMetaWhatsAppNotification` never throws and reports
      // `not_configured` / `error` as a result, so a Meta problem cannot break
      // the surrounding booking, payment or video flow.
      result = await sendMetaWhatsAppNotification({
        env,
        template: options?.metaTemplate ?? metaTemplate ?? null,
        details: details as MetaTemplateDetails,
        to: phone!,
        defaultCountryCode: options?.defaultCountryCode ?? env.PHONE_COUNTRY_CODE ?? "+92",
        // Slots that cannot be derived from `details` (e.g. `orderDate`) arrive
        // here. Omitting it leaves every slot exactly as it was before.
        extras: options?.metaExtras,
      });
    } else {
      // `phone` is normalized E.164 or null; the guard above already rejected
      // missing/invalid numbers, so it is safe to send from here.
      const twilioTo = phone!;
      result =
        channel === "whatsapp"
          ? await sendTwilioMessage(env, channel, twilioTo, messages.whatsappText, {
              contentSid: template ? env[WHATSAPP_CONTENT_SID_ENV[template]] : undefined,
              contentVariables: messages.whatsappContentVariables,
            })
          : await sendTwilioMessage(env, channel, twilioTo, messages.smsText);
    }

    if (result.status === "error") logDeliveryError(result);
    results.push(result);
  }

  return results;
}

export type {
  NotificationChannel,
  NotificationResult,
  OrderNotificationDetails,
  OrderNotificationKind,
  SupportReplyNotificationDetails,
} from "@/lib/notifications";
