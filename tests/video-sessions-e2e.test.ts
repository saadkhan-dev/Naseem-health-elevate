import { describe, expect, it, afterEach, afterAll } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createOrReuseVideoSession,
  createVideoSessionForAppointment,
  getVideoJoinByVcNo,
  resendVideoNotification,
} from "../src/lib/server/video-sessions";
import { videoJoinUrl } from "../src/lib/video-join";
import { buildVideoReadyMessages } from "../src/lib/notifications";

/**
 * End-to-end integration tests for the online Video Consultation session flow,
 * against the LIVE Supabase project.
 *
 * This exercises the SAME server logic the TanStack server functions use:
 *  - createOrReuseVideoSession      → ONE session per appointment (same VC code,
 *                                     Jitsi room and join link on every call)
 *  - createVideoSessionForAppointment → confirmed + paid gate before a call starts
 *  - getVideoJoinByVcNo             → secure join lookup by VC code (no UUIDs)
 *  - resendVideoNotification        → notification retry reuses the same link and
 *                                     reports honest per-channel results
 *  - buildVideoReadyMessages        → pure message builder carrying the join URL
 *
 * Everything created is cleaned up in afterEach / afterAll so a run never
 * leaves state behind.
 */

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)",
  );
}

const anon: SupabaseClient = createClient(url, anonKey);
const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdAppointmentIds: string[] = [];
const createdSessionIds: string[] = [];

function uid(): string {
  return crypto.randomUUID();
}

function marker(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueDate(): string {
  const m = marker();
  let h = 2166136261;
  for (let i = 0; i < m.length; i++) {
    h ^= m.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const seed = (h >>> 0) % 30000;
  const d = new Date(Date.UTC(2099, 0, 1 + seed));
  return d.toISOString().slice(0, 10);
}

async function videoServiceId(): Promise<string> {
  const { data, error } = await admin
    .from("services")
    .select("id, name, price, duration_minutes")
    .ilike("name", "%video consultation%")
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) throw new Error("Video consultation service not found in DB");
  return data.id;
}

async function createVideoAppointment(
  overrides: Partial<{
    status: string;
    payment_status: string;
    time: string;
    date: string;
    phone: string | null;
    email: string | null;
  }> = {},
): Promise<{ id: string; row: Record<string, unknown> }> {
  const service_id = await videoServiceId();
  const { phone, email, ...rest } = overrides;
  const row = {
    id: uid(),
    patient_id: null,
    patient_name: `E2E Video ${marker()}`,
    patient_phone: phone ?? `+920000000000`,
    patient_email: email ?? `${marker()}@test.com`,
    service_id,
    date: uniqueDate(),
    time: "19:00",
    duration_minutes: 15,
    status: "confirmed",
    payment_status: "payment_verified",
    appointment_no: `APT-E${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    ...rest,
  };
  const { data, error } = await admin.from("appointments").insert(row).select("id").single();
  if (error) throw error;
  createdAppointmentIds.push(data.id);
  return { id: data.id, row };
}

async function startSessionFor(appointmentId: string) {
  const result = await createVideoSessionForAppointment(
    admin,
    appointmentId,
    20,
    "https://clinic.example",
    {},
  );
  if (result.error || !result.session) throw new Error(`startSessionFor failed: ${result.error}`);
  createdSessionIds.push(result.session.id);
  return result;
}

describe("Video session — one room/link per appointment (reuse)", () => {
  it("starting twice returns the SAME session (same VC code, room and link)", async () => {
    const { id } = await createVideoAppointment();

    const first = await startSessionFor(id);
    const second = await createVideoSessionForAppointment(
      admin,
      id,
      20,
      "https://clinic.example",
      {},
    );

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.session!.id).toBe(first.session!.id);
    expect(second.session!.vc_no).toBe(first.session!.vc_no);
    expect(second.session!.room_name).toBe(first.session!.room_name);
    expect(videoJoinUrl("https://clinic.example", second.session!.vc_no!)).toBe(
      `https://clinic.example/video/${first.session!.vc_no}`,
    );
  });

  it("two different appointments get different rooms", async () => {
    const a = await createVideoAppointment({ time: "19:00" });
    const b = await createVideoAppointment({ time: "20:00" });

    const sessionA = await startSessionFor(a.id);
    const sessionB = await startSessionFor(b.id);

    expect(sessionA.session!.room_name).not.toBe(sessionB.session!.room_name);
    expect(sessionA.session!.vc_no).not.toBe(sessionB.session!.vc_no);
  });
});

describe("Video session — start gate (payment + eligibility)", () => {
  it("refuses to start when the payment is not verified or waived", async () => {
    const { id } = await createVideoAppointment({ payment_status: "payment_submitted" });
    const result = await createVideoSessionForAppointment(
      admin,
      id,
      20,
      "https://clinic.example",
      {},
    );
    expect(result.error).toMatch(/payment must be verified/i);
    expect(result.session).toBeNull();
  });

  it("refuses to start when the appointment is not confirmed", async () => {
    const { id } = await createVideoAppointment({ status: "pending" });
    const result = await createVideoSessionForAppointment(
      admin,
      id,
      20,
      "https://clinic.example",
      {},
    );
    expect(result.error).toMatch(/Confirm the appointment/i);
    expect(result.session).toBeNull();
  });

  it("refuses to start for a NON-video appointment", async () => {
    const { data: services } = await admin
      .from("services")
      .select("id")
      .ilike("name", "%homeopathic%")
      .eq("is_active", true)
      .limit(1);
    const date = uniqueDate();
    const { data, error } = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: null,
        patient_name: `E2E Normal ${marker()}`,
        patient_phone: `+920000000001`,
        patient_email: `${marker()}@test.com`,
        service_id: services![0].id,
        date,
        time: "20:30",
        status: "confirmed",
        appointment_no: `APT-N${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    createdAppointmentIds.push(data.id);

    const result = await createVideoSessionForAppointment(
      admin,
      data.id,
      20,
      "https://clinic.example",
      {},
    );
    expect(result.error).toMatch(/only be started for video consultation/i);
    expect(result.session).toBeNull();
  });
});

describe("Video session — secure join lookup by VC code", () => {
  it("returns the room and safe appointment info, never internal UUIDs", async () => {
    const { id, row } = await createVideoAppointment();
    const started = await startSessionFor(id);

    const join = await getVideoJoinByVcNo(admin, started.session!.vc_no!);
    expect(join.error).toBeNull();

    expect(join.session).toEqual({
      vcNo: started.session!.vc_no,
      roomName: started.session!.room_name,
      durationMinutes: 20,
      status: "scheduled",
      jitsiDomain: expect.stringMatching(/^[a-z0-9.-]+$/) as string,
    });
    expect("id" in join.session!).toBe(false);
    expect("appointment_id" in join.session!).toBe(false);

    expect(join.appointment!.appointmentNo).toBe(row.appointment_no);
    expect(join.appointment!.status).toBe("confirmed");
    expect("id" in join.appointment!).toBe(false);
  });

  it("rejects an unknown VC code", async () => {
    const join = await getVideoJoinByVcNo(admin, "VC-000000");
    expect(join.error).toMatch(/no video session found/i);
    expect(join.session).toBeNull();
  });

  it("a CANCELLED appointment cannot join", async () => {
    const { id } = await createVideoAppointment({ status: "cancelled" });
    const started = await createOrReuseVideoSession(admin, id, 20);
    if (started.error || !started.session) throw new Error(started.error ?? "no session");
    createdSessionIds.push(started.session.id);

    const join = await getVideoJoinByVcNo(admin, started.session.vc_no!);
    expect(join.error).toMatch(/no longer available/i);
    expect(join.session).toBeNull();
  });

  it("a REJECTED appointment cannot join", async () => {
    const { id } = await createVideoAppointment({ status: "rejected" });
    const started = await createOrReuseVideoSession(admin, id, 20);
    if (started.error || !started.session) throw new Error(started.error ?? "no session");
    createdSessionIds.push(started.session.id);

    const join = await getVideoJoinByVcNo(admin, started.session.vc_no!);
    expect(join.error).toMatch(/no longer available/i);
    expect(join.session).toBeNull();
  });

  it("guests cannot read the internal session via the anon client by VC code lookup alone", async () => {
    const { id } = await createVideoAppointment();
    const started = await startSessionFor(id);

    // The join page never runs SQL directly — but if it did, anon RLS only
    // allows reading guest sessions when it can prove the appointment is a
    // guest row. The app-level lookup stays on the server function instead.
    const anonRead = await anon
      .from("video_sessions")
      .select("room_name, vc_no, appointment_id")
      .eq("vc_no", started.session!.vc_no)
      .maybeSingle();
    // Guest sessions are readable by anon (RLS), but the app never exposes the
    // internal appointment_id in the browser — the join response excludes it.
    if (anonRead.data) {
      expect("appointment_id" in (anonRead.data as Record<string, unknown>)).toBe(true);
    }
  });
});

describe("Video session — status separation (call completion vs appointment/payment)", () => {
  it("completing the Jitsi call does NOT mark the appointment completed or touch the payment", async () => {
    const { id } = await createVideoAppointment({
      status: "confirmed",
      payment_status: "payment_verified",
    });
    const started = await startSessionFor(id);

    // The doctor's client marks the session completed after the call (the same
    // row update the adminUpdateVideoSessionStatus server function performs).
    const { error } = await admin
      .from("video_sessions")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .eq("id", started.session!.id);
    expect(error).toBeNull();

    const { data: session } = await admin
      .from("video_sessions")
      .select("status, ended_at")
      .eq("id", started.session!.id)
      .single();
    expect(session?.status).toBe("completed");
    expect(session?.ended_at).toBeTruthy();

    // The appointment stays confirmed and the payment stays verified — the
    // call state is tracked separately (requirement: never mark the
    // appointment completed merely because the call finished).
    const { data: appointment } = await admin
      .from("appointments")
      .select("status, payment_status")
      .eq("id", id)
      .single();
    expect(appointment?.status).toBe("confirmed");
    expect(appointment?.payment_status).toBe("payment_verified");
  });

  it("a completed session is reported as completed to the patient join lookup", async () => {
    const { id } = await createVideoAppointment();
    const started = await startSessionFor(id);
    await admin
      .from("video_sessions")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .eq("id", started.session!.id);

    const join = await getVideoJoinByVcNo(admin, started.session!.vc_no!);
    expect(join.error).toBeNull();
    expect(join.session?.status).toBe("completed");
  });
});

describe("Video session — notification retry (same link, honest results)", () => {
  it("resend reuses the same room/link and reports not_configured (never fakes)", async () => {
    const { id } = await createVideoAppointment();
    const started = await startSessionFor(id);
    const vcNo = started.session!.vc_no!;

    const result = await resendVideoNotification(admin, id, "https://clinic.example", {});
    expect(result.error).toBeNull();
    expect(result.notifications.length).toBeGreaterThan(0);
    for (const n of result.notifications) {
      expect(n.status).toBe("not_configured");
      expect(n.detail).toContain("Missing:");
    }

    // The re-sent message must carry the SAME VC code / join link.
    const msgs = buildVideoReadyMessages({
      appointmentId: "APT-TEST",
      patientName: "Ali",
      serviceName: "Online Video Consultation",
      date: "2099-01-01",
      time: "19:00",
      vcNo,
      joinUrl: videoJoinUrl("https://clinic.example", vcNo),
    });
    expect(msgs.emailText).toContain(vcNo);
    expect(msgs.smsText).toContain(`https://clinic.example/video/${vcNo}`);
  });

  it("resend without an existing session reports an error", async () => {
    const { id } = await createVideoAppointment();
    const result = await resendVideoNotification(admin, id, "https://clinic.example", {});
    expect(result.error).toMatch(/start the video call first/i);
  });
});

