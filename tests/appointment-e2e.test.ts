import { describe, expect, it, afterAll } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recoverAppointmentsByContact } from "../src/lib/server/recover-appointments";

/**
 * End-to-end integration tests against the LIVE Supabase project.
 *
 * These exercise the same clients the app uses:
 *  - anon client  → public reads + guest booking + RLS
 *  - service-role → the operations performed inside the TanStack server
 *                   functions (createBooking, checkAppointmentStatus,
 *                   adminUpdateAppointmentStatus), which use getSupabaseAdmin().
 *
 * The Appointment ID is the row `id` (a UUID) — there is no separate
 * appointment_no column in this project.
 *
 * Everything created is cleaned up in afterAll. Only appointments created by
 * this suite (patient_email LIKE 'e2e-%@test.com') and test auth users are
 * touched.
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
const createdUserIds: string[] = [];

function uid(): string {
  return crypto.randomUUID();
}

function marker(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A far-future, effectively unique booking date so a slot never collides with
 * live data or leftover rows from a previously interrupted run. The random
 * suffix of the marker drives a 32-bit FNV-1a hash, so every call yields a
 * different date (plain `parseInt(..., 36)` on the whole marker overflows and
 * loses the low-order bits, collapsing every call onto one date).
 */
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

interface GuestInput {
  id: string;
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  service_id: string;
  date: string;
  time: string;
  status: string;
  patient_id?: string | null;
}

