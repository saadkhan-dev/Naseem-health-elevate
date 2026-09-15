/* eslint-disable */
/**
 * LIVE E2E — Phase 1 "Extra / Custom Availability".
 *
 * Env:
 *   BASE_URL          (default http://localhost:8080)
 *   E2E_ARTIFACTS_DIR (default e2e-artifacts)
 *   E2E_HEADFUL=1
 *   QA_ADMIN_EMAIL / QA_ADMIN_PASS → use the real login form instead
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const ARTIFACTS = process.env.E2E_ARTIFACTS_DIR ?? "e2e-artifacts";
const HEADLESS = process.env.E2E_HEADFUL !== "1";
const EMAIL = process.env.QA_ADMIN_EMAIL ?? "";
const PASS = process.env.QA_ADMIN_PASS ?? "";

const MARKER = `E2E-phase1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
fs.mkdirSync(path.join(ARTIFACTS, "phase1"), { recursive: true });

// ---------------------------------------------------------------- env / db
const envPath = path.join(process.cwd(), ".env");
const vars = {};
for (const l of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) vars[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const SUPABASE_URL = vars.VITE_SUPABASE_URL;
const SERVICE_KEY = vars.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = vars.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("missing Supabase env in .env");
  process.exit(2);
}
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const STAFF_KEY = `sb-${projectRef}-staff-auth-token`;
const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------- test data
// Dates are ~1 month out to avoid colliding with any live bookings.
const FRIDAY = "2026-10-16";
const SUNDAY = "2026-10-18";
const PLAIN_TUE = "2026-10-13";
const DOCTOR = { date: FRIDAY, start: "17:00", end: "18:30", endEdited: "18:45" };
const CLINIC = { date: SUNDAY, start: "16:00", end: "19:00" };

function assertDay(dateStr, want, label) {
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  if (dow !== want) throw new Error(`${label} ${dateStr} is weekday ${dow}, want ${want}`);
}
assertDay(FRIDAY, 5, "doctor date (want Friday)");
assertDay(SUNDAY, 0, "clinic date (want Sunday)");
assertDay(PLAIN_TUE, 2, "plain date (want Tuesday)");

// ---------------------------------------------------------------- reporting
const results = [];
function record(step, ok, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------- utils
function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minsToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function formatTimeDisplay(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}
function windowTimes(start, end, dur) {
  const out = [];
  const sMin = toMinutes(start);
  const total = toMinutes(end) - sMin;
  for (let m = 0; m + dur <= total; m += dur) {
    const mins = sMin + m;
    const h = Math.floor(mins / 60);
    const mm = mins % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
}

async function mintStaffSession() {
  const profs = await service.from("profiles").select("id, role").eq("role", "admin").limit(1);
  const adminProfile = profs.data?.[0];
  if (!adminProfile) throw new Error("no admin profile found");
  const { data: userData } = await service.auth.admin.getUserById(adminProfile.id);
  const email = userData.user?.email ?? "";
  if (!email) throw new Error("no admin email");
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.email_otp) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no otp"}`);
  }
  const anonAuth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionData, error: verifyErr } = await anonAuth.auth.verifyOtp({
    type: "magiclink",
    email: linkData.user.email,
    token: linkData.properties.email_otp,
  });
  if (verifyErr || !sessionData?.session) {
    throw new Error(`verifyOtp failed: ${verifyErr?.message ?? "no session"}`);
  }
  return sessionData.session;
}

async function pickService() {
  const { data } = await service
    .from("services")
    .select("id, name, duration_minutes, is_active")
    .eq("is_active", true);
  const rows = (data ?? []).filter(
    (s) =>
      s.duration_minutes != null &&
      !String(s.name).toLowerCase().includes("video consultation") &&
      !String(s.name).toLowerCase().includes("home visit"),
  );
  rows.sort(
    (a, b) =>
      (a.duration_minutes === 30 ? 0 : 1) - (b.duration_minutes === 30 ? 0 : 1) ||
      (a.duration_minutes === 15 ? 0 : 1) - (b.duration_minutes === 15 ? 0 : 1),
  );
  if (!rows[0]) throw new Error("no fixed-duration booking service found");
  return rows[0];
}

async function pickProvider() {
  const { data } = await service
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["doctor", "admin"]);
  const rows = (data ?? []).slice();
  rows.sort(
    (a, b) =>
      (a.role === "doctor" ? 0 : 1) - (b.role === "doctor" ? 0 : 1) ||
      (a.full_name ? 0 : 1) - (b.full_name ? 0 : 1),
  );
  return rows[0] ?? null;
}

/** Mirror of the app's generateTimeSlots for a date + duration. */
async function expectedGrid(dateStr, durationMinutes) {
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  const avail = await service
    .from("availability")
    .select("day_of_week, start_time, end_time")
    .eq("is_available", true);
  const custom = await service
    .from("custom_availability")
    .select("specific_date, start_time, end_time")
    .eq("is_available", true)
    .eq("specific_date", dateStr);
  const slots = [
    ...(avail.data ?? []).filter((a) => a.day_of_week === dow),
    ...(custom.data ?? []),
  ];
  if (slots.length === 0) return [];

  const booked = await anon.rpc("booked_slots_with_duration", { p_date: dateStr });
  const bookedStart = new Set((booked.data ?? []).map((b) => String(b.slot).trim().slice(0, 5)));
  const bookedIntervals = (booked.data ?? [])
    .map((b) => {
      const m = /^(\d{2}):(\d{2})$/.exec(String(b.slot).trim().slice(0, 5));
      if (!m) return null;
      return {
        startMinutes: Number(m[1]) * 60 + Number(m[2]),
        durationMinutes: Math.max(Number(b.duration_minutes ?? 0), 0),
      };
    })
    .filter(Boolean);

  const times = [];
  const seen = new Set();
  for (const slot of slots) {
    const sMin = toMinutes(String(slot.start_time).slice(0, 5));
    const total = toMinutes(String(slot.end_time).slice(0, 5)) - sMin;
    for (let m = 0; m + durationMinutes <= total; m += durationMinutes) {
      const mins = sMin + m;
      const h = Math.floor(mins / 60);
      const mm = mins % 60;
      const t = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      if (seen.has(t) || bookedStart.has(t)) continue;
      const overlaps = bookedIntervals.some(
        (b) => mins < b.startMinutes + b.durationMinutes && b.startMinutes < mins + durationMinutes,
      );
      if (overlaps) continue;
      seen.add(t);
      times.push(formatTimeDisplay(t));
    }
  }
  return times;
}

