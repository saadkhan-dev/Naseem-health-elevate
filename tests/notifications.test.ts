import { describe, expect, it } from "bun:test";
import {
  getNotificationConfig,
  buildAppointmentMessages,
  buildStatusChangeMessages,
  buildVideoReadyMessages,
  resolveNotificationChannels,
  STATUS_CHANGE_PHRASES,
  type NotificationEnv,
} from "../src/lib/notifications";
import { videoJoinUrl } from "../src/lib/video-join";
import {
  sendAppointmentNotifications,
  sendStatusChangeNotifications,
} from "../src/lib/server/notifications";

const FULL_ENV: NotificationEnv = {
  RESEND_API_KEY: "re_test",
  NOTIFICATION_FROM_EMAIL: "clinic@example.com",
  TWILIO_ACCOUNT_SID: "ACxxxxxxxx",
  TWILIO_AUTH_TOKEN: "tok",
  TWILIO_SMS_FROM: "+15005550006",
  TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
};

describe("getNotificationConfig", () => {
  it("reports every channel as not configured when env is empty", () => {
    const cfg = getNotificationConfig({});
    expect(cfg.email.configured).toBe(false);
    expect(cfg.sms.configured).toBe(false);
    expect(cfg.whatsapp.configured).toBe(false);
    expect(cfg.email.missing).toEqual(["RESEND_API_KEY", "NOTIFICATION_FROM_EMAIL"]);
    expect(cfg.sms.missing).toEqual(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM"]);
    expect(cfg.whatsapp.missing).toEqual([
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_WHATSAPP_FROM",
    ]);
  });

  it("configures all channels when full env is present", () => {
    const cfg = getNotificationConfig(FULL_ENV);
    expect(cfg.email.configured).toBe(true);
    expect(cfg.sms.configured).toBe(true);
    expect(cfg.whatsapp.configured).toBe(true);
    expect(cfg.email.missing).toEqual([]);
    expect(cfg.sms.missing).toEqual([]);
    expect(cfg.whatsapp.missing).toEqual([]);
  });

  it("email needs both RESEND_API_KEY and NOTIFICATION_FROM_EMAIL", () => {
    const cfg = getNotificationConfig({ RESEND_API_KEY: "re_test" });
    expect(cfg.email.configured).toBe(false);
    expect(cfg.email.missing).toEqual(["NOTIFICATION_FROM_EMAIL"]);
  });

  it("Twilio channels need their From number even when SID+token exist", () => {
    const cfg = getNotificationConfig({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" });
    expect(cfg.sms.configured).toBe(false);
    expect(cfg.whatsapp.configured).toBe(false);
    expect(cfg.sms.missing).toEqual(["TWILIO_SMS_FROM"]);
    expect(cfg.whatsapp.missing).toEqual(["TWILIO_WHATSAPP_FROM"]);
  });
});

describe("resolveNotificationChannels", () => {
  const cfg = getNotificationConfig(FULL_ENV);

  it("email-only booking notifies by email", () => {
    expect(resolveNotificationChannels({ email: "a@b.com" }, cfg)).toEqual(["email"]);
  });

  it("phone-only booking prefers WhatsApp when configured", () => {
    expect(resolveNotificationChannels({ phone: "+92 300 0000000" }, cfg)).toEqual(["whatsapp"]);
  });

  it("phone-only booking falls back to SMS when WhatsApp is not configured", () => {
    const noWa = getNotificationConfig({ ...FULL_ENV, TWILIO_WHATSAPP_FROM: undefined });
    expect(resolveNotificationChannels({ phone: "+92 300 0000000" }, noWa)).toEqual(["sms"]);
  });

  it("notifies both channels when both phone and email are present", () => {
    expect(
      resolveNotificationChannels({ phone: "+92 300 0000000", email: "a@b.com" }, cfg),
    ).toEqual(["email", "whatsapp"]);
  });
});

describe("buildAppointmentMessages", () => {
  const msgs = buildAppointmentMessages({
    appointmentId: "id-123",
    patientName: "Ali",
    serviceName: "Homeopathy Consultation",
    date: "2026-09-01",
    time: "19:00",
    statusUrl: "https://clinic.example/appointment-status",
  });

  it("includes the Appointment ID, service, date, time and patient name", () => {
    for (const part of ["id-123", "Homeopathy Consultation", "2026-09-01", "19:00", "Ali"]) {
      expect(msgs.emailText).toContain(part);
      expect(msgs.smsText).toContain(part);
      expect(msgs.whatsappText).toContain(part);
    }
  });

  it("includes the status-check link when provided", () => {
    expect(msgs.smsText).toContain("https://clinic.example/appointment-status");
  });

  it("email subject names the Appointment ID", () => {
    expect(msgs.emailSubject).toContain("Appointment ID");
  });
});

describe("buildStatusChangeMessages", () => {
  const msgs = buildStatusChangeMessages({
    appointmentId: "id-456",
    patientName: "Ali",
    serviceName: "Physiotherapy",
    date: "2026-09-02",
    time: "20:00",
    statusUrl: "https://clinic.example/appointment-status",
    newStatus: "cancelled",
    previousStatus: "confirmed",
  });

  it("describes the new status and includes the Appointment ID + details", () => {
    expect(msgs.smsText).toContain("Your appointment has been cancelled.");
    for (const part of ["id-456", "Physiotherapy", "2026-09-02", "20:00"]) {
      expect(msgs.emailText).toContain(part);
      expect(msgs.whatsappText).toContain(part);
    }
  });

  it("includes the status-check link when provided", () => {
    expect(msgs.smsText).toContain("https://clinic.example/appointment-status");
  });

  it("email subject names the new status", () => {
    expect(msgs.emailSubject).toContain("cancelled");
  });

  it("has a phrase for every status value", () => {
    for (const status of ["pending", "confirmed", "rejected", "cancelled", "completed"] as const) {
      expect(typeof STATUS_CHANGE_PHRASES[status]).toBe("string");
      expect(STATUS_CHANGE_PHRASES[status].length).toBeGreaterThan(0);
    }
  });
});

describe("buildVideoReadyMessages", () => {
  const siteUrl = "https://your-domain.com";
  const vcNo = "VC-8F3K21";
  const joinUrl = `${siteUrl}/video/${vcNo}`;
  const msgs = buildVideoReadyMessages({
    appointmentId: "APT-7K4M92",
    patientName: "Ali",
    serviceName: "Online Video Consultation",
    date: "2099-01-01",
    time: "19:00",
    vcNo,
    joinUrl,
    statusUrl: `${siteUrl}/appointment-status`,
  });

  it("contains the complete absolute URL as plain text on its own line", () => {
    for (const text of [msgs.whatsappText, msgs.smsText, msgs.emailText]) {
      expect(text).toContain(`\nJoin your consultation:\n${joinUrl}\n`);
      expect(text).toContain(`\n${joinUrl}\n`);
    }
  });

  it("is not wrapped in Markdown or HTML", () => {
    for (const text of [msgs.whatsappText, msgs.smsText, msgs.emailText]) {
      expect(text).not.toMatch(/\[[^\]]*\]\(/);
      expect(text).not.toMatch(/<a\s+href/i);
      expect(text).not.toContain("Join the video call:");
    }
  });

  it("uses the configured public application URL (SITE_URL)", () => {
    expect(joinUrl).toBe(`${siteUrl}/video/${vcNo}`);
    expect(joinUrl.startsWith("https://")).toBe(true);
  });

  it("includes the VC code and excludes internal appointment UUIDs", () => {
    for (const text of [msgs.whatsappText, msgs.smsText, msgs.emailText]) {
      expect(text).toContain(vcNo);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }
  });

  it("opens with the ready line and closes with the click prompt", () => {
    expect(msgs.whatsappText).toContain("Your online video consultation is ready.");
    expect(msgs.whatsappText).toContain("Please click the link above to join your consultation.");
  });

  it("produces the same canonical URL as the admin Copy Link builder", () => {
    expect(videoJoinUrl(siteUrl, vcNo)).toBe(joinUrl);
    expect(videoJoinUrl("https://your-domain.com/", vcNo)).toBe(joinUrl);
  });
});

describe("sendAppointmentNotifications when nothing is configured", () => {
  it("returns not_configured for each requested channel and never calls a provider", async () => {
    const calls: unknown[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(input);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const results = await sendAppointmentNotifications(
        {
          appointmentId: "abc",
          patientName: "Ali",
          serviceName: "S",
          date: "2026-09-01",
          time: "19:00",
          phone: "+92 300 0000000",
          email: "a@b.com",
        },
        {},
      );

      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.status).toBe("not_configured");
        expect(r.detail).toContain("Missing:");
      }
      expect(calls).toHaveLength(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("sendAppointmentNotifications when configured", () => {
  it("posts to Resend (email) and Twilio (WhatsApp) with real payloads", async () => {
    const calls: Array<{ url: string; headers: HeadersInit; body: string }> = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      calls.push({
        url,
        headers: (init?.headers ?? {}) as HeadersInit,
        body: String(init?.body ?? ""),
      });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const results = await sendAppointmentNotifications(
        {
          appointmentId: "abc-123",
          patientName: "Ali",
          serviceName: "S",
          date: "2026-09-01",
          time: "19:00",
          statusUrl: "https://clinic.example/appointment-status",
          phone: "+923001234567",
          email: "a@b.com",
        },
        FULL_ENV,
      );

      expect(results.map((r) => r.channel)).toEqual(["email", "whatsapp"]);
      expect(results.every((r) => r.status === "sent")).toBe(true);

      const resend = calls.find((c) => c.url === "https://api.resend.com/emails");
      const twilio = calls.find((c) => c.url.includes("api.twilio.com"));

      expect(resend).toBeDefined();
      const resendBody = JSON.parse(resend!.body);
      expect(resendBody.to).toEqual(["a@b.com"]);
      expect(resendBody.from).toBe(FULL_ENV.NOTIFICATION_FROM_EMAIL);
      expect(resendBody.text).toContain("abc-123");

      expect(twilio).toBeDefined();
      expect(twilio!.url).toContain("/Accounts/ACxxxxxxxx/Messages.json");
      expect(twilio!.body).toContain("To=whatsapp%3A%2B923001234567");
      expect(twilio!.body).toContain("From=whatsapp%3A%2B14155238886");
      expect(twilio!.body).toContain("abc-123");
      const headers = twilio!.headers as Record<string, string>;
      expect(headers.Authorization).toMatch(/^Basic /);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("falls back to Twilio SMS for a phone-only booking when WhatsApp is not configured", async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : input.url);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const env: NotificationEnv = { ...FULL_ENV, TWILIO_WHATSAPP_FROM: undefined };
      const results = await sendAppointmentNotifications(
        {
          appointmentId: "xyz",
          patientName: "Ali",
          serviceName: "S",
          date: "2026-09-01",
          time: "19:00",
          phone: "+923001234567",
        },
        env,
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ channel: "sms", status: "sent" });
      expect(calls.some((u) => u.includes("api.twilio.com"))).toBe(true);
      expect(calls.some((u) => u.includes("api.resend.com"))).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("sendStatusChangeNotifications", () => {
  const details = {
    appointmentId: "id-789",
    patientName: "Sara",
    serviceName: "Homeopathy Consultation",
    date: "2026-09-03",
    time: "10:30",
    statusUrl: "https://clinic.example/appointment-status",
    newStatus: "confirmed" as const,
    previousStatus: "pending" as const,
  };

  it("returns not_configured for each requested channel when env is empty", async () => {
    const calls: unknown[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(input);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const results = await sendStatusChangeNotifications(
        { ...details, phone: "+92 300 0000000", email: "sara@b.com" },
        {},
      );
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === "not_configured")).toBe(true);
      expect(calls).toHaveLength(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("posts the status-change message to Resend and Twilio", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === "string" ? input : input.url,
        body: String(init?.body ?? ""),
      });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const results = await sendStatusChangeNotifications(
        { ...details, phone: "+923001234567", email: "sara@b.com" },
        FULL_ENV,
      );

      expect(results.map((r) => r.channel)).toEqual(["email", "whatsapp"]);
      expect(results.every((r) => r.status === "sent")).toBe(true);

      const resend = calls.find((c) => c.url === "https://api.resend.com/emails");
      const resendBody = JSON.parse(resend!.body);
      expect(resendBody.text).toContain("has been confirmed by the clinic");
      expect(resendBody.text).toContain("id-789");

      const twilio = calls.find((c) => c.url.includes("api.twilio.com"));
      const twilioBody = decodeURIComponent(twilio!.body).replace(/\+/g, " ");
      expect(twilioBody).toContain("has been confirmed by the clinic");
      expect(twilioBody).toContain("id-789");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
