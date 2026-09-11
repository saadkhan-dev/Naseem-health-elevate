/**
 * Shared, pure notification helpers used by both the server sender
 * (`src/lib/server/notifications.ts`) and the client UI (to render results).
 *
 * No provider SDKs are imported here — only types and pure functions, so this
 * module is safe to import from tests and browser code.
 */

export type NotificationChannel = "sms" | "whatsapp" | "email";

export type NotificationStatus = "sent" | "not_configured" | "error";

export interface NotificationResult {
  channel: NotificationChannel;
  status: NotificationStatus;
  /** Destination address/number the message was attempted on. */
  to: string;
  /** Human-readable detail (e.g. which env vars are missing, provider message). */
  detail?: string;
}

export interface AppointmentNotificationDetails {
  appointmentId: string;
  patientName: string;
  serviceName: string;
  /** "yyyy-MM-dd" */
  date: string;
  /** "HH:mm" */
  time: string;
  /** Absolute URL to the appointment-status page (optional). */
  statusUrl?: string;
  phone?: string;
  email?: string;
  /** Video consultations are prepaid — include the payment line. */
  isVideo?: boolean;
  /** Charged amount in Rs. (after any offer); only for video consultations. */
  amount?: number | null;
  /** Offer title when a video offer was applied; only for video consultations. */
  offerTitle?: string | null;
}

export interface RescheduleNotificationDetails {
  appointmentId: string;
  patientName: string;
  serviceName: string | null;
  /** "yyyy-MM-dd" */
  date: string;
  /** "HH:mm" */
  time: string;
  /** Absolute URL to the appointment-status page (optional). */
  statusUrl?: string;
  phone?: string;
  email?: string;
  /** Previous "yyyy-MM-dd" (optional). */
  previousDate?: string;
  /** Previous "HH:mm" (optional). */
  previousTime?: string;
}

export type AppointmentStatusValue =
  "pending" | "confirmed" | "rejected" | "cancelled" | "completed" | "arrived" | "no_show";

export interface StatusChangeNotificationDetails {
  appointmentId: string;
  patientName: string;
  serviceName: string | null;
  /** "yyyy-MM-dd" */
  date: string;
  /** "HH:mm" */
  time: string;
  /** Absolute URL to the appointment-status page (optional). */
  statusUrl?: string;
  phone?: string;
  email?: string;
  newStatus: AppointmentStatusValue;
  previousStatus?: AppointmentStatusValue;
}

/** Human-readable verb phrase for each appointment status. */
export const STATUS_CHANGE_PHRASES: Record<AppointmentStatusValue, string> = {
  pending: "is pending confirmation",
  confirmed: "has been confirmed by the clinic",
  rejected: "was not accepted",
  cancelled: "has been cancelled",
  completed: "has been completed",
  arrived: "has arrived at the clinic",
  no_show: "was marked as a no-show (you did not attend)",
};

/** Human-readable display label for each appointment status (badges, filters). */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatusValue, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
  arrived: "Arrived",
  no_show: "No-Show",
};

/**
 * Every env var a notification provider needs. Kept as a plain object so the
 * config check is pure and unit-testable.
 */
export interface NotificationEnv {
  RESEND_API_KEY?: string;
  NOTIFICATION_FROM_EMAIL?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_SMS_FROM?: string;
  TWILIO_WHATSAPP_FROM?: string;
}

export interface ChannelConfig {
  configured: boolean;
  /** Names of env vars still missing for this channel to work. */
  missing: string[];
}

export interface NotificationConfig {
  email: ChannelConfig;
  sms: ChannelConfig;
  whatsapp: ChannelConfig;
  /** Normalized public site URL used to build patient-facing links (SITE_URL). */
  siteUrl?: string | null;
}

/** Which channels are currently configured based on the provided env. */
export function getNotificationConfig(env: NotificationEnv): NotificationConfig {
  const email: ChannelConfig = {
    configured: Boolean(env.RESEND_API_KEY && env.NOTIFICATION_FROM_EMAIL),
    missing: [
      ...(!env.RESEND_API_KEY ? ["RESEND_API_KEY"] : []),
      ...(!env.NOTIFICATION_FROM_EMAIL ? ["NOTIFICATION_FROM_EMAIL"] : []),
    ],
  };

  const twilioCredentials = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);

  const sms: ChannelConfig = {
    configured: twilioCredentials && Boolean(env.TWILIO_SMS_FROM),
    missing: [
      ...(!env.TWILIO_ACCOUNT_SID ? ["TWILIO_ACCOUNT_SID"] : []),
      ...(!env.TWILIO_AUTH_TOKEN ? ["TWILIO_AUTH_TOKEN"] : []),
      ...(!env.TWILIO_SMS_FROM ? ["TWILIO_SMS_FROM"] : []),
    ],
  };

  const whatsapp: ChannelConfig = {
    configured: twilioCredentials && Boolean(env.TWILIO_WHATSAPP_FROM),
    missing: [
      ...(!env.TWILIO_ACCOUNT_SID ? ["TWILIO_ACCOUNT_SID"] : []),
      ...(!env.TWILIO_AUTH_TOKEN ? ["TWILIO_AUTH_TOKEN"] : []),
      ...(!env.TWILIO_WHATSAPP_FROM ? ["TWILIO_WHATSAPP_FROM"] : []),
    ],
  };

  return { email, sms, whatsapp };
}