async function createGuestAppointment(overrides: Partial<GuestInput> = {}) {
  const m = marker();
  const services = await admin.from("services").select("id").eq("is_active", true).limit(1);
  if (!services.data?.[0]) throw new Error("No active services found in DB");
  const row: GuestInput = {
    id: uid(),
    patient_name: `E2E ${m}`,
    patient_phone: `+920000000000`,
    patient_email: `${m}@test.com`,
    service_id: services.data[0].id,
    date: uniqueDate(),
    time: "19:00",
    status: "pending",
    ...overrides,
  };
  await admin
    .from("appointments")
    .delete()
    .eq("date", row.date)
    .eq("time", row.time)
    .or("patient_email.like.e2e-%@test.com,patient_name.like.E2E %");
  const { data, error } = await admin
    .from("appointments")
    .insert(row)
    .select("id, service_id, date, time, status, patient_email")
    .single();
  if (error) throw error;
  createdAppointmentIds.push(data.id);
  return { row, created: data };
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

describe("Guest booking (public)", () => {
  it("anon can insert a guest appointment with patient_id = null", async () => {
    const m = marker();
    const services = await admin.from("services").select("id").eq("is_active", true).limit(1);
    const serviceId = services.data![0].id;
    const id = uid();
    const { error } = await anon.from("appointments").insert({
      id,
      patient_id: null,
      patient_name: `E2E Guest ${m}`,
      patient_phone: `+920000000002`,
      patient_email: `${m}@test.com`,
      service_id: serviceId,
      date: uniqueDate(),
      time: "19:00",
      status: "pending",
    });
    expect(error).toBeNull();
    const read = await anon.from("appointments").select("id").eq("id", id).maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(id);
    createdAppointmentIds.push(id);
  });

  it("anon can book a guest appointment with only an email (no phone)", async () => {
    const m = marker();
    const services = await admin.from("services").select("id").eq("is_active", true).limit(1);
    const id = uid();
    const { error } = await anon.from("appointments").insert({
      id,
      patient_id: null,
      patient_name: `E2E Guest ${m}`,
      patient_phone: null,
      patient_email: `${m}@test.com`,
      service_id: services.data![0].id,
      date: uniqueDate(),
      time: "19:00",
      status: "pending",
    });
    expect(error).toBeNull();
    const read = await anon.from("appointments").select("id").eq("id", id).maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(id);
    createdAppointmentIds.push(id);
  });

  it("anon can book a guest appointment with only a phone number (no email)", async () => {
    const m = marker();
    const services = await admin.from("services").select("id").eq("is_active", true).limit(1);
    const id = uid();
    const { error } = await anon.from("appointments").insert({
      id,
      patient_id: null,
      patient_name: `E2E Guest ${m}`,
      patient_phone: `+920000000006`,
      patient_email: null,
      service_id: services.data![0].id,
      date: uniqueDate(),
      time: "19:00",
      status: "pending",
    });
    expect(error).toBeNull();
    const read = await anon.from("appointments").select("id").eq("id", id).maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(id);
    createdAppointmentIds.push(id);
  });

  it("anon cannot insert an appointment tied to a patient account (RLS)", async () => {
    const patientId = await createAuthUser(`${marker()}@test.com`, "Sup3rSecret!");
    await createProfile(patientId, "patient");
    const services = await admin.from("services").select("id").eq("is_active", true).limit(1);
    const { error } = await anon.from("appointments").insert({
      id: uid(),
      patient_id: patientId,
      service_id: services.data![0].id,
      date: uniqueDate(),
      time: "19:00",
      status: "pending",
    });
    expect(error).not.toBeNull();
  });

  it("anon can read a guest appointment (status lookup source)", async () => {
    const { created } = await createGuestAppointment();
    const { data } = await anon.from("appointments").select("id").eq("id", created.id).single();
    expect(data?.id).toBe(created.id);
  });

  it("anon cannot read another patient's appointment (RLS)", async () => {
    const patientId = await createAuthUser(`${marker()}@test.com`, "Sup3rSecret!");
    await createProfile(patientId, "patient");
    const services = await admin.from("services").select("id").eq("is_active", true).limit(1);
    const { data, error } = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: patientId,
        service_id: services.data![0].id,
        date: uniqueDate(),
        time: "19:00",
        status: "pending",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    createdAppointmentIds.push(data.id);
    const anonLookup = await anon.from("appointments").select("id").eq("id", data.id).maybeSingle();
    expect(anonLookup.data).toBeNull();
  });
});

describe("Double-booking prevention (DB layer)", () => {
  it("blocks two active appointments for the same date+time", async () => {
    const date = uniqueDate();
    const time = "19:00";
    await admin
      .from("appointments")
      .delete()
      .eq("date", date)
      .eq("time", time)
      .or("patient_email.like.e2e-%@test.com,patient_name.like.E2E %");
    const { created } = await createGuestAppointment({ date, time });
    const second = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: null,
        patient_name: "E2E double",
        patient_phone: `+920000000003`,
        patient_email: `${marker()}@test.com`,
        service_id: created.service_id,
        date,
        time,
        status: "pending",
      })
      .select("id");
    expect(second.error).not.toBeNull();
    expect(String(second.error?.message ?? "").toLowerCase()).toMatch(
      /duplicate|unique|exclusion/i,
    );
  });

  it("allows re-booking a cancelled slot", async () => {
    const date = uniqueDate();
    const { created } = await createGuestAppointment({ date, time: "19:30" });
    await admin.from("appointments").update({ status: "cancelled" }).eq("id", created.id);
    const rebook = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: null,
        patient_name: "E2E rebook cancelled",
        patient_phone: `+920000000004`,
        patient_email: `${marker()}@test.com`,
        service_id: created.service_id,
        date,
        time: "19:30",
        status: "pending",
      })
      .select("id")
      .single();
    expect(rebook.error).toBeNull();
    createdAppointmentIds.push(rebook.data.id);
  });

  it("allows re-booking a rejected slot", async () => {
    const date = uniqueDate();
    const { created } = await createGuestAppointment({ date, time: "20:00" });
    await admin.from("appointments").update({ status: "rejected" }).eq("id", created.id);
    const rebook = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: null,
        patient_name: "E2E rebook rejected",
        patient_phone: `+920000000005`,
        patient_email: `${marker()}@test.com`,
        service_id: created.service_id,
        date,
        time: "20:00",
        status: "pending",
      })
      .select("id")
      .single();
    expect(rebook.error).toBeNull();
    createdAppointmentIds.push(rebook.data.id);
  });
});

