/**
 * Shared, pure notification helpers used by both the server sender
 * (`src/lib/server/notifications.ts`) and the client UI (to render results).
 *
 * No provider SDKs are imported here — only types and pure functions, so this
 * module is safe to import from tests and browser code.
 */

export type NotificationChannel = "sms" | "whatsapp" | "email";

export type NotificationStatus = "sent" | "not_configured" | "error";

/**
 * The clinic's time zone is Pakistan Standard Time — a fixed UTC+5 offset with
 * no daylight saving. Labelling times explicitly lets international patients
 * (e.g. in Canada) convert without guessing.
 */
export const CLINIC_TIME_LABEL = "Pakistan time (UTC+5)";

export interface NotificationResult {
  channel: NotificationChannel;
  status: NotificationStatus;
  /** Destination address/number the message was attempted on. */
  to: string;
  /** Human-readable detail (e.g. which env vars are missing, provider message). */
  detail?: string;
}

/** Which WhatsApp "kind" a send maps to (Connects a send to a Twilio content template SID). */
export type WhatsAppTemplateId = "appointment" | "status" | "reschedule" | "video";

/**
 * Internal keys for the approved Meta WhatsApp message templates.
 *
 * These are NOT the names sent on the wire. Each key only selects which env var
 * holds the approved template name; `sendMetaWhatsAppNotification` sends that
 * env var's *value*, so the approved name can be changed in Meta Business
 * Manager (or per environment) with no code change:
 *
 *   appointment_confirmation            -> META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION
 *   appointment_rescheduled             -> META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED
 *   appointment_cancelled               -> META_WA_TEMPLATE_APPOINTMENT_CANCELLED
 *   appointment_reminder                -> META_WA_TEMPLATE_APPOINTMENT_REMINDER
 *   video_consultation_room_ready       -> META_WA_TEMPLATE_VIDEO_CONSULTATION_READY
 *   payment_received                    -> META_WA_TEMPLATE_PAYMENT_RECEIVED
 *   appointment_payment_pending         -> META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING
 *   appointment_refund                  -> META_WA_TEMPLATE_APPOINTMENT_REFUND
 *   order_confirmation                  -> META_WA_TEMPLATE_ORDER_CONFIRMATION
 *   order_status_update                 -> META_WA_TEMPLATE_ORDER_STATUS_UPDATE
 *   order_payment_confirmed             -> META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED
 *   order_payment_pending               -> META_WA_TEMPLATE_ORDER_PAYMENT_PENDING
 *   order_refund                        -> META_WA_TEMPLATE_ORDER_REFUND
 *
 * Grouped by business domain, and the domain boundary is enforced by
 * `metaTemplateParameters` in the server sender: the appointment payment and
 * appointment refund keys only ever read appointment fields, and the order
 * payment/refund keys only ever read order fields, so an appointment ID can
 * never reach an order template (or vice versa).
 *
 * `hello_world` is Meta's sample template and is deliberately absent: it is
 * never part of the clinic notification flow.
 *
 * Declared here (a pure string union, no server code) so the shared module can
 * reference it without importing the server-only Meta sender.
 *
 * Never rename a key to match a Meta template name: the keys are internal and
 * renaming one would touch the event mapping, the sender and Twilio-adjacent
 * code for no functional gain.
 */
export type MetaWhatsAppTemplateId =
  | "appointment_confirmation"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "appointment_reminder"
  | "video_consultation_room_ready"
  | "payment_received"
  | "appointment_payment_pending"
  | "appointment_refund"
  | "order_confirmation"
  | "order_status_update"
  | "order_payment_confirmed"
  | "order_payment_pending"
  | "order_refund";

/**
 * Which provider handles outbound WhatsApp.
 *
 * `twilio` is the historical behaviour and stays the default, so a deployment
 * with no `WHATSAPP_PROVIDER` set keeps working exactly as before. `meta` routes
 * WhatsApp through the Meta WhatsApp Cloud API instead.
 */
export type WhatsAppProvider = "twilio" | "meta";

/**
 * Resolve the outbound WhatsApp provider from the raw env value.
 *
 * Deliberately conservative: only an explicit `meta` opts into Meta. Anything
 * else — unset, blank, misspelled, or a future unknown value — resolves to
 * `twilio`, so a typo can never silently disable WhatsApp in production.
 */