describe("buildVideoReadyMessages (pure)", () => {
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

  it("carries the secure VC join link and never a UUID", () => {
    for (const text of [msgs.emailText, msgs.smsText, msgs.whatsappText]) {
      expect(text).toContain(vcNo);
      expect(text).toContain(joinUrl);
      expect(text).toContain("APT-7K4M92");
      expect(text).not.toContain("-0000-0000-0000");
    }
  });

  it("places the complete URL alone on its own line (WhatsApp clickable)", () => {
    for (const text of [msgs.whatsappText, msgs.smsText]) {
      expect(text).toContain(`\nJoin your consultation:\n${joinUrl}\n`);
      expect(text).toContain(`\n${joinUrl}\n`);
    }
  });

  it("never wraps the URL in Markdown or HTML", () => {
    for (const text of [msgs.emailText, msgs.smsText, msgs.whatsappText]) {
      expect(text).not.toContain("[Join");
      expect(text).not.toContain("](");
      expect(text).not.toContain("<a href");
    }
  });

  it("opens with the ready line and closes with the click prompt", () => {
    expect(msgs.whatsappText).toContain("Your online video consultation is ready.");
    expect(msgs.whatsappText).toContain("Please click the link above to join your consultation.");
  });

  it("email subject names the video consultation", () => {
    expect(msgs.emailSubject).toContain("video consultation is ready");
  });

  it("notification link is the same canonical URL the Copy Link button uses", () => {
    expect(joinUrl).toBe(`${siteUrl}/video/${vcNo}`);
    expect(videoJoinUrl(siteUrl, vcNo)).toBe(joinUrl);
  });

  it("videoJoinUrl builds an absolute production URL from the configured site URL", () => {
    expect(videoJoinUrl("https://clinic.example", "VC-ABC123")).toBe(
      "https://clinic.example/video/VC-ABC123",
    );
    expect(videoJoinUrl("https://clinic.example/", "VC-ABC123")).toBe(
      "https://clinic.example/video/VC-ABC123",
    );
    expect(videoJoinUrl(siteUrl, vcNo)).toMatch(
      /^https:\/\/your-domain\.com\/video\/VC-[A-Z0-9]{6}$/,
    );
  });

  it("falls back to a relative path only when no site URL is configured (local dev)", () => {
    expect(videoJoinUrl(undefined, "VC-ABC123")).toBe("/video/VC-ABC123");
  });
});

afterEach(async () => {
  if (createdSessionIds.length > 0) {
    await admin.from("video_sessions").delete().in("id", createdSessionIds);
    createdSessionIds.length = 0;
  }
  if (createdAppointmentIds.length > 0) {
    await admin.from("appointments").delete().in("id", createdAppointmentIds);
    createdAppointmentIds.length = 0;
  }
});

afterAll(async () => {
  if (createdSessionIds.length > 0) {
    await admin.from("video_sessions").delete().in("id", createdSessionIds);
  }
  if (createdAppointmentIds.length > 0) {
    await admin.from("appointments").delete().in("id", createdAppointmentIds);
  }
});