describe("Duration-aware double-booking protection (DB layer)", () => {
  type AppointmentInsertOverrides = Partial<Omit<GuestInput, "time">> & {
    time?: string | null;
    duration_minutes?: number | null;
  };

  async function insertActiveAppointment(overrides: AppointmentInsertOverrides = {}) {
    const m = marker();
    const services = await admin.from("services").select("id").eq("is_active", true).limit(1);
    if (!services.data?.[0]) throw new Error("No active services found in DB");
    const row = {
      id: uid(),
      patient_id: null,
      patient_name: `E2E Overlap ${m}`,
      patient_phone: `+920000000000`,
      patient_email: `${m}@test.com`,
      service_id: services.data[0].id,
      date: uniqueDate(),
      time: "19:00" as string | null,
      duration_minutes: 15,
      status: "pending",
      ...overrides,
    };
    const { data, error } = await admin
      .from("appointments")
      .insert(row)
      .select("id, service_id, date, time, duration_minutes")
      .single();
    if (error) throw error;
    createdAppointmentIds.push(data.id);
    return { row, created: data };
  }

  it("blocks a second appointment whose interval overlaps (40-min at 19:00 vs 15-min at 19:15)", async () => {
    const date = uniqueDate();
    const { row } = await insertActiveAppointment({ date, time: "19:00", duration_minutes: 40 });
    const second = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: null,
        patient_name: "E2E overlap",
        patient_phone: `+920000000003`,
        patient_email: `${marker()}@test.com`,
        service_id: row.service_id,
        date,
        time: "19:15",
        duration_minutes: 15,
        status: "pending",
      })
      .select("id");
    expect(second.error).not.toBeNull();
    expect(String(second.error?.message ?? "").toLowerCase()).toMatch(
      /duplicate|unique|exclusion/i,
    );
  });

  it("allows a non-overlapping adjacent appointment (40-min at 19:00 then 19:40)", async () => {
    const date = uniqueDate();
    const { row } = await insertActiveAppointment({ date, time: "19:00", duration_minutes: 40 });
    const second = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: null,
        patient_name: "E2E adjacent",
        patient_phone: `+920000000004`,
        patient_email: `${marker()}@test.com`,
        service_id: row.service_id,
        date,
        time: "19:40",
        duration_minutes: 15,
        status: "pending",
      })
      .select("id")
      .single();
    expect(second.error).toBeNull();
    createdAppointmentIds.push(second.data.id);
  });

  it("allows a 15-min slot that ends exactly when another starts (19:00 then 19:15)", async () => {
    const date = uniqueDate();
    const { row } = await insertActiveAppointment({ date, time: "19:00", duration_minutes: 15 });
    const second = await admin
      .from("appointments")
      .insert({
        id: uid(),
        patient_id: null,
        patient_name: "E2E boundary",
        patient_phone: `+920000000005`,
        patient_email: `${marker()}@test.com`,
        service_id: row.service_id,
        date,
        time: "19:15",
        duration_minutes: 15,
        status: "pending",
      })
      .select("id")
      .single();
    expect(second.error).toBeNull();
    createdAppointmentIds.push(second.data.id);
  });

  it("allows multiple flexible (Home Visit, time NULL) appointments on the same date", async () => {
    const date = uniqueDate();
    const a = await insertActiveAppointment({ date, time: null, duration_minutes: null });
    const b = await insertActiveAppointment({
      date,
      time: null,
      duration_minutes: null,
      service_id: a.row.service_id,
    });
    expect(a.created.id).not.toBe(b.created.id);
  });
});

describe("booked_slots RPC", () => {
  it("returns only active (non-cancelled/non-rejected) slots for a date", async () => {
    const date = uniqueDate();
    await createGuestAppointment({ date, time: "21:00" });
    const b = await createGuestAppointment({ date, time: "21:30" });
    const c = await createGuestAppointment({ date, time: "22:00" });
    await admin.from("appointments").update({ status: "cancelled" }).eq("id", b.created.id);
    await admin.from("appointments").update({ status: "rejected" }).eq("id", c.created.id);

    const { data } = await anon.rpc("booked_slots", { p_date: date });
    const slots: string[] = (data ?? []).map((r) => (r as { slot: string }).slot);
    expect(slots).toContain("21:00");
    expect(slots).not.toContain("21:30");
    expect(slots).not.toContain("22:00");
  });
});

