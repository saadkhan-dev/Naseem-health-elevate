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
  resolveNotificationChannels,
  type AppointmentNotificationDetails,
  type NotificationChannel,
  type NotificationEnv,
  type NotificationResult,
  type RescheduleNotificationDetails,
  type StatusChangeNotificationDetails,
  type VideoReadyNotificationDetails,
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
  };
}

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
): Promise<NotificationResult> {
  try {
    const accountSid = env.TWILIO_ACCOUNT_SID!;
    const from = channel === "whatsapp" ? env.TWILIO_WHATSAPP_FROM! : env.TWILIO_SMS_FROM!;
    const target = channel === "whatsapp" ? `whatsapp:${to}` : to;

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth(accountSid, env.TWILIO_AUTH_TOKEN ?? "")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: target, From: from, Body: body }).toString(),
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
): Promise<NotificationResult[]> {
  return deliverToChannels({ env, details, messages: buildAppointmentMessages(details) });
}

/**
 * Notify the patient that their online video consultation is ready to join.
 * The message carries the secure VC-code join link (`/video/VC-XXXXXX`).
 * Same best-effort rules as the other senders.
 */
export async function sendVideoReadyNotifications(
  details: VideoReadyNotificationDetails,
  env: NotificationEnv = getServerNotificationEnv(),
): Promise<NotificationResult[]> {
  return deliverToChannels({ env, details, messages: buildVideoReadyMessages(details) });
}

/**
 * Notify the patient that their appointment status changed (confirmed /
 * rejected / cancelled / completed). Same best-effort rules as booking
 * notifications.
 */
export async function sendStatusChangeNotifications(
  details: StatusChangeNotificationDetails,
  env: NotificationEnv = getServerNotificationEnv(),
): Promise<NotificationResult[]> {
  return deliverToChannels({ env, details, messages: buildStatusChangeMessages(details) });
}

/**
 * Notify the patient that their appointment was rescheduled to a new slot.
 * Same best-effort rules as booking notifications.
 */
export async function sendRescheduleNotifications(
  details: RescheduleNotificationDetails,
  env: NotificationEnv = getServerNotificationEnv(),
): Promise<NotificationResult[]> {
  return deliverToChannels({ env, details, messages: buildRescheduleMessages(details) });
}

/** Shared delivery loop: config check → provider call per channel. */
async function deliverToChannels({
  env,
  details,
  messages,
}: {
  env: NotificationEnv;
  details: Pick<AppointmentNotificationDetails, "phone" | "email">;
  messages: {
    emailSubject: string;
    emailText: string;
    smsText: string;
    whatsappText: string;
  };
}): Promise<NotificationResult[]> {
  const config = getNotificationConfig(env);
  const channels = resolveNotificationChannels(details, config);
  const results: NotificationResult[] = [];

  for (const channel of channels) {
    const to = channel === "email" ? details.email! : details.phone!;
    const cfg = config[channel];

    if (!cfg.configured) {
      results.push({
        channel,
        status: "not_configured",
        to,
        detail: `Not configured. Missing: ${cfg.missing.join(", ")}`,
      });
      continue;
    }

    if (channel === "email") {
      results.push(await sendResendEmail(env, to, messages));
    } else if (channel === "whatsapp") {
      results.push(await sendTwilioMessage(env, channel, to, messages.whatsappText));
    } else {
      results.push(await sendTwilioMessage(env, channel, to, messages.smsText));
    }
  }

  return results;
}

export type { NotificationChannel, NotificationResult } from "@/lib/notifications";
