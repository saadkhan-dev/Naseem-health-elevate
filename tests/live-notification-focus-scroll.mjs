/**
 * LIVE E2E — notification deep-link scroll stability (the reported bug):
 * an admin clicks a "new appointment" notification; the app must land on
 * /admin/appointments?focus=appointment&id=<id>, scroll the exact row into
 * view, highlight it, and the scroll position must STAY at the target until
 * the ?focus=&id= params are stripped. No jump-to-top afterwards.
 *
 * Runs the same click N times in three variants:
 *   A. already on /admin/appointments (in-app navigation)
 *   B. on a different admin tab (cross-page navigation)
 *   C. mobile viewport, from another page
 *
 * Auth: no credentials needed in CI — a staff session is minted via the
 * Supabase admin API (magic link + verifyOtp, the documented "Sign in with
 *_magic-link + verifyOtp Playwright pattern") and injected into the SAME
 * localStorage key the app's staffSupabase client persists under.
 *
 * Usage:
 *   E2E_APPOINTMENT_ID=<uuid> node tests/live-notification-focus-scroll.mjs
 * Optional: E2E_BASE_URL (default http://localhost:8081), E2E_CLICKS (default 6),
 * E2E_HEADFUL=1, QA_ADMIN_EMAIL/QA_ADMIN_PASS (use the real login form instead
 * of the minted session).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8081";
const EMAIL = process.env.QA_ADMIN_EMAIL ?? "";
const PASS = process.env.QA_ADMIN_PASS ?? "";
const HEADLESS = process.env.E2E_HEADFUL !== "1";
const CLICKS = Number(process.env.E2E_CLICKS ?? 6);
const APPT_ID = process.env.E2E_APPOINTMENT_ID ?? "";
const ARTIFACTS = process.env.E2E_ARTIFACTS_DIR ?? "e2e-artifacts";

fs.mkdirSync(ARTIFACTS, { recursive: true });

// .env for the Supabase admin API (service-role, server-side only).
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
const STAFF_STORAGE_KEY = `sb-${projectRef}-staff-auth-token`;

const results = [];
function record(step, ok, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}

/** Mint a staff session server-side (magic link → verifyOtp → session). */
async function mintStaffSession() {
  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const profs = await serviceClient.from("profiles").select("id, role").eq("role", "admin").limit(1);
  const adminUser = profs.data?.[0];
  if (!adminUser) throw new Error("no admin profile found");
  const { data: linkData, error: linkErr } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email: (await serviceClient.auth.admin.getUserById(adminUser.id)).data.user?.email ?? "",
  });
  if (linkErr || !linkData?.properties?.email_otp) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no otp"}`);
  }
  const otp = linkData.properties.email_otp;
  // Exchange the OTP for a real session on an ANON client (exactly what the
  // browser does when the user follows the magic link).
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionData, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    email: linkData.user.email,
    token: otp,
  });
  if (verifyErr || !sessionData?.session) {
    throw new Error(`verifyOtp failed: ${verifyErr?.message ?? "no session"}`);
  }
  return sessionData.session;
}

/**
 * One deep-link click cycle.
 */
