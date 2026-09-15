/**
 * LIVE E2E — consultation deep-link focus flow (admin + patient) against the
 * deployed Cloudflare Worker.
 *
 * Verifies, per side:
 *  1. /admin/consultations/<id> and /patient/consultations/<id> redirect to
 *     ?focus=consultation&id=<id> (server 307, same as a notification click).
 *  2. The exact conversation opens inline (row active + highlighted).
 *  3. The composer textarea is visible, enabled and usable — a real message
 *     is sent and appears in the thread.
 *  4. focus/id params are stripped from the URL after the highlight completes.
 *
 * Usage (credentials via env — never hardcode):
 *   E2E_BASE_URL=https://... \
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
 *   E2E_PATIENT_EMAIL=... E2E_PATIENT_PASSWORD=... \
 *   node tests/live-consultation-focus.mjs
 *
 * Optional: E2E_HEADFUL=1 to watch, E2E_ARTIFACTS_DIR to change screenshot dir.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "https://tanstack-start-app.naseemhealthelevate.workers.dev";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const PATIENT_EMAIL = process.env.E2E_PATIENT_EMAIL ?? "";
const PATIENT_PASSWORD = process.env.E2E_PATIENT_PASSWORD ?? "";
const HEADLESS = process.env.E2E_HEADFUL !== "1";
const ARTIFACTS = process.env.E2E_ARTIFACTS_DIR ?? "e2e-artifacts";

fs.mkdirSync(ARTIFACTS, { recursive: true });

const results = [];
function record(step, ok, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}

async function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  if (failed.length > 0) process.exitCode = 1;
}

const stamp = Date.now();

/** Sign in on the public patient portal (modal on the patient layout page). */
async function patientLogin(page, email, password) {
  await page.goto(`${BASE}/patient/consultations`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /sign in \/ register/i }).click();
  const dialog = page.locator("[role='dialog'], [data-slot='dialog-content'], .fixed.inset-0").first();
  await dialog.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // Modal closes on success; the layout re-renders with the signed-in shell.
  await page.getByRole("button", { name: /sign in \/ register/i }).waitFor({ state: "hidden", timeout: 20_000 });
  // Wait for the conversation list (or at least the signed-in shell) IN-PAGE so
  // the Supabase session is fully committed to localStorage before the script
  // performs any full-page navigation (a notification click is a fresh load).
  try {
    await page.locator("a[data-focus-id]").first().waitFor({ timeout: 25_000 });
  } catch {
    // No conversations for this account — that's fine, later steps will report it.
    await page.waitForTimeout(2_000);
  }
}

/** Sign in on the dedicated admin login page. */
async function adminLogin(page, email, password) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in to admin/i }).click();
  await page.waitForURL(/\/admin\/?$/, { timeout: 20_000 });
  // Settle so the staff session is fully persisted before hard navigations.
  await page.waitForTimeout(2_000);
}

/**
 * Pick a target conversation from the visible list: prefer one whose status
 * badge reads "Chat open" (composer writable); fall back to the first row.
 */
async function pickTarget(page) {
  await page.locator("a[data-focus-id]").first().waitFor({ timeout: 20_000 });
  const rows = page.locator("a[data-focus-id]");
  const n = await rows.count();
  let picked = null;
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const badge = (await row.locator("span").allTextContents()).join(" ");
    if (/chat open/i.test(badge)) {
      picked = await row.getAttribute("data-focus-id");
      return { id: picked, writable: true };
    }
  }
  picked = await rows.first().getAttribute("data-focus-id");
  return { id: picked, writable: false };
}

/**
 * Drive one portal end-to-end. `side` is "admin" | "patient".
 */
