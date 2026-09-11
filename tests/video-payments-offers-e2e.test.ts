import { describe, expect, it, afterEach, afterAll } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  resolveVideoOffer,
  recordOfferUsage,
  releaseOfferUsage,
  hasUsedAnyOffer,
  getVisibleVideoOffers,
} from "../src/lib/server/video-offers";
import { computeOfferAmount } from "../src/lib/video-offer-types";
import {
  submitVideoPaymentForAppointment,
  setVideoPaymentStatus,
} from "../src/lib/server/video-payments";

/**
 * End-to-end integration tests for the Video Consultation + Payments + Offers
 * system, against the LIVE Supabase project.
 *
 * This exercises the SAME server logic the TanStack server functions use:
 *  - server/video-offers.ts      → offer resolution, usage tracking
 *  - server/video-payments.ts    → payment submission, admin verify/reject
 *  - video-offer-types.ts        → pure amount math (also used by the admin UI)
 *  - the DB constraints          → exclusion guard, RLS, CHECK on payment_status
 *
 * Everything created (offers, appointments) is cleaned up in afterAll so a run
 * never leaves state behind. Video offers are created/deleted per-test so the
 * resolver never sees leftovers, and the suite is deterministic.
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

const createdOfferIds: string[] = [];
const createdAppointmentIds: string[] = [];
const createdUserIds: string[] = [];

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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function createAuthUser(email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function createProfile(userId: string, role: "admin" | "doctor" | "patient") {
  const { error } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: `E2E ${role}`,
      phone: `+920000000001`,
      role,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function signInAs(email: string, password: string) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

async function videoServiceId(): Promise<string> {
  const { data, error } = await admin
    .from("services")
    .select("id, price, duration_minutes")
    .ilike("name", "%video consultation%")
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) throw new Error("Video consultation service not found in DB");
  return data.id;
}

async function createOffer(
  overrides: Partial<{
    title: string;
    description: string;
    offer_type: "waive" | "percent" | "fixed";
    discount_percent: number | null;
    discount_amount: number | null;
    start_date: string;
    end_date: string | null;
    is_active: boolean;
    eligibility: "all" | "new_patients";
    terms: string | null;
  }> = {},
) {
  const row = {
    title: `E2E Offer ${marker()}`,
    description: "Temporary e2e offer",
    offer_type: "waive" as const,
    discount_percent: null,
    discount_amount: null,
    start_date: todayStr(),
    end_date: null,
    is_active: true,
    eligibility: "all" as const,
    terms: null,
    ...overrides,
  };
  const { data, error } = await admin
    .from("video_offers")
    .insert(row)
    .select(
      "id, title, offer_type, discount_percent, discount_amount, start_date, end_date, is_active, eligibility, description, terms",
    )
    .single();
  if (error) throw error;
  createdOfferIds.push(data.id);
  return data;
}

async function createVideoAppointment(
  overrides: Partial<{
    status: string;
    payment_status: string;
    payment_amount: number | null;
    offer_id: string | null;
    time: string;
    date: string;
    phone: string | null;
    email: string | null;
  }> = {},
) {
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
    status: "pending",
    payment_status: "payment_pending",
    payment_amount: 500,
    offer_id: null,
    appointment_no: `APT-E${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    ...rest,
  };
  const { data, error } = await admin
    .from("appointments")
    .insert(row)
    .select(
      "id, status, payment_status, payment_amount, offer_id, date, time, patient_phone, patient_email, services:service_id (name)",
    )
    .single();
  if (error) throw error;
  createdAppointmentIds.push(data.id);
  return { row, created: data };
}

async function activeMethodId(): Promise<string> {
  const { data, error } = await admin
    .from("payment_methods")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1)
    .single();
  if (error || !data) throw new Error("No active payment method in DB");
  return data.id;
}

describe("Video consultation service pricing (live DB)", () => {
  it("has one active video consultation service at Rs. 500 / 15 minutes", async () => {
    const { data, error } = await admin
      .from("services")
      .select("id, name, price, duration_minutes, is_active")
      .ilike("name", "%video consultation%")
      .eq("is_active", true);
    expect(error).toBeNull();
    const videos = data ?? [];
    expect(videos.length).toBeGreaterThan(0);
    for (const v of videos) {
      expect(v.price).toBe(500);
      expect(v.duration_minutes).toBe(15);
    }
  });
});

describe("computeOfferAmount (pure math — shared with admin UI preview)", () => {
  it("waive → 0 (consultation free)", () => {
    expect(
      computeOfferAmount(
        { offer_type: "waive", discount_percent: null, discount_amount: null },
        500,
      ),
    ).toBe(0);
  });

  it("percent 25% off → 375", () => {
    expect(
      computeOfferAmount(
        { offer_type: "percent", discount_percent: 25, discount_amount: null },
        500,
      ),
    ).toBe(375);
  });

  it("percent 100% off → 0", () => {
    expect(
      computeOfferAmount(
        { offer_type: "percent", discount_percent: 100, discount_amount: null },
        500,
      ),
    ).toBe(0);
  });

  it("percent clamps to [0, price] (150% → 0)", () => {
    expect(
      computeOfferAmount(
        { offer_type: "percent", discount_percent: 150, discount_amount: null },
        500,
      ),
    ).toBe(0);
  });

  it("fixed Rs. 200 off → 300", () => {
    expect(
      computeOfferAmount(
        { offer_type: "fixed", discount_percent: null, discount_amount: 200 },
        500,
      ),
    ).toBe(300);
  });

  it("fixed discount larger than price → 0 (never negative)", () => {
    expect(
      computeOfferAmount(
        { offer_type: "fixed", discount_percent: null, discount_amount: 700 },
        500,
      ),
    ).toBe(0);
  });
});

describe("resolveVideoOffer (live DB)", () => {
  it("returns the full price when no offer applies", async () => {
    // A future-dated, an inactive and an already-expired offer must all be ignored.
    await createOffer({ offer_type: "waive", start_date: "2099-01-01" });
    await createOffer({ offer_type: "waive", is_active: false });
    await createOffer({ offer_type: "waive", end_date: yesterdayStr() });
    const decision = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone: `+9200000000${Math.floor(Math.random() * 9)}`,
      email: `${marker()}@test.com`,
      patientName: "E2E No Offer",
    });
    expect(decision).toEqual({ amount: 500, offer_id: null, offer_title: null });
  });

  it("applies a waive offer → amount 0", async () => {
    const offer = await createOffer({ offer_type: "waive" });
    const decision = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone: `+9200000000${Math.floor(Math.random() * 9)}`,
      email: `${marker()}@test.com`,
      patientName: "E2E Waive",
    });
    expect(decision.amount).toBe(0);
    expect(decision.offer_id).toBe(offer.id);
    expect(decision.offer_title).toBe(offer.title);
  });

  it("applies a percent offer", async () => {
    const offer = await createOffer({ offer_type: "percent", discount_percent: 25 });
    const decision = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone: `+9200000000${Math.floor(Math.random() * 9)}`,
      email: `${marker()}@test.com`,
      patientName: "E2E Percent",
    });
    expect(decision.amount).toBe(375);
    expect(decision.offer_id).toBe(offer.id);
  });

  it("applies a fixed offer", async () => {
    const offer = await createOffer({ offer_type: "fixed", discount_amount: 200 });
    const decision = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone: `+9200000000${Math.floor(Math.random() * 9)}`,
      email: `${marker()}@test.com`,
      patientName: "E2E Fixed",
    });
    expect(decision.amount).toBe(300);
    expect(decision.offer_id).toBe(offer.id);
  });

  it("picks the newest applicable offer first", async () => {
    await createOffer({ offer_type: "percent", discount_percent: 10 });
    const newest = await createOffer({ offer_type: "waive" });
    const decision = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone: `+9200000000${Math.floor(Math.random() * 9)}`,
      email: `${marker()}@test.com`,
      patientName: "E2E Newest",
    });
    expect(decision.offer_id).toBe(newest.id);
    expect(decision.amount).toBe(0);
  });

  it("a new_patients offer applies for a fresh patient", async () => {
    const offer = await createOffer({ eligibility: "new_patients" });
    const decision = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone: `+9200000000${Math.floor(Math.random() * 9)}`,
      email: `${marker()}@test.com`,
      patientName: "E2E New Patient",
    });
    expect(decision.offer_id).toBe(offer.id);
  });

  it("a new_patients offer is skipped for a patient who already used one", async () => {
    const offer = await createOffer({ eligibility: "new_patients" });
    const phone = `+9200000000${Math.floor(Math.random() * 9)}`;
    const email = `${marker()}@test.com`;
    const first = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone,
      email,
      patientName: "E2E Repeat",
    });
    expect(first.offer_id).toBe(offer.id);

    const appt = await createVideoAppointment({
      phone,
      email,
      payment_amount: 0,
      offer_id: offer.id,
      payment_status: "waived",
    });
    await recordOfferUsage(admin, {
      offer_id: offer.id,
      appointment_id: appt.created.id,
      patientName: "E2E Repeat",
      phone,
      email,
    });

    const second = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone,
      email,
      patientName: "E2E Repeat",
    });
    expect(second.offer_id).toBeNull();
    expect(second.amount).toBe(500);
  });

  it("releasing the usage lets the patient use a new_patients offer again", async () => {
    const offer = await createOffer({ eligibility: "new_patients" });
    const phone = `+9200000000${Math.floor(Math.random() * 9)}`;
    const email = `${marker()}@test.com`;
    const appt = await createVideoAppointment({
      phone,
      email,
      payment_amount: 0,
      offer_id: offer.id,
      payment_status: "waived",
    });
    await recordOfferUsage(admin, {
      offer_id: offer.id,
      appointment_id: appt.created.id,
      patientName: "E2E Released",
      phone,
      email,
    });
    expect(
      (
        await resolveVideoOffer(admin, {
          servicePrice: 500,
          phone,
          email,
          patientName: "E2E Released",
        })
      ).offer_id,
    ).toBeNull();

    await releaseOfferUsage(admin, appt.created.id);
    const again = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone,
      email,
      patientName: "E2E Released",
    });
    expect(again.offer_id).toBe(offer.id);
  });
});

describe("getVisibleVideoOffers — DISPLAY vs PRICE (live DB)", () => {
  it("returns an upcoming offer (future start date) for public display", async () => {
    const upcoming = await createOffer({
      offer_type: "percent",
      discount_percent: 25,
      start_date: "2099-01-01",
      end_date: "2099-12-31",
    });

    const visible = await getVisibleVideoOffers(admin);
    const shown = visible.find((o) => o.id === upcoming.id);

    // A) DISPLAY: an upcoming offer is visible before its start date...
    expect(shown).toBeDefined();
    expect(shown?.start_date).toBe("2099-01-01");

    // ...but B) PRICE: it must NOT discount the fee yet (the full price stays).
    const decision = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone: `+9200000000${Math.floor(Math.random() * 9)}`,
      email: `${marker()}@test.com`,
      patientName: "E2E Upcoming Display",
    });
    expect(decision.amount).toBe(500);
    expect(decision.offer_id).toBeNull();
  });

  it("hides an already-expired offer from public display (end date exclusive after the day ends)", async () => {
    const expired = await createOffer({ offer_type: "waive", end_date: yesterdayStr() });

    const visible = await getVisibleVideoOffers(admin);
    expect(visible.find((o) => o.id === expired.id)).toBeUndefined();
  });

  it("hides an offer the admin deactivated", async () => {
    const inactive = await createOffer({ offer_type: "waive", is_active: false });

    const visible = await getVisibleVideoOffers(admin);
    expect(visible.find((o) => o.id === inactive.id)).toBeUndefined();
  });
});

describe("Offer usage tracking", () => {
  it("hasUsedAnyOffer is false before any usage and true after (by phone or email)", async () => {
    const phone = `+9200000000${Math.floor(Math.random() * 9)}`;
    const email = `${marker()}@test.com`;
    const offer = await createOffer({ offer_type: "waive" });
    const appt = await createVideoAppointment({
      phone,
      email,
      payment_amount: 0,
      offer_id: offer.id,
      payment_status: "waived",
    });

    expect(await hasUsedAnyOffer(admin, phone, email)).toBe(false);

    await recordOfferUsage(admin, {
      offer_id: offer.id,
      appointment_id: appt.created.id,
      patientName: "E2E Usage",
      phone,
      email,
    });

    expect(await hasUsedAnyOffer(admin, phone, email)).toBe(true);
    expect(await hasUsedAnyOffer(admin, phone, null)).toBe(true);
    expect(await hasUsedAnyOffer(admin, null, email)).toBe(true);
    expect(await hasUsedAnyOffer(admin, "+920000000099", email)).toBe(true);
    expect(await hasUsedAnyOffer(admin, phone, "other@test.com")).toBe(true);
    expect(await hasUsedAnyOffer(admin, "+920000000099", "other@test.com")).toBe(false);

    await releaseOfferUsage(admin, appt.created.id);
    expect(await hasUsedAnyOffer(admin, phone, email)).toBe(false);
  });
});

describe("Video booking payment snapshot (DB layer)", () => {
  it("stores the resolved amount, offer and status on the appointment row", async () => {
    const offer = await createOffer({ offer_type: "waive" });
    const phone = `+9200000000${Math.floor(Math.random() * 9)}`;
    const email = `${marker()}@test.com`;
    const decision = await resolveVideoOffer(admin, {
      servicePrice: 500,
      phone,
      email,
      patientName: "E2E Snapshot",
    });
    expect(decision.amount).toBe(0);

    const { created } = await createVideoAppointment({
      phone,
      email,
      payment_status: "waived",
      payment_amount: decision.amount,
      offer_id: decision.offer_id,
    });

    const { data: row } = await admin
      .from("appointments")
      .select("payment_status, payment_amount, offer_id, video_offers:offer_id (title)")
      .eq("id", created.id)
      .single();
    expect(row?.payment_status).toBe("waived");
    expect(row?.payment_amount).toBe(0);
    expect(row?.offer_id).toBe(offer.id);
    const offerJoin = row?.video_offers as unknown as { title: string | null } | null;
    expect(offerJoin?.title).toBe(offer.title);
  });

  it("anon guest can READ the payment status of their own consultation but cannot MODIFY it (RLS)", async () => {
    const phone = `+9200000000${Math.floor(Math.random() * 9)}`;
    const email = `${marker()}@test.com`;
    const { created } = await createVideoAppointment({ phone, email, payment_amount: 500 });

    const read = await anon
      .from("appointments")
      .select("payment_status, payment_amount")
      .eq("id", created.id)
      .single();
    expect(read.error).toBeNull();
    expect(read.data?.payment_status).toBe("payment_pending");
    expect(read.data?.payment_amount).toBe(500);

    // PostgREST reports an RLS-filtered UPDATE as a no-op (error null, 0 rows),
    // so the assertion is on the DB value: the payment must NOT have changed.
    await anon
      .from("appointments")
      .update({ payment_status: "payment_verified" })
      .eq("id", created.id);
    const { data: after } = await admin
      .from("appointments")
      .select("payment_status")
      .eq("id", created.id)
      .single();
    expect(after?.payment_status).toBe("payment_pending");
  });
});

describe("submitVideoPaymentForAppointment (patient submits proof)", () => {
  it("records the method, reference, payer name and submitted_at", async () => {
    const methodId = await activeMethodId();
    const phone = `+9200000000${Math.floor(Math.random() * 9)}`;
    const email = `${marker()}@test.com`;
    const { created } = await createVideoAppointment({ phone, email, payment_amount: 500 });

    const result = await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    expect(result.error).toBeNull();

    const { data: row } = await admin
      .from("appointments")
      .select(
        "payment_status, payment_method, payment_reference, payment_payer_name, payment_submitted_at, payment_verified_at",
      )
      .eq("id", created.id)
      .single();
    expect(row?.payment_status).toBe("payment_submitted");
    expect(row?.payment_method).toBeTruthy();
    expect(row?.payment_reference).toMatch(/^TXN-/);
    expect(row?.payment_payer_name).toBe("E2E Payer");
    expect(row?.payment_submitted_at).toBeTruthy();
    expect(row?.payment_verified_at).toBeNull();
  });

  it("rejects a second submission after one is already submitted", async () => {
    const methodId = await activeMethodId();
    const { created } = await createVideoAppointment();
    await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    const second = await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    expect(second.error).toMatch(/already been submitted/i);
  });

  it("rejects a payment on a waived (free) consultation", async () => {
    const methodId = await activeMethodId();
    const { created } = await createVideoAppointment({
      payment_status: "waived",
      payment_amount: 0,
    });
    const result = await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    expect(result.error).toMatch(/no payment is needed/i);
  });

  it("rejects a payment on a cancelled appointment", async () => {
    const methodId = await activeMethodId();
    const { created } = await createVideoAppointment({ status: "cancelled" });
    const result = await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    expect(result.error).toMatch(/no longer active/i);
  });

  it("rejects an unknown/inactive payment method", async () => {
    const { created } = await createVideoAppointment();
    const result = await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId: uid(),
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    expect(result.error).toMatch(/not available/i);
  });

  it("only applies to video consultations (a normal appointment is rejected)", async () => {
    const { data: services } = await admin
      .from("services")
      .select("id, name")
      .ilike("name", "%homeopathic%")
      .eq("is_active", true)
      .limit(1);
    const service = services?.[0];
    const date = uniqueDate();
    const { data, error } = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: null,
        patient_name: `E2E Normal ${marker()}`,
        patient_phone: `+920000000001`,
        patient_email: `${marker()}@test.com`,
        service_id: service!.id,
        date,
        time: "20:00",
        status: "pending",
        appointment_no: `APT-N${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    createdAppointmentIds.push(data.id);

    const methodId = await activeMethodId();
    const result = await submitVideoPaymentForAppointment(admin, {
      appointmentId: data.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    expect(result.error).toMatch(/only applies to video consultations/i);
  });
});

describe("setVideoPaymentStatus (admin verify / reject / refund)", () => {
  it("verifies a submitted payment and stamps verified_at", async () => {
    const methodId = await activeMethodId();
    const { created } = await createVideoAppointment();
    await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });

    const result = await setVideoPaymentStatus(admin, {
      appointmentId: created.id,
      status: "payment_verified",
    });
    expect(result.error).toBeNull();

    const { data: row } = await admin
      .from("appointments")
      .select("payment_status, payment_verified_at")
      .eq("id", created.id)
      .single();
    expect(row?.payment_status).toBe("payment_verified");
    expect(row?.payment_verified_at).toBeTruthy();
  });

  it("rejects (payment_failed) a submitted payment", async () => {
    const methodId = await activeMethodId();
    const { created } = await createVideoAppointment();
    await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });

    const result = await setVideoPaymentStatus(admin, {
      appointmentId: created.id,
      status: "payment_failed",
    });
    expect(result.error).toBeNull();

    const { data: row } = await admin
      .from("appointments")
      .select("payment_status")
      .eq("id", created.id)
      .single();
    expect(row?.payment_status).toBe("payment_failed");

    // A rejected payment can be resubmitted by the patient.
    const resubmit = await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    expect(resubmit.error).toBeNull();
  });

  it("marks a payment as refunded", async () => {
    const methodId = await activeMethodId();
    const { created } = await createVideoAppointment();
    await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });

    // Verify the payment first
    const verifyResult = await setVideoPaymentStatus(admin, {
      appointmentId: created.id,
      status: "payment_verified",
    });
    expect(verifyResult.error).toBeNull();

    // Now refund the verified payment
    const result = await setVideoPaymentStatus(admin, {
      appointmentId: created.id,
      status: "refunded",
    });
    expect(result.error).toBeNull();

    const { data: row } = await admin
      .from("appointments")
      .select("payment_status")
      .eq("id", created.id)
      .single();
    expect(row?.payment_status).toBe("refunded");
  });

  it("refuses a duplicate refund (a refunded payment cannot be refunded again)", async () => {
    const methodId = await activeMethodId();
    const { created } = await createVideoAppointment();
    await submitVideoPaymentForAppointment(admin, {
      appointmentId: created.id,
      methodId,
      reference: `TXN-${marker()}`,
      payerName: "E2E Payer",
    });
    await setVideoPaymentStatus(admin, {
      appointmentId: created.id,
      status: "payment_verified",
    });

    const first = await setVideoPaymentStatus(admin, {
      appointmentId: created.id,
      status: "refunded",
    });
    expect(first.error).toBeNull();

    const second = await setVideoPaymentStatus(admin, {
      appointmentId: created.id,
      status: "refunded",
    });
    expect(second.error).toMatch(/only verified/i);

    const { data: row } = await admin
      .from("appointments")
      .select("payment_status, payment_reference")
      .eq("id", created.id)
      .single();
    expect(row?.payment_status).toBe("refunded");
    expect(row?.payment_reference).toMatch(/^TXN-/);
  });

  it("refuses to refund a never-paid consultation (pending or waived)", async () => {
    const pending = await createVideoAppointment({ payment_status: "payment_pending" });
    const pendingRefund = await setVideoPaymentStatus(admin, {
      appointmentId: pending.created.id,
      status: "refunded",
    });
    expect(pendingRefund.error).toMatch(/only verified/i);

    const waived = await createVideoAppointment({ payment_status: "waived", payment_amount: 0 });
    const waivedRefund = await setVideoPaymentStatus(admin, {
      appointmentId: waived.created.id,
      status: "refunded",
    });
    expect(waivedRefund.error).toMatch(/only verified/i);

    // Neither state was changed by the failed refund attempt.
    const pendingRow = await admin
      .from("appointments")
      .select("payment_status")
      .eq("id", pending.created.id)
      .single();
    expect(pendingRow.data?.payment_status).toBe("payment_pending");
    const waivedRow = await admin
      .from("appointments")
      .select("payment_status")
      .eq("id", waived.created.id)
      .single();
    expect(waivedRow.data?.payment_status).toBe("waived");
  });

  it("refuses to verify a NON-video appointment", async () => {
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
        status: "pending",
        appointment_no: `APT-N${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    createdAppointmentIds.push(data.id);

    const result = await setVideoPaymentStatus(admin, {
      appointmentId: data.id,
      status: "payment_verified",
    });
    expect(result.error).toMatch(/only applies to video consultations/i);
  });
});

describe("Payment methods (patient-facing vs admin)", () => {
  it("public read returns ONLY active methods, sorted by sort_order, with detail fields", async () => {
    const { data, error } = await anon
      .from("payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    expect(error).toBeNull();
    const active = data ?? [];
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((m) => m.is_active)).toBe(true);
    const orders = active.map((m) => m.sort_order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    for (const m of active) {
      expect(m).toHaveProperty("account_holder_name");
      expect(m).toHaveProperty("bank_name");
      expect(m).toHaveProperty("account_number");
      expect(m).toHaveProperty("iban");
      expect(m).toHaveProperty("mobile_number");
    }
  });

  it("an INACTIVE method is hidden from the patient list but still admin-manageable", async () => {
    const { data, error } = await admin
      .from("payment_methods")
      .insert({
        name: `E2E Hidden ${marker()}`,
        description: "Temp inactive method",
        is_active: false,
        sort_order: 99,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const hiddenId = data.id;

    const patientList = await anon.from("payment_methods").select("id").eq("is_active", true);
    expect((patientList.data ?? []).map((m) => m.id)).not.toContain(hiddenId);

    const adminList = await admin.from("payment_methods").select("id").eq("id", hiddenId);
    expect(adminList.data).toHaveLength(1);

    const { error: delError } = await admin.from("payment_methods").delete().eq("id", hiddenId);
    expect(delError).toBeNull();
  });
});

describe("RLS — non-admin users cannot modify offers / payment methods / payment verification", () => {
  it("anon cannot insert into video_offers", async () => {
    const { error } = await anon.from("video_offers").insert({
      title: "E2E Hack",
      offer_type: "waive",
      start_date: todayStr(),
    });
    expect(error).not.toBeNull();
  });

  it("anon cannot update an existing video offer (RLS filters the row silently)", async () => {
    const offer = await createOffer({ offer_type: "waive" });
    await anon.from("video_offers").update({ title: "Hacked" }).eq("id", offer.id);

    const { data: stillThere } = await admin
      .from("video_offers")
      .select("title")
      .eq("id", offer.id)
      .single();
    expect(stillThere?.title).toBe(offer.title);
  });

  it("anon cannot insert into payment_methods", async () => {
    const { error } = await anon.from("payment_methods").insert({
      name: "E2E Hack",
      is_active: true,
    });
    expect(error).not.toBeNull();
  });

  it("anon cannot update or delete a payment method (RLS filters the row silently)", async () => {
    const { data, error } = await admin
      .from("payment_methods")
      .insert({ name: `E2E RLS ${marker()}`, description: "temp", is_active: true, sort_order: 99 })
      .select("id")
      .single();
    expect(error).toBeNull();

    await anon.from("payment_methods").update({ is_active: false }).eq("id", data.id);
    const { data: afterUpdate } = await admin
      .from("payment_methods")
      .select("is_active")
      .eq("id", data.id)
      .single();
    expect(afterUpdate?.is_active).toBe(true);

    await anon.from("payment_methods").delete().eq("id", data.id);
    const { data: stillThere } = await admin
      .from("payment_methods")
      .select("id")
      .eq("id", data.id)
      .single();
    expect(stillThere?.id).toBe(data.id);

    const { error: cleanError } = await admin.from("payment_methods").delete().eq("id", data.id);
    expect(cleanError).toBeNull();
  });

  it("anon cannot mark a guest appointment's payment verified (only admin can)", async () => {
    const { created } = await createVideoAppointment();
    await anon
      .from("appointments")
      .update({ payment_status: "payment_verified" })
      .eq("id", created.id);

    const { data: row } = await admin
      .from("appointments")
      .select("payment_status")
      .eq("id", created.id)
      .single();
    expect(row?.payment_status).toBe("payment_pending");
  });

  it("an authenticated PATIENT cannot modify their own appointment's payment_status", async () => {
    const email = `${marker()}@test.com`;
    const password = "Sup3rSecret!";
    const patientId = await createAuthUser(email, password);
    await createProfile(patientId, "patient");

    const service_id = await videoServiceId();
    const { data, error } = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: patientId,
        patient_name: `E2E Patient ${marker()}`,
        patient_phone: `+920000000002`,
        patient_email: email,
        service_id,
        date: uniqueDate(),
        time: "21:00",
        duration_minutes: 15,
        status: "pending",
        payment_status: "payment_pending",
        payment_amount: 500,
        appointment_no: `APT-P${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    createdAppointmentIds.push(data.id);

    const session = await signInAs(email, password);
    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });

    // PostgREST reports an RLS-filtered UPDATE as a no-op — the assertion is
    // that the payment column was NOT changed by the patient's attempt.
    await authed
      .from("appointments")
      .update({ payment_status: "payment_verified" })
      .eq("id", data.id);

    const { data: row } = await admin
      .from("appointments")
      .select("payment_status")
      .eq("id", data.id)
      .single();
    expect(row?.payment_status).toBe("payment_pending");
  });

  it("an authenticated PATIENT cannot reject, refund or verify their payment, nor complete/confirm the appointment (RLS)", async () => {
    const email = `${marker()}@test.com`;
    const password = "Sup3rSecret!";
    const patientId = await createAuthUser(email, password);
    await createProfile(patientId, "patient");

    const service_id = await videoServiceId();
    const { data, error } = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: patientId,
        patient_name: `E2E Patient ${marker()}`,
        patient_phone: `+920000000003`,
        patient_email: email,
        service_id,
        date: uniqueDate(),
        time: "21:30",
        duration_minutes: 15,
        status: "confirmed",
        payment_status: "payment_verified",
        payment_amount: 500,
        appointment_no: `APT-P${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    createdAppointmentIds.push(data.id);

    const session = await signInAs(email, password);
    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });

    // Every write a patient might attempt is RLS-filtered — the DB values must
    // stay unchanged. PostgREST reports filtered updates as no-ops, so the
    // assertions are on the stored row after each attempt.
    await authed
      .from("appointments")
      .update({ payment_status: "payment_failed" })
      .eq("id", data.id);
    await authed.from("appointments").update({ payment_status: "refunded" }).eq("id", data.id);
    await authed.from("appointments").update({ status: "completed" }).eq("id", data.id);
    await authed.from("appointments").update({ status: "pending" }).eq("id", data.id);

    const { data: row } = await admin
      .from("appointments")
      .select("status, payment_status")
      .eq("id", data.id)
      .single();
    expect(row?.status).toBe("confirmed");
    expect(row?.payment_status).toBe("payment_verified");
  });
});

describe("Video reschedule respects the 15-minute slots (DB layer)", () => {
  it("two adjacent 15-minute video appointments are allowed (19:00 and 19:15)", async () => {
    const date = uniqueDate();
    const a = await createVideoAppointment({ date, time: "19:00" });
    const b = await createVideoAppointment({ date, time: "19:15" });
    expect(a.created.id).not.toBe(b.created.id);
  });

  it("moving an appointment onto an occupied 15-minute slot is rejected by the DB", async () => {
    const date = uniqueDate();
    await createVideoAppointment({ date, time: "19:00" });
    const mover = await createVideoAppointment({ date, time: "20:00" });

    const { error } = await admin
      .from("appointments")
      .update({ date, time: "19:00" })
      .eq("id", mover.created.id);
    expect(error).not.toBeNull();
  });

  it("moving to a free adjacent slot succeeds and the row reflects the new slot", async () => {
    const date = uniqueDate();
    await createVideoAppointment({ date, time: "19:00" });
    const mover = await createVideoAppointment({ date, time: "20:00" });

    const { error } = await admin
      .from("appointments")
      .update({ date, time: "19:15" })
      .eq("id", mover.created.id);
    expect(error).toBeNull();

    const { data: row } = await admin
      .from("appointments")
      .select("date, time")
      .eq("id", mover.created.id)
      .single();
    expect(row?.date).toBe(date);
    expect((row?.time as string).slice(0, 5)).toBe("19:15");
  });
});

afterEach(async () => {
  if (createdOfferIds.length > 0) {
    await admin.from("video_offers").delete().in("id", createdOfferIds);
    createdOfferIds.length = 0;
  }
  if (createdAppointmentIds.length > 0) {
    await admin.from("appointments").delete().in("id", createdAppointmentIds);
    createdAppointmentIds.length = 0;
  }
});

afterAll(async () => {
  if (createdOfferIds.length > 0) {
    await admin.from("video_offers").delete().in("id", createdOfferIds);
  }
  if (createdAppointmentIds.length > 0) {
    await admin.from("appointments").delete().in("id", createdAppointmentIds);
  }
  for (const id of createdUserIds) {
    await admin.from("profiles").delete().eq("id", id).maybeSingle();
    await admin.auth.admin.deleteUser(id);
  }
});