describe("Appointment ID (row id)", () => {
  it("is a UUID (the Appointment ID shown to patients)", async () => {
    const { created } = await createGuestAppointment();
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("is unique by construction (primary key) — two ids never collide", async () => {
    const a = await createGuestAppointment();
    const b = await createGuestAppointment();
    expect(a.created.id).not.toBe(b.created.id);
  });
});

describe("Patient status lookup (by Appointment ID = id)", () => {
  it("finds an appointment by Appointment ID + phone/email and joins service name", async () => {
    const m = marker();
    const phone = `+9200000000${(createdAppointmentIds.length % 10) + 1}`;
    const { created } = await createGuestAppointment({
      patient_phone: phone,
      patient_email: `${m}@test.com`,
    });
    const { data, error } = await admin
      .from("appointments")
      .select("id, status, date, time, created_at, services:service_id (name)")
      .eq("id", created.id)
      .eq("patient_email", `${m}@test.com`)
      .eq("patient_phone", phone)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBe(created.id);
    const services = data!.services as { name: string | null } | null;
    expect(services?.name).toBeTruthy();
  });

  it("returns nothing when phone/email do not match the Appointment ID", async () => {
    const { created } = await createGuestAppointment();
    const { data } = await admin
      .from("appointments")
      .select("id")
      .eq("id", created.id)
      .eq("patient_email", `wrong-${marker()}@test.com`)
      .maybeSingle();
    expect(data).toBeNull();
  });
});

describe("Status updates flow to the patient", () => {
  it.each(["confirmed", "completed", "cancelled", "rejected"] as const)(
    "admin sets %s and anon guest read reflects it",
    async (status) => {
      const { created } = await createGuestAppointment();
      const anonBefore = await anon
        .from("appointments")
        .select("status")
        .eq("id", created.id)
        .single();
      expect(anonBefore.data?.status).toBe("pending");

      const { error } = await admin.from("appointments").update({ status }).eq("id", created.id);
      expect(error).toBeNull();

      const anonAfter = await anon
        .from("appointments")
        .select("status")
        .eq("id", created.id)
        .single();
      expect(anonAfter.data?.status).toBe(status);
    },
  );
});

describe("Admin authentication + authorization", () => {
  it("admin user can read all appointments (RLS is_admin)", async () => {
    const email = `${marker()}@test.com`;
    const password = "Sup3rSecret!";
    const adminId = await createAuthUser(email, password);
    await createProfile(adminId, "admin");
    await createGuestAppointment();

    const session = await signInAs(email, password);
    expect(session.access_token).toBeTruthy();

    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });
    const { data } = await authed.from("appointments").select("id");
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);
  });

  it("plain patient user cannot read all appointments (RLS blocks)", async () => {
    const email = `${marker()}@test.com`;
    const password = "Sup3rSecret!";
    const patientId = await createAuthUser(email, password);
    await createProfile(patientId, "patient");

    const session = await signInAs(email, password);
    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });
    const { data } = await authed.from("appointments").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("middleware token verification rejects an invalid token", async () => {
    const { data, error } = await admin.auth.getUser("not-a-real-token");
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("middleware token verification + role check accepts a valid admin token", async () => {
    const email = `${marker()}@test.com`;
    const password = "Sup3rSecret!";
    const adminId = await createAuthUser(email, password);
    await createProfile(adminId, "doctor");

    const session = await signInAs(email, password);
    const { data, error } = await admin.auth.getUser(session.access_token);
    expect(error).toBeNull();
    expect(data.user?.id).toBe(adminId);

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", adminId)
      .single();
    expect(["admin", "doctor"]).toContain(profile!.role);
  });
});

describe("Forgot password", () => {
  // GoTrue rate-limits the public resetPasswordForEmail endpoint (~1/min per
  // email/IP) and sends a real reset email, so repeated e2e runs trip
  // `429 over_email_send_rate_limit`. The admin generateLink API builds the same
  // password-recovery link WITHOUT sending an email (so it is not rate-limited)
  // and exercises the same recovery flow.
  it("generates a password-recovery link without sending a reset email", async () => {
    const email = `${marker()}@test.com`;
    const adminId = await createAuthUser(email, "Sup3rSecret!");
    await createProfile(adminId, "admin");

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "http://localhost:8081/reset-password" },
    });
    expect(error).toBeNull();
    expect(data?.user?.id).toBe(adminId);
    expect(data?.properties?.hashed_token).toBeTruthy();
  });
});