/**
 * Decide which channels a booking should be notified on.
 * - email present -> email (Resend)
 * - phone present -> WhatsApp when Twilio WhatsApp is configured, otherwise SMS
 */
export function resolveNotificationChannels(
  details: Pick<AppointmentNotificationDetails, "phone" | "email">,
  config: NotificationConfig,
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (details.email) channels.push("email");
  if (details.phone) channels.push(config.whatsapp.configured ? "whatsapp" : "sms");
  return channels;
}

/** Build the message text for every channel from the same booking details. */
export function buildAppointmentMessages(details: AppointmentNotificationDetails): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
} {
  const lines = [
    `Your appointment is requested with Dr. Naseem Ahmed Khan.`,
    ``,
    `Appointment ID: ${details.appointmentId}`,
    `Service: ${details.serviceName}`,
    `Date: ${details.date}`,
    `Time: ${details.time}`,
    `Patient: ${details.patientName}`,
  ];

  if (details.isVideo && details.amount !== undefined && details.amount !== null) {
    const amountLine =
      details.amount === 0
        ? `Video consultation fee: FREE`
        : `Video consultation fee: Rs. ${details.amount}`;
    const offerLine = details.offerTitle ? `Offer applied: ${details.offerTitle}` : null;
    lines.push(``, amountLine);
    if (offerLine) lines.push(offerLine);
  }

  lines.push(
    ``,
    `Keep your Appointment ID — you will need it, along with your phone number or email, to check your appointment status.`,
  );
  if (details.statusUrl) {
    lines.push(`Check status: ${details.statusUrl}`);
  }

  const text = lines.join("\n");
  return {
    emailSubject: `Your Appointment ID — Dr. Naseem Ahmed Khan`,
    emailText: text,
    smsText: text,
    whatsappText: text,
  };
}

/** Build the message text when an appointment's status changes. */
export function buildStatusChangeMessages(details: StatusChangeNotificationDetails): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
} {
  const phrase = STATUS_CHANGE_PHRASES[details.newStatus] ?? details.newStatus;
  const lines = [
    `Your appointment ${phrase}.`,
    ``,
    `Appointment ID: ${details.appointmentId}`,
    `Service: ${details.serviceName ?? "Your appointment"}`,
    `Date: ${details.date}`,
    `Time: ${details.time}`,
    `Patient: ${details.patientName}`,
  ];
  if (details.statusUrl) {
    lines.push(``, `Check your appointment status: ${details.statusUrl}`);
  }

  const text = lines.join("\n");
  return {
    emailSubject: `Appointment update (${details.newStatus}) — Dr. Naseem Ahmed Khan`,
    emailText: text,
    smsText: text,
    whatsappText: text,
  };
}

export interface VideoReadyNotificationDetails {
  appointmentId: string;
  patientName: string;
  serviceName: string;
  /** "yyyy-MM-dd" */
  date: string;
  /** "HH:mm" */
  time: string;
  /** Short patient-facing video consultation code (e.g. "VC-8F3K21"). */
  vcNo: string;
  /** Absolute URL to the patient's video join page (e.g. ".../video/VC-8F3K21"). */
  joinUrl: string;
  /** Absolute URL to the appointment-status page (optional). */
  statusUrl?: string;
  phone?: string;
  email?: string;
}

/** Build the "your video consultation is ready to join" message. */
export function buildVideoReadyMessages(details: VideoReadyNotificationDetails): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
} {
  const lines = [
    `Your online video consultation is ready.`,
    ``,
    `Appointment: ${details.appointmentId}`,
    `Video Consultation ID: ${details.vcNo}`,
    `Date: ${details.date}`,
    `Time: ${details.time}`,
    ``,
    `Join your consultation:`,
    `${details.joinUrl}`,
  ];
  if (details.statusUrl) {
    lines.push(``, `Check your appointment status:`, `${details.statusUrl}`);
  }
  lines.push(``, `Please click the link above to join your consultation.`);

  const text = lines.join("\n");
  return {
    emailSubject: `Your video consultation is ready — Dr. Naseem Ahmed Khan`,
    emailText: text,
    smsText: text,
    whatsappText: text,
  };
}

/** Build the message text when the clinic moves an appointment to a new slot. */
export function buildRescheduleMessages(details: RescheduleNotificationDetails): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
} {
  const lines = [
    `Your appointment has been rescheduled by the clinic.`,
    ``,
    `Appointment ID: ${details.appointmentId}`,
    `Service: ${details.serviceName ?? "Your appointment"}`,
    `New date: ${details.date}`,
    `New time: ${details.time}`,
    `Patient: ${details.patientName}`,
  ];
  if (details.previousDate) {
    lines.push(
      `(Previously: ${details.previousDate}${details.previousTime ? ` at ${details.previousTime}` : ""})`,
    );
  }
  if (details.statusUrl) {
    lines.push(``, `Check your appointment status: ${details.statusUrl}`);
  }

  const text = lines.join("\n");
  return {
    emailSubject: `Your appointment was rescheduled — Dr. Naseem Ahmed Khan`,
    emailText: text,
    smsText: text,
    whatsappText: text,
  };
}