async function clickCycle(browser, staffSession, { variant, iteration }) {
  const ctx = await browser.newContext(
    variant === "mobile"
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await ctx.newPage();
  const tag = `${variant}#${iteration}`;
  let ok = true;
  try {
    // Seed the staff session BEFORE any app script runs (same key the app
    // persists under — see src/lib/supabase.ts staffSupabase storageKey).
    await page.addInitScript(
      ([key, session]) => {
        localStorage.setItem(key, JSON.stringify(session));
      },
      [STAFF_STORAGE_KEY, staffSession],
    );

    if (EMAIL && PASS) {
      await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
      await page.locator("#email").fill(EMAIL);
      await page.locator("#password").fill(PASS);
      await page.getByRole("button", { name: /sign in to admin/i }).click();
      await page.waitForURL(/\/admin\/?$/, { timeout: 20_000 });
    }
    if (variant === "onpage") {
      await page.goto(`${BASE}/admin/appointments`, { waitUntil: "domcontentloaded" });
    } else {
      await page.goto(`${BASE}/admin/analytics`, { waitUntil: "domcontentloaded" });
    }
    await page
      .locator("button[aria-label='Admin notifications']")
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(800); // let the notification query settle

    await page.locator("button[aria-label='Admin notifications']").click();
    const item = page.getByText("QA focus test: new appointment booked").first();
    await item.waitFor({ state: "visible", timeout: 15_000 });
    await item.click();
    await page.waitForURL(/focus=appointment&id=/, { timeout: 15_000 });
    record(`${tag}: notification clicked → focus URL`, true, page.url());

    const id = APPT_ID || new URL(page.url()).searchParams.get("id");
    const row = page.locator(`tr[data-focus-id="${id}"]`);
    await row.waitFor({ state: "visible", timeout: 20_000 });

    // Row must be in the viewport shortly after landing.
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(`tr[data-focus-id="${sel}"]`);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        return r.top < vh && r.bottom > 0;
      },
      id,
      { timeout: 8_000 },
    );
    record(`${tag}: row visible after focus`, true);

    // Wait for the URL strip (≤ ~6s) — params must be cleaned per spec.
    let cleaned = false;
    try {
      await page.waitForURL((u) => !String(u).includes("focus="), { timeout: 8_000 });
      cleaned = true;
    } catch {
      cleaned = !String(page.url()).includes("focus=");
    }
    record(`${tag}: focus/id params stripped`, cleaned, page.url());

    // THE regression check: after the strip (and any router restoration), the
    // row must STILL be in the viewport — not yanked back to the top.
    const stillVisible = await page.evaluate((sel) => {
      const el = document.querySelector(`tr[data-focus-id="${sel}"]`);
      if (!el) return { ok: false, why: "row missing", scrollY: 0 };
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const inView = r.top < vh && r.bottom > 0;
      return {
        ok: inView,
        why: inView ? "" : `row out of view (top=${Math.round(r.top)})`,
        scrollY: Math.round(window.scrollY),
      };
    }, id);
    record(
      `${tag}: row STILL in view after strip (no scroll-jump)`,
      stillVisible.ok,
      `${stillVisible.why ?? ""} scrollY=${stillVisible.scrollY}`,
    );
    ok = cleaned && stillVisible.ok;
    await page.screenshot({ path: path.join(ARTIFACTS, `focus-${variant}-${iteration}.png`) });
  } catch (err) {
    ok = false;
    await page
      .screenshot({ path: path.join(ARTIFACTS, `focus-${variant}-${iteration}-error.png`), fullPage: true })
      .catch(() => {});
    record(`${tag}: FLOW ERROR`, false, err instanceof Error ? err.message.split("\n")[0] : String(err));
  } finally {
    await ctx.close();
  }
  return ok;
}

const browser = await chromium.launch({ headless: HEADLESS });
try {
  let staffSession = null;
  if (!EMAIL || !PASS) {
    staffSession = await mintStaffSession();
    console.log("staff session minted via Supabase admin API (magiclink verifyOtp)");
  }
  const plan = [];
  // ≥5 clicks total, covering both "already on the page" and "from another tab"
  // plus a mobile viewport pass.
  for (let i = 1; i <= Math.max(2, CLICKS - 4); i++) plan.push({ variant: "onpage", iteration: i });
  for (let i = 1; i <= Math.max(2, Math.floor(CLICKS / 2)); i++) plan.push({ variant: "crosspage", iteration: i });
  plan.push({ variant: "mobile", iteration: 1 });
  plan.push({ variant: "mobile", iteration: 2 });

  for (const p of plan) {
    const ok = await clickCycle(browser, staffSession, p);
    if (!ok && process.env.E2E_FAILFAST === "1") break;
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (failed.length > 0) process.exitCode = 1;