describe("Seed data sanity", () => {
  it("has active services", async () => {
    const { data } = await admin.from("services").select("id").eq("is_active", true);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("availability matches clinic hours for all 7 days", async () => {
    const { data } = await admin
      .from("availability")
      .select("day_of_week, start_time, end_time, is_available")
      .eq("is_available", true);
    const rows = data ?? [];
    const byDay = new Map<number, { start_time: string; end_time: string }>();
    for (const r of rows) {
      byDay.set(r.day_of_week, {
        start_time: (r.start_time as string).slice(0, 5),
        end_time: (r.end_time as string).slice(0, 5),
      });
    }
    expect(byDay.size).toBe(7);
    expect(byDay.get(0)).toEqual({ start_time: "11:00", end_time: "13:00" });
    for (let d = 1; d <= 6; d++) {
      expect(byDay.get(d)).toEqual({ start_time: "19:00", end_time: "23:00" });
    }
  });
});

describe("Find My Appointment (recovery)", () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  async function createRecoverableAppointment(
    overrides: Partial<GuestInput> & { appointment_no?: string | null } = {},
  ) {
    const m = marker();
    const services = await admin.from("services").select("id").eq("is_active", true).limit(1);
    if (!services.data?.[0]) throw new Error("No active services found in DB");
    const row: GuestInput & { appointment_no?: string | null } = {
      id: uid(),
      patient_name: `Recovery ${m}`,
      patient_phone: `+9200000000${(createdAppointmentIds.length % 10) + 1}`,
      patient_email: `${m}@test.com`,
      service_id: services.data[0].id,
      date: uniqueDate(),
      time: "19:00",
      status: "pending",
      appointment_no: `APT-R${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      ...overrides,
    };
    await admin.from("appointments").delete().eq("date", row.date).eq("time", row.time);
    const { data, error } = await admin
      .from("appointments")
      .insert(row)
      .select("id, appointment_no, patient_name, patient_phone, patient_email, status, date, time")
      .single();
    if (error) throw error;
    createdAppointmentIds.push(data.id);
    return { row, created: data };
  }

  it("recovers by name + phone (name matched case-insensitively), returns appointment_no not a UUID", async () => {
    const { row, created } = await createRecoverableAppointment();
    const results = await recoverAppointmentsByContact({
      name: row.patient_name.toLowerCase(),
      phone: row.patient_phone,
    });
    expect(results).toHaveLength(1);
    expect(results[0].appointmentNo).toBe(created.appointment_no);
    expect(results[0].appointmentNo).toMatch(/^APT-[A-Z0-9]+$/);
    expect(results[0].appointmentNo).not.toMatch(UUID_RE);
    expect(results[0].patientName).toBe(row.patient_name);
    expect(results[0].status).toBe("pending");
    expect(results[0].date).toBe(row.date);
    expect(results[0].time).toBe(row.time);
    expect(results[0].serviceName).toBeTruthy();
  });

  it("recovers by name + email", async () => {
    const { row } = await createRecoverableAppointment();
    const results = await recoverAppointmentsByContact({
      name: row.patient_name,
      email: row.patient_email,
    });
    expect(results).toHaveLength(1);
    expect(results[0].appointmentNo).toMatch(/^APT-[A-Z0-9]+$/);
    expect(results[0].appointmentNo).not.toMatch(UUID_RE);
  });

  it("returns multiple matching appointments as separate results", async () => {
    const { row } = await createRecoverableAppointment({ time: "19:00" });
    await createRecoverableAppointment({
      patient_name: row.patient_name,
      patient_phone: row.patient_phone,
      patient_email: row.patient_email,
      time: "20:00",
    });
    const results = await recoverAppointmentsByContact({
      name: row.patient_name,
      phone: row.patient_phone,
    });
    expect(results).toHaveLength(2);
    expect(new Set(results.map((r) => r.appointmentNo)).size).toBe(2);
  });

  it("returns nothing with the right phone but a different name (name alone never matches)", async () => {
    const { row } = await createRecoverableAppointment();
    const results = await recoverAppointmentsByContact({
      name: "Some Other Patient",
      phone: row.patient_phone,
    });
    expect(results).toHaveLength(0);
  });

  it("returns nothing with the right name but a different phone", async () => {
    const { row } = await createRecoverableAppointment();
    const results = await recoverAppointmentsByContact({
      name: row.patient_name,
      phone: "+920000000099",
    });
    expect(results).toHaveLength(0);
  });

  it("never returns legacy rows without an appointment_no (no internal UUID exposure)", async () => {
    const { row, created } = await createRecoverableAppointment({ appointment_no: null });
    const results = await recoverAppointmentsByContact({
      name: row.patient_name,
      phone: row.patient_phone,
    });
    expect(created.appointment_no).toBeNull();
    expect(results).toHaveLength(0);
  });

  it("recovered short ID + phone can check status (copy APT-XXXXXX → Check Status)", async () => {
    const { row } = await createRecoverableAppointment();
    const [recovered] = await recoverAppointmentsByContact({
      name: row.patient_name,
      phone: row.patient_phone,
    });
    expect(recovered).toBeTruthy();
    const { data } = await admin
      .from("appointments")
      .select("appointment_no, status, date, time, services:service_id (name)")
      .eq("appointment_no", recovered.appointmentNo)
      .eq("patient_phone", row.patient_phone)
      .maybeSingle();
    expect(data).not.toBeNull();
    expect(data!.appointment_no).toBe(recovered.appointmentNo);
    expect(data!.status).toBe("pending");
  });
});

afterAll(async () => {
  if (createdAppointmentIds.length > 0) {
    await admin.from("appointments").delete().in("id", createdAppointmentIds);
  }
  for (const id of createdUserIds) {
    await admin.from("profiles").delete().eq("id", id).maybeSingle();
    await admin.auth.admin.deleteUser(id);
  }
});
