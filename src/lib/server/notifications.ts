/**
 * Server-only notification senders. Runs inside TanStack Start server
 * functions (see `src/lib/actions.functions.ts`), so it has access to the
 * server environment.
 *
 * Providers are real integrations (no stubs or fake "sent" results):
 *  - email    -> Resend  (POST https://api.resend.com/emails)
 *  - sms      -> Twilio  (POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json)
 *  - whatsapp -> Twilio WhatsApp sender (same API, whatsapp:+… destinations)
 *
 * A channel that has no credentials configured is reported as
 * `status: "not_configured"` with the exact env vars required — it is never
 * silently faked.
 */

import {
  buildAppointmentMessages,
  buildRescheduleMessages,
  buildStatusChangeMessages,
  buildVideoReadyMessages,
  getNotificationConfig,
  normalizeE164Phone,
  resolveNotificationChannels,
  whatsAppContentVariables,
  type AppointmentNotificationDetails,
  type NotificationChannel,
  type NotificationDeliveryOptions,
  type NotificationEnv,
  type NotificationResult,
  type RescheduleNotificationDetails,
  type StatusChangeNotificationDetails,
  type VideoReadyNotificationDetails,
  type WhatsAppTemplateId,
} from "@/lib/notifications";

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

/**
 * Jitsi Meet instance used for video consultation rooms.
 *
 * Defaults to the official `meet.jit.si` instance: its `external_api.js` and
 * XMPP endpoints (`http-bind`/websocket) are reachable and it allows anonymous
 * room joins (`anonymousdomain: guest.meet.jit.si`, `requireDisplayName:
 * false`). The previously used `jitsi.osadl.org` must NOT be used — its BOSH
 * endpoint times out and its guest/MUC domains do not resolve, so conferences
 * never establish even though `external_api.js` loads. The clinic can override
 * it with the server-only `JITSI_DOMAIN` env var. This value is read on the
 * SERVER only and returned to the join page through the existing server
 * function — it is never exposed as a VITE_* variable.
 */
export function getJitsiDomain(): string {
  const domain = readEnv("JITSI_DOMAIN");
  return (domain ?? "meet.jit.si").replace(/^https?:\/\//, "").replace(/\/+$/, "");
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
    options,
  });
}

/**
 * Notify the patient that their appointment status changed (confirmed /
 * rejected / cancelled / completed). Same best-effort rules as booking
 * notifications.
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
    options,
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
  template: WhatsAppTemplateId;
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
    } else {
      // `phone` is normalized E.164 or null; the guard above already rejected
      // missing/invalid numbers, so it is safe to send from here.
      const twilioTo = phone!;
      result =
        channel === "whatsapp"
          ? await sendTwilioMessage(env, channel, twilioTo, messages.whatsappText, {
              contentSid: env[WHATSAPP_CONTENT_SID_ENV[template]],
              contentVariables: messages.whatsappContentVariables,
            })
          : await sendTwilioMessage(env, channel, twilioTo, messages.smsText);
    }

    if (result.status === "error") logDeliveryError(result);
    results.push(result);
  }

  return results;
}

export type { NotificationChannel, NotificationResult } from "@/lib/notifications";