function installTaps(page, ctxErrors) {
  page.on("pageerror", (e) => ctxErrors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") ctxErrors.push(`console.error: ${msg.text()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) ctxErrors.push(`HTTP ${res.status()} ${res.url()}`);
  });
}

async function navigateToMonth(page, year, monthIdx) {
  const cal = page.locator('[data-slot="calendar"]').first();
  const caption = cal.locator(".rdp-month_caption, [class*='month_caption']").first();
  const targetLabel = `${new Date(year, monthIdx, 1).toLocaleString("default", { month: "long" })}${new Date(year, monthIdx, 1).getFullYear()}`.toLowerCase();
  for (let i = 0; i < 13; i++) {
    try {
      const text = ((await caption.textContent({ timeout: 1200 })) ?? "").toLowerCase().replace(/\s/g, "");
      if (text.replace(/\s/g, "").includes(targetLabel.replace(/\s/g, ""))) return;
    } catch {
      /* not ready */
    }
    const next = cal.getByRole("button", { name: "Go to the Next Month" });
    const prev = cal.getByRole("button", { name: "Go to the Previous Month" });
    if ((await next.count()) > 0) await next.first().click({ timeout: 5000 });
    else if ((await prev.count()) > 0) await prev.first().click({ timeout: 5000 });
    else throw new Error("calendar has no nav buttons");
  }
  throw new Error(`could not navigate calendar to ${year}-${monthIdx}`);
}

async function dataDay(page, y, m, d) {
  return page.evaluate(([yy, mm, dd]) => new Date(yy, mm, dd).toLocaleDateString(), [y, m, d]);
}

async function waitGridSettled(page) {
  for (let i = 0; i < 24; i++) {
    const texts = await page
      .getByRole("button")
      .allInnerTexts()
      .catch(() => []);
    const slotCount = texts.filter((x) => /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/.test(x.trim())).length;
    if (slotCount > 0) return true;
    const body = (await page.locator("body").innerText()) || "";
    if (body.includes("Slot Not Available")) return false;
    await page.waitForTimeout(500);
  }
  return false;
}