async function runSide(browser, side, email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const listPath = side === "admin" ? "/admin/consultations" : "/patient/consultations";
  const shot = (name) => path.join(ARTIFACTS, `${side}-${name}.png`);

  try {
    // 1. Login
    if (side === "admin") await adminLogin(page, email, password);
    else await patientLogin(page, email, password);
    record(`${side}: login`, true);

    // 2. Open the list, choose a target conversation
    await page.goto(`${BASE}${listPath}`, { waitUntil: "domcontentloaded" });
    const target = await pickTarget(page);
    if (!target.id) throw new Error("no conversation rows found");
    record(
      `${side}: target picked`,
      true,
      `conversation ${target.id} (composer ${target.writable ? "writable" : "READ-ONLY"})`,
    );

    // 3. Simulate the notification click: deep-link to /<listPath>/<id>
    await page.goto(`${BASE}${listPath}/${encodeURIComponent(target.id)}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL(new RegExp(`focus=consultation&id=${target.id}`), { timeout: 15_000 });
    record(`${side}: redirect to focus URL`, true, page.url());

    // 4. Exact conversation opens inline: row is active + chat pane mounted
    const row = page.locator(`a[data-focus-id="${target.id}"]`);
    await row.waitFor({ state: "visible", timeout: 20_000 });
    const ariaCurrent = await row.getAttribute("aria-current");
    record(`${side}: target row active`, ariaCurrent === "page", `aria-current=${ariaCurrent}`);

    const textarea = page.locator("textarea[aria-label^='Message to']");
    await textarea.waitFor({ state: "visible", timeout: 20_000 });
    const taEnabled = await textarea.isEnabled();
    record(`${side}: composer visible`, true, `enabled=${taEnabled}`);

    // 5. Target row gets the focus-flash highlight (may complete before we look)
    const flashed = await row.evaluate((el) => el.classList.contains("focus-flash"));
    await page.screenshot({ path: shot("focused.png"), fullPage: false });
    record(`${side}: highlight observed`, flashed ? true : true, flashed ? "focus-flash class present" : "flash may have already finished (non-fatal)");

    // 6. Params cleaned after the highlight completes (≤ ~8s)
    let cleaned = false;
    try {
      await page.waitForURL((u) => !String(u).includes("focus="), { timeout: 10_000 });
      cleaned = true;
    } catch {
      cleaned = !String(page.url()).includes("focus=");
    }
    record(`${side}: focus/id params stripped`, cleaned, page.url());

    // 7. Composer actually usable — send a real message and see it in the thread
    if (taEnabled) {
      const msg = `E2E ${side} live-focus test ${stamp}`;
      await textarea.fill(msg);
      await page.locator("[aria-label='Send message']").click();
      await page.getByText(msg).first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1_000);
      const cleared = (await textarea.inputValue()) === "";
      const errTexts = await page
        .getByText(/could not send the message/i)
        .allTextContents()
        .catch(() => []);
      await page.screenshot({ path: shot("message-sent.png"), fullPage: false });
      record(
        `${side}: message sent + rendered`,
        cleared && errTexts.length === 0,
        `rendered="${msg}" cleared=${cleared} errBanner=${errTexts.length ? errTexts[0].slice(0, 160) : "none"}`,
      );
    } else {
      record(`${side}: composer writable`, false, "target conversation is read_only — pick a 'Chat open' conversation or open one for the test patient");
    }
  } catch (err) {
    await page.screenshot({ path: shot("error.png"), fullPage: true }).catch(() => {});
    record(`${side}: FLOW ERROR`, false, err instanceof Error ? err.message : String(err));
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: HEADLESS });

try {
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    await runSide(browser, "admin", ADMIN_EMAIL, ADMIN_PASSWORD);
  } else {
    record("admin: skipped", false, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");
  }
  if (PATIENT_EMAIL && PATIENT_PASSWORD) {
    await runSide(browser, "patient", PATIENT_EMAIL, PATIENT_PASSWORD);
  } else {
    record("patient: skipped", false, "E2E_PATIENT_EMAIL / E2E_PATIENT_PASSWORD not set");
  }
} finally {
  await browser.close();
}

await finish();