export function resolveWhatsAppProvider(value: string | undefined): WhatsAppProvider {
  return value?.trim().toLowerCase() === "meta" ? "meta" : "twilio";
}

/** Delivery overrides for the shared senders. */
export interface NotificationDeliveryOptions {
  /**
   * When provided, deliver only to these channels (e.g. an admin-chosen
   * reminder channel). Channels still resolve first from the booking details,
   * so a requested channel is simply excluded when the patient has no matching
   * contact on file.
   */
  only?: NotificationChannel[];
  /**
   * Force the phone channel when both SMS and WhatsApp are configured, instead
   * of the default WhatsApp preference. An unavailable requested channel is
   * reported rather than silently swapped for the other.
   */
  phoneChannel?: "whatsapp" | "sms";
  /**
   * Dial prefix used to normalize phone numbers written without a country code
   * (defaults to the `PHONE_COUNTRY_CODE` env var, then "+92").
   */
  defaultCountryCode?: string;
  /**
   * Override which APPROVED Meta template fills the WhatsApp message.
   *
   * Only meaningful when the WhatsApp provider is `meta`; the Twilio
   * `ContentSid` selection is driven separately by the sender's own template
   * id, so this never changes Twilio behaviour.
   */
  metaTemplate?: MetaWhatsAppTemplateId;
  /**
   * Values for template slots that are not derivable from the shared booking /
   * order details (`orderDate`, `paymentStatus`, `refundAmount`).
   *
   * Forwarded to the Meta sender only. A caller that omits this behaves exactly
   * as before: the affected slots render empty, arity is unchanged, and nothing
   * else about the message changes.
   */
  metaExtras?: MetaTemplateExtras;
}

/**
 * The subset of `MetaTemplateExtras` that callers may supply. Declared here (as
 * the template id union already is) so this module stays free of provider
 * imports; `server/whatsapp-meta.ts` owns the canonical interface and the two
 * are structurally compatible.
 */
export interface MetaTemplateExtras {
  /** Human-readable payment status, for payment-pending / refund status slots. */
  paymentStatus?: string;
  /** Order date, for `order_confirmation`. */
  orderDate?: string;
  /** Refunded amount, for `appointment_refund` / `order_refund`. */
  refundAmount?: string;
}

/**
 * Normalize a phone number to international E.164 form so Twilio can route it.
 * Local ("0312…", "312…", "92 312…") and international ("+92 312…", "00 92…")
 * forms of the default country are converted; the result is rejected (null)
 * when it cannot be made a valid 6–15 digit E.164 number.
 */
export function normalizeE164Phone(raw: string, defaultCountryCode = "+92"): string | null {
  let s = raw.trim();
  if (!s) return null;
  // Strip common separators — never digits, '+' or the ITU "00" prefix.
  s = s.replace(/[\s().\-/]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+")) {
    const prefix = defaultCountryCode.replace("+", "");
    if (s.startsWith(prefix)) {
      // Already carries the country code, just missing the leading mark.
      s = `+${s}`;
    } else {
      if (s.startsWith("0")) s = s.slice(1);
      s = `+${prefix}${s}`;
    }
  }
  const digits = s.slice(1);
  if (!/^[0-9]{6,15}$/.test(digits)) return null;
  return `+${digits}`;
}

/**
 * Build the numbered object the Twilio Content API expects for a WhatsApp
 * template: the n-th value maps to placeholder {{n}}. The n-th position in the
 * caller-provided array must match the template the clinic approves.
 */
export function whatsAppContentVariables(values: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  values.forEach((value, index) => {
    vars[String(index + 1)] = value;
  });
  return vars;
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
  /** Optional approved Twilio WhatsApp content templates (absent = free-form Body). */
  TWILIO_WHATSAPP_CONTENT_SID_APPOINTMENT?: string;
  TWILIO_WHATSAPP_CONTENT_SID_STATUS?: string;
  TWILIO_WHATSAPP_CONTENT_SID_RESCHEDULE?: string;
  TWILIO_WHATSAPP_CONTENT_SID_VIDEO?: string;
  /** Dial prefix used to normalize phone numbers written without a country code. */
  PHONE_COUNTRY_CODE?: string;

  /* --- Meta WhatsApp Cloud API (server-only; used only when provider = meta) --- */

  /**
   * Outbound WhatsApp provider: "twilio" (default) or "meta". Unset/blank keeps
   * the historical Twilio behaviour.
   */
  WHATSAPP_PROVIDER?: string;
  META_WA_ACCESS_TOKEN?: string;
  META_WA_PHONE_NUMBER_ID?: string;
  META_WA_BUSINESS_ACCOUNT_ID?: string;
  /** Graph API version override; blank uses the shared default (v23.0). */
  META_WA_API_VERSION?: string;
  /** Approved Meta template names, exactly as shown in Meta Business Manager. */
  META_WA_TEMPLATE_APPOINTMENT_CONFIRMATION?: string;
  META_WA_TEMPLATE_APPOINTMENT_RESCHEDULED?: string;
  META_WA_TEMPLATE_APPOINTMENT_CANCELLED?: string;
  META_WA_TEMPLATE_APPOINTMENT_REMINDER?: string;
  META_WA_TEMPLATE_VIDEO_CONSULTATION_READY?: string;
  /* Appointment payment + refund (never used for orders). */
  META_WA_TEMPLATE_PAYMENT_RECEIVED?: string;
  META_WA_TEMPLATE_APPOINTMENT_PAYMENT_PENDING?: string;
  META_WA_TEMPLATE_APPOINTMENT_REFUND?: string;
  /* Order lifecycle (never used for appointments). */
  META_WA_TEMPLATE_ORDER_CONFIRMATION?: string;
  META_WA_TEMPLATE_ORDER_STATUS_UPDATE?: string;
  META_WA_TEMPLATE_ORDER_PAYMENT_CONFIRMED?: string;
  META_WA_TEMPLATE_ORDER_PAYMENT_PENDING?: string;
  META_WA_TEMPLATE_ORDER_REFUND?: string;
  /** Alias for META_WA_TEMPLATE_LANGUAGE_CODE (lower precedence). */
  META_WA_TEMPLATE_LANGUAGE?: string;
  /** Canonical `template.language.code` sent to Meta (e.g. "en", "en_US"). */
  META_WA_TEMPLATE_LANGUAGE_CODE?: string;
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

  const whatsapp: ChannelConfig =
    resolveWhatsAppProvider(env.WHATSAPP_PROVIDER) === "meta"
      ? {
          // Meta needs its own credentials; an individual missing template name
          // is reported per-send instead of here, so one absent template never
          // marks the whole channel unavailable.
          configured: Boolean(
            env.META_WA_ACCESS_TOKEN?.trim() && env.META_WA_PHONE_NUMBER_ID?.trim(),
          ),
          missing: [
            ...(!env.META_WA_ACCESS_TOKEN?.trim() ? ["META_WA_ACCESS_TOKEN"] : []),
            ...(!env.META_WA_PHONE_NUMBER_ID?.trim() ? ["META_WA_PHONE_NUMBER_ID"] : []),
          ],
        }
      : {
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
 * - phone present -> WhatsApp when configured, otherwise SMS; an explicit
 *   `phoneChannel` preference overrides the WhatsApp default, and an `only`
 *   allow-list can restrict delivery to exactly the requested channels.
 */
export function resolveNotificationChannels(
  details: Pick<AppointmentNotificationDetails, "phone" | "email">,
  config: NotificationConfig,
  options?: NotificationDeliveryOptions,
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (details.email) channels.push("email");
  if (details.phone) {
    // An allow-listed phone channel both forces the choice and forbids the
    // other one (so { only: ["sms"] } really sends SMS, never WhatsApp).
    const onlyPhone = options?.only?.filter(
      (c): c is "sms" | "whatsapp" => c === "sms" || c === "whatsapp",
    );
    if (onlyPhone && onlyPhone.length === 1) channels.push(onlyPhone[0]);
    else if (options?.phoneChannel === "sms") channels.push("sms");
    else if (options?.phoneChannel === "whatsapp") channels.push("whatsapp");
    else channels.push(config.whatsapp.configured ? "whatsapp" : "sms");
  }
  if (options?.only && options.only.length > 0) {
    const allowed = new Set(options.only);
    return channels.filter((channel) => allowed.has(channel));
  }
  return channels;
}

/** Build the message text for every channel from the same booking details. */
export function buildAppointmentMessages(details: AppointmentNotificationDetails): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
  whatsappContentVariables: string[];
} {
  const lines = [
    `Your appointment is requested with Dr. Naseem Ahmed Khan.`,
    ``,
    `Appointment ID: ${details.appointmentId}`,
    `Service: ${details.serviceName}`,
    `Date: ${details.date}`,
    `Time: ${details.time} (${CLINIC_TIME_LABEL})`,
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
    whatsappContentVariables: [
      details.appointmentId,
      details.patientName,
      details.serviceName,
      details.date,
      details.time,
      ...(details.statusUrl ? [details.statusUrl] : []),
    ],
  };
}
export function buildStatusChangeMessages(details: StatusChangeNotificationDetails): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
  whatsappContentVariables: string[];
} {
  const phrase = STATUS_CHANGE_PHRASES[details.newStatus] ?? details.newStatus;
  const lines = [
    `Your appointment ${phrase}.`,
    ``,
    `Appointment ID: ${details.appointmentId}`,
    `Service: ${details.serviceName ?? "Your appointment"}`,
    `Date: ${details.date}`,
    `Time: ${details.time} (${CLINIC_TIME_LABEL})`,
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
    whatsappContentVariables: [
      details.appointmentId,
      details.patientName,
      details.serviceName ?? "Your appointment",
      details.date,
      details.time,
      ...(details.statusUrl ? [details.statusUrl] : []),
    ],
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
  whatsappContentVariables: string[];
} {
  const lines = [
    `Your online video consultation is ready.`,
    ``,
    `Appointment: ${details.appointmentId}`,
    `Video Consultation ID: ${details.vcNo}`,
    `Date: ${details.date}`,
    `Time: ${details.time} (${CLINIC_TIME_LABEL})`,
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
    whatsappContentVariables: [
      details.appointmentId,
      details.patientName,
      details.serviceName,
      details.date,
      details.time,
      details.vcNo,
      details.joinUrl,
      ...(details.statusUrl ? [details.statusUrl] : []),
    ],
  };
}

/** Build the message text when the clinic moves an appointment to a new slot. */
export interface SupportReplyNotificationDetails {
  /** The sender's name from the support message. */
  name: string;
  /** Clinic display name (from the doctor profile when available). */
  clinicName: string;
  /** The reply text written by the clinic. */
  reply: string;
  /** The support message subject, shown so the sender knows what is being answered. */
  originalSubject: string;
  phone?: string;
  email?: string;
}

/** Build the "the clinic replied to your message" message for every channel. */
export function buildSupportReplyMessages(details: SupportReplyNotificationDetails): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
  whatsappContentVariables: string[];
} {
  const subjectLine = details.originalSubject?.trim()
    ? `\n\nAbout: ${details.originalSubject.trim()}`
    : "";
  const emailText = [
    `Dear ${details.name.trim() || "there"},`,
    ``,
    `${details.clinicName} has replied to your message.`,
    subjectLine.trim() || undefined,
    ``,
    `${details.reply}`,
    ``,
    `If you have more questions, send a new message from the website's Contact page — we will get back to you.`,
    ``,
    `Warm regards,`,
    `${details.clinicName}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  const smsText =
    `${details.clinicName} replied to your message${subjectLine ? ` (${details.originalSubject.trim()})` : ""}: ${details.reply}`.slice(
      0,
      480,
    );

  return {
    emailSubject: `Reply from ${details.clinicName} — your message`,
    emailText,
    smsText,
    whatsappText: smsText,
    whatsappContentVariables: [details.reply],
  };
}

export function buildRescheduleMessages(details: RescheduleNotificationDetails): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
  whatsappContentVariables: string[];
} {
  const lines = [
    `Your appointment has been rescheduled by the clinic.`,
    ``,
    `Appointment ID: ${details.appointmentId}`,
    `Service: ${details.serviceName ?? "Your appointment"}`,
    `New date: ${details.date}`,
    `New time: ${details.time} (${CLINIC_TIME_LABEL})`,
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
    whatsappContentVariables: [
      details.appointmentId,
      details.patientName,
      details.serviceName ?? "Your appointment",
      details.date,
      details.time,
      ...(details.statusUrl ? [details.statusUrl] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Product order notifications
// ---------------------------------------------------------------------------

export type OrderNotificationKind = "created" | "status";

/** Contact + summary details for a product-order notification. */
export interface OrderNotificationDetails {
  /** Patient-facing Order ID (e.g. "OD-8F3K21"). */
  orderId: string;
  patientName: string;
  /** One-line item summary, e.g. "2 × Glucosamine — Rs. 1200; 1 × Gel — Rs. 400". */
  itemSummary?: string;
  subtotal?: number | null;
  deliveryCharge?: number | null;
  total?: number | null;
  /** Absolute URL where the patient can check the order status (optional). */
  orderUrl?: string;
  /** Short human-readable payment/status label (e.g. "payment pending"). */
  paymentStatusLabel?: string;
  phone?: string;
  email?: string;
}

/** Human-readable label used in order emails for common order/payment statuses. */
export function orderStatusLabel(value: string): string {
  switch (value) {
    case "payment_verified":
      return "Payment verified — order confirmed";
    case "payment_failed":
      return "Payment not accepted";
    case "refunded":
      return "Payment refunded";
    case "waived":
      return "Payment waived — order confirmed";
    case "payment_pending":
    case "pending_payment":
      return "Payment pending";
    case "cancelled":
      return "Order cancelled";
    case "confirmed":
      return "Order confirmed";
    case "shipped":
      return "Order shipped / on its way";
    case "delivered":
      return "Order delivered";
    case "completed":
      return "Order completed";
    default:
      return value.replace(/_/g, " ");
  }
}

/** Build the "your order was received" message (awaiting payment). */
export function buildOrderMessages(
  details: OrderNotificationDetails,
  kind: OrderNotificationKind,
): {
  emailSubject: string;
  emailText: string;
  smsText: string;
  whatsappText: string;
  whatsappContentVariables: string[];
} {
  if (kind === "created") {
    const priceLines: string[] = [];
    if (details.itemSummary) priceLines.push(`Items: ${details.itemSummary}`);
    if (details.total != null) {
      priceLines.push(
        `Total: Rs. ${details.total}`,
        `Subtotal: Rs. ${details.subtotal ?? 0}`,
        `Delivery: Rs. ${details.deliveryCharge ?? 0}`,
      );
    }
    if (details.paymentStatusLabel) priceLines.push(`Payment: ${details.paymentStatusLabel}`);

    const emailText = [
      `Dear ${details.patientName},`,
      ``,
      `Your order has been received by Dr. Naseem Ahmed Khan's clinic.`,
      ``,
      `Order ID: ${details.orderId}`,
      ...priceLines,
      ...(details.orderUrl ? [``, `Check your order status: ${details.orderUrl}`] : []),
      ``,
      `Keep your Order ID — you will need it, along with your phone number or email, to check your order status.`,
    ].join("\n");

    const smsText = `Order ${details.orderId} received by the clinic${
      details.total != null ? ` — Total Rs. ${details.total}` : ""
    }${details.orderUrl ? `. Check status: ${details.orderUrl}` : ""}`.slice(0, 480);

    return {
      emailSubject: `Order ${details.orderId} received — pending confirmation`,
      emailText,
      smsText,
      whatsappText: smsText,
      whatsappContentVariables: [
        details.orderId,
        details.patientName,
        details.total != null ? `Rs. ${details.total}` : "—",
        ...(details.orderUrl ? [details.orderUrl] : []),
      ],
    };
  }

  const statusText = details.paymentStatusLabel ?? orderStatusLabel("updated");
  const emailText = [
    `Dear ${details.patientName},`,
    ``,
    `Your order status has been updated by the clinic.`,
    ``,
    `Order ID: ${details.orderId}`,
    `Status: ${statusText}`,
    ...(details.total != null ? [`Total: Rs. ${details.total}`] : []),
    ...(details.orderUrl ? [``, `Check your order status: ${details.orderUrl}`] : []),
  ].join("\n");

  const smsText = `Order ${details.orderId} — ${statusText}${
    details.total != null ? ` (Rs. ${details.total})` : ""
  }${details.orderUrl ? `. Check status: ${details.orderUrl}` : ""}`.slice(0, 480);

  return {
    emailSubject: `Order ${details.orderId} — ${statusText}`,
    emailText,
    smsText,
    whatsappText: smsText,
    whatsappContentVariables: [
      details.orderId,
      details.patientName,
      statusText,
      ...(details.orderUrl ? [details.orderUrl] : []),
    ],
  };
}