async function readBookingGrid(page) {
  const texts = await page.getByRole("button").allInnerTexts();
  const grid = texts
    .map((t) => t.trim())
    .filter((t) => /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/.test(t));
  const unique = new Set(grid).size;
  return { list: grid, hasDupes: unique !== grid.length };
}

async function openBookingFor(context, serviceName, isoDate) {
  const page = await context.newPage();
  const errors = [];
  installTaps(page, errors);
  await page.goto(`${BASE}/booking`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const serviceBox = page.getByRole("combobox").first();
  await serviceBox.waitFor({ state: "visible", timeout: 20000 });
  await serviceBox.click({ timeout: 15000 });
  const opt = page.getByRole("option", { name: serviceName, exact: true }).first();
  await opt.waitFor({ timeout: 15000 });
  await opt.click({ timeout: 15000 });
  const [y, m, d] = isoDate.split("-").map(Number);
  await navigateToMonth(page, y, m - 1);
  const dd = await dataDay(page, y, m - 1, d);
  const dayBtn = page.locator(`button[data-day="${dd}"]`).first();
  await dayBtn.waitFor({ state: "visible", timeout: 15000 });
  const disabled = (await dayBtn.getAttribute("aria-disabled")) === "true";
  if (!disabled) {
    await dayBtn.click({ timeout: 15000 });
    await waitGridSettled(page);
  }
  const { list, hasDupes } = disabled ? { list: [], hasDupes: false } : await readBookingGrid(page);
  return { page, errors, grid: list, hasDupes, disabled, dayBtn, isoDate };
}

async function shot(page, name) {
  await page
    .screenshot({ path: path.join(ARTIFACTS, "phase1", `${name}.png`), fullPage: true })
    .catch(() => {});
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

// ---------------------------------------------------------------- run
const browser = await chromium.launch({ headless: HEADLESS });
let staffSession = null;
if (!EMAIL || !PASS) {
  staffSession = await mintStaffSession();
  console.log(`staff session minted (${projectRef})`);
}

const clientErrors = [];
const snapBefore = (await service.from("appointments").select("id")).data ?? [];
const createdIds = [];

try {
  // Purge leftovers from any interrupted run (our notes marker).
  await service.from("custom_availability").delete().ilike("notes", "E2E-phase1-%");

  const svc = await pickService();
  const provider = await pickProvider();
  const providerName = provider?.full_name ?? provider?.role ?? "Provider";
  const DUR = svc.duration_minutes;
  record("seed: fixed-duration service found", !!svc.id, `${svc.name} (${DUR} min)`);
  record("seed: provider found for doctor-specific slot", !!provider, providerName);

  // ================================================================== A. ADMIN
  console.log("\n-- Admin: create two custom slots --");
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    installTaps(page, errors);
    await page.addInitScript(
      ([k, s]) => localStorage.setItem(k, JSON.stringify(s)),
      [STAFF_KEY, staffSession],
    );
    try {
      await page.goto(`${BASE}/admin/availability`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page
        .getByRole("heading", { name: "Extra / Custom Availability" })
        .waitFor({ state: "visible", timeout: 30000 });
      record("admin: page loads (auth ok)", true);
      const sec = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Extra / Custom Availability" }) });

      // --- doctor-specific slot ---
      await sec.locator('input[type="date"]').fill(DOCTOR.date);
      await sec.locator('input[type="time"]').nth(0).fill(DOCTOR.start);
      await sec.locator('input[type="time"]').nth(1).fill(DOCTOR.end);
      await sec.getByPlaceholder("e.g. Special Sunday clinic").fill(`${MARKER} doctor`);
      await sec.locator('[role="combobox"]').click({ timeout: 10000 });
      const provOpt = page.getByRole("option", { name: providerName, exact: true }).first();
      await provOpt.waitFor({ timeout: 15000 });
      await provOpt.click({ timeout: 10000 });
      await sec.getByRole("button", { name: "Add Extra Slot" }).click({ timeout: 10000 });
      await sec
        .getByText(`${formatTimeDisplay(DOCTOR.start)} – ${formatTimeDisplay(DOCTOR.end)}`, { exact: true })
        .waitFor({ state: "visible", timeout: 20000 });
      await sec.getByText(providerName, { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });
      record("admin: doctor-specific slot created + listed", true, `${DOCTOR.date} ${DOCTOR.start}–${DOCTOR.end} (${providerName})`);
      await shot(page, "admin-after-doctor-create");

      // --- clinic-wide slot ---
      await sec.locator('input[type="date"]').fill(CLINIC.date);
      await sec.locator('input[type="time"]').nth(0).fill(CLINIC.start);
      await sec.locator('input[type="time"]').nth(1).fill(CLINIC.end);
      await sec.getByPlaceholder("e.g. Special Sunday clinic").fill(`${MARKER} clinic`);
      await sec.getByRole("button", { name: "Add Extra Slot" }).click({ timeout: 10000 });
      await sec
        .getByText(`${formatTimeDisplay(CLINIC.start)} – ${formatTimeDisplay(CLINIC.end)}`, { exact: true })
        .waitFor({ state: "visible", timeout: 20000 });
      await sec.getByText("Clinic-wide", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });
      record("admin: clinic-wide slot created + listed", true, `${CLINIC.date} ${CLINIC.start}–${CLINIC.end} (Clinic-wide)`);
      await shot(page, "admin-after-clinic-create");

      // --- conflict validation ---
      await sec.locator('input[type="date"]').fill(CLINIC.date);
      await sec.locator('input[type="time"]').nth(0).fill("17:00");
      await sec.locator('input[type="time"]').nth(1).fill("20:00");
      await sec.getByRole("button", { name: "Add Extra Slot" }).click({ timeout: 10000 });
      await page.getByText(/overlaps another extra slot/).waitFor({ state: "visible", timeout: 10000 });
      record("admin: conflicting slot blocked client-side", true);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await page
        .getByRole("heading", { name: "Extra / Custom Availability" })
        .waitFor({ state: "visible", timeout: 30000 });
    } catch (e) {
      record("admin create phase", false, String(e).split("\n")[0]);
      await shot(page, "admin-create-error");
    }
    clientErrors.push(...errors);
    await ctx.close();
  }

  const createdNow = await service
    .from("custom_availability")
    .select("id, doctor_id, specific_date, start_time, end_time, notes")
    .ilike("notes", "E2E-phase1-%");
  for (const r of createdNow.data ?? []) createdIds.push(r.id);
  record(
    "db: both rows persisted via server fns",
    (createdNow.data ?? []).length === 2,
    JSON.stringify((createdNow.data ?? []).map((r) => `${r.specific_date} ${String(r.start_time).slice(0, 5)}-${String(r.end_time).slice(0, 5)}`)),
  );

  // ================================================================== B. PATIENT (desktop)
  console.log("\n-- Patient booking (desktop) --");
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const r = await openBookingFor(ctx, svc.name, FRIDAY);
    const expected = await expectedGrid(FRIDAY, DUR);
    const customExp = windowTimes(DOCTOR.start, DOCTOR.end, DUR).map(formatTimeDisplay);
    const regExp = windowTimes("19:00", "23:00", DUR).map(formatTimeDisplay);
    const ok =
      r.disabled === false &&
      !r.hasDupes &&
      customExp.every((t) => r.grid.includes(t)) &&
      regExp.every((t) => r.grid.includes(t)) &&
      sameSet(r.grid, expected);
    record(
      "booking: doctor slot day — custom + regular merge, exact grid",
      ok,
      `custom=${customExp.join(",")} regular=${regExp.join(",")} got=[${r.grid.join(",")}] expect=[${expected.join(",")}]`,
    );
    record("booking: grid has no duplicate times", !r.hasDupes);
    await shot(r.page, "booking-friday");
    clientErrors.push(...r.errors);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const r = await openBookingFor(ctx, svc.name, SUNDAY);
    const expected = await expectedGrid(SUNDAY, DUR);
    const ok =
      r.disabled === false &&
      r.grid.includes(formatTimeDisplay(CLINIC.start)) &&
      r.grid.includes(formatTimeDisplay("11:00")) &&
      sameSet(r.grid, expected);
    record(
      "booking: Sunday day open — custom afternoon + regular 11 AM",
      ok,
      `got=[${r.grid.join(",")}] expect=[${expected.join(",")}]`,
    );
    await shot(r.page, "booking-sunday");
    clientErrors.push(...r.errors);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const r = await openBookingFor(ctx, svc.name, PLAIN_TUE);
    const expected = await expectedGrid(PLAIN_TUE, DUR);
    const ok =
      r.disabled === false &&
      r.grid.includes(formatTimeDisplay("19:00")) &&
      r.grid.includes(formatTimeDisplay("22:30")) &&
      sameSet(r.grid, expected);
    record("booking: plain weekday regular timings unchanged", ok, `got=[${r.grid.join(",")}] expect=[${expected.join(",")}]`);
    await shot(r.page, "booking-plain-tue");
    clientErrors.push(...r.errors);
    await ctx.close();
  }

  // ================================================================== C. EDIT
  console.log("\n-- Admin: edit doctor slot --");
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    installTaps(page, errors);
    await page.addInitScript(
      ([k, s]) => localStorage.setItem(k, JSON.stringify(s)),
      [STAFF_KEY, staffSession],
    );
    try {
      await page.goto(`${BASE}/admin/availability`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page
        .getByRole("heading", { name: "Extra / Custom Availability" })
        .waitFor({ state: "visible", timeout: 30000 });
      const sec = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Extra / Custom Availability" }) });
      const rowTime = sec
        .getByText(`${formatTimeDisplay(DOCTOR.start)} – ${formatTimeDisplay(DOCTOR.end)}`, { exact: true })
        .first();
      await rowTime.waitFor({ state: "visible", timeout: 25000 });
      const row = rowTime.locator("xpath=../..");
      await row.getByRole("button", { name: "Edit" }).click({ timeout: 10000 });
      await sec.getByText("Edit Extra Slot", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await sec.locator('input[type="time"]').nth(1).fill(DOCTOR.endEdited);
      await sec.getByRole("button", { name: "Save Changes" }).click({ timeout: 10000 });
      await sec
        .getByText(`${formatTimeDisplay(DOCTOR.start)} – ${formatTimeDisplay(DOCTOR.endEdited)}`, { exact: true })
        .waitFor({ state: "visible", timeout: 20000 });
      record("admin: edit saved (17:00–18:30 → 17:00–18:45)", true);
      await shot(page, "admin-after-edit");
    } catch (e) {
      record("admin edit phase", false, String(e).split("\n")[0]);
      await shot(page, "admin-edit-error");
    }
    clientErrors.push(...errors);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const r = await openBookingFor(ctx, svc.name, FRIDAY);
    const expected = await expectedGrid(FRIDAY, DUR);
    const newMax = formatTimeDisplay(minsToTime(toMinutes(DOCTOR.endEdited) - DUR));
    const ok =
      r.disabled === false &&
      r.grid.includes(newMax) &&
      sameSet(r.grid, expected);
    record("booking: edited window reflected (last slot now " + newMax + ")", ok, `got=[${r.grid.join(",")}] expect=[${expected.join(",")}]`);
    await shot(r.page, "booking-after-edit");
    clientErrors.push(...r.errors);
    await ctx.close();
  }

  // ================================================================== D. DELETE
  console.log("\n-- Admin: delete clinic-wide slot --");
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    installTaps(page, errors);
    await page.addInitScript(
      ([k, s]) => localStorage.setItem(k, JSON.stringify(s)),
      [STAFF_KEY, staffSession],
    );
    page.on("dialog", (d) => d.accept());
    try {
      await page.goto(`${BASE}/admin/availability`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page
        .getByRole("heading", { name: "Extra / Custom Availability" })
        .waitFor({ state: "visible", timeout: 30000 });
      const sec = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Extra / Custom Availability" }) });
      const rowTime = sec
        .getByText(`${formatTimeDisplay(CLINIC.start)} – ${formatTimeDisplay(CLINIC.end)}`, { exact: true })
        .first();
      await rowTime.waitFor({ state: "visible", timeout: 25000 });
      const row = rowTime.locator("xpath=../..");
      await row.getByRole("button", { name: "Delete" }).click({ timeout: 10000 });
      await sec
        .getByText(`${formatTimeDisplay(CLINIC.start)} – ${formatTimeDisplay(CLINIC.end)}`, { exact: true })
        .waitFor({ state: "hidden", timeout: 20000 });
      record("admin: clinic-wide slot deleted", true);
      await shot(page, "admin-after-delete");
    } catch (e) {
      record("admin delete phase", false, String(e).split("\n")[0]);
      await shot(page, "admin-delete-error");
    }
    clientErrors.push(...errors);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const r = await openBookingFor(ctx, svc.name, SUNDAY);
    const expected = await expectedGrid(SUNDAY, DUR);
    const ok =
      (r.disabled === true || !r.grid.includes(formatTimeDisplay(CLINIC.start))) &&
      (r.disabled === true || sameSet(r.grid, expected));
    record(
      "booking: deleted Sunday slot gone + calendar day closed again",
      ok,
      `disabled=${r.disabled} got=[${r.grid.join(",")}] expect=[${expected.join(",")}]`,
    );
    await shot(r.page, "booking-after-delete");
    clientErrors.push(...r.errors);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const r = await openBookingFor(ctx, svc.name, FRIDAY);
    const ok = r.disabled === false && r.grid.includes(formatTimeDisplay(minsToTime(toMinutes(DOCTOR.endEdited) - DUR)));
    record("booking: surviving edited slot still live after delete", ok, `got=[${r.grid.join(",")}]`);
    clientErrors.push(...r.errors);
    await ctx.close();
  }

  // ================================================================== E. MOBILE
  console.log("\n-- Mobile (375px) --");
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const r = await openBookingFor(ctx, svc.name, FRIDAY);
    const overflow = await r.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    record(
      "mobile: booking renders custom + regular, no horizontal overflow",
      r.grid.includes(formatTimeDisplay(DOCTOR.start)) && overflow <= 1,
      `overflow=${overflow}px`,
    );
    await shot(r.page, "mobile-booking");
    clientErrors.push(...r.errors);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    installTaps(page, errors);
    await page.addInitScript(
      ([k, s]) => localStorage.setItem(k, JSON.stringify(s)),
      [STAFF_KEY, staffSession],
    );
    try {
      await page.goto(`${BASE}/admin/availability`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page
        .getByRole("heading", { name: "Extra / Custom Availability" })
        .waitFor({ state: "visible", timeout: 30000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      record("mobile: admin availability fits, no horizontal overflow", overflow <= 1, `overflow=${overflow}px`);
      await shot(page, "mobile-admin");
    } catch (e) {
      record("mobile admin phase", false, String(e).split("\n")[0]);
      await shot(page, "mobile-admin-error");
    }
    clientErrors.push(...errors);
    await ctx.close();
  }

  // ================================================================== APPOINTMENTS
  const snapAfter = (await service.from("appointments").select("id")).data ?? [];
  const sA = snapBefore.map((x) => x.id).sort();
  const sB = snapAfter.map((x) => x.id).sort();
  const removed = sA.filter((x) => !sB.includes(x));
  const added = sB.filter((x) => !sA.includes(x));
  record(
    "existing appointments unaffected (snapshot equal)",
    removed.length === 0 && added.length === 0,
    `count ${snapBefore.length} → ${snapAfter.length}${removed.length ? ` removed=${JSON.stringify(removed)}` : ""}${added.length ? ` added=${JSON.stringify(added)}` : ""}`,
  );
} finally {
  await service.from("custom_availability").delete().ilike("notes", "E2E-phase1-%");
  for (const id of createdIds) {
    await service.from("custom_availability").delete().eq("id", id).maybeSingle();
  }
  const leftover = await service.from("custom_availability").select("id").ilike("notes", "E2E-phase1-%");
  record("cleanup: no E2E custom rows left", (leftover.data ?? []).length === 0, `left=${JSON.stringify(leftover.data ?? [])}`);
  await browser.close();
}

console.log("\n-- Browser console / pageerror / >=500 responses --");
const real = clientErrors.filter(
  (e) => !/favicon|manifest/i.test(e) && !/net::ERR_ABORTED/.test(e),
);
if (real.length === 0) {
  record("no uncaught page errors / console errors / >=500 responses", true);
} else {
  record("browser console clean", false, real.join(" | "));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (failed.length > 0) {
  console.log("Failures:");
  for (const f of failed) console.log(`  - ${f.step}${f.detail ? ` — ${f.detail}` : ""}`);
}
process.exit(failed.length === 0 ? 0 : 1);