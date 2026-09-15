/* eslint-disable */
/**
 * Phase 2 smoke test — no live DB mutation, no migration required.
 *
 * 1. Patient product detail: single-image fallback shows no gallery controls.
 * 2. Admin products: "Product Form" heading + image upload controls render.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";

// ---- env / db (read-only) ----
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
const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

// ---- helpers ----
const results = [];
function ok(step) { results.push({ step, ok: true }); console.log(`PASS  ${step}`); }
function fail(step, err) { results.push({ step, ok: false }); console.log(`FAIL  ${step} — ${err}`); }
async function rec(step, fn) {
  try { await fn(); ok(step); }
  catch (e) { fail(step, e.stack || e.message || e); }
}

async function mintStaffSession() {
  const profs = await service.from("profiles").select("id, role").eq("role", "admin").limit(1);
  const adminProfile = profs.data?.[0];
  if (!adminProfile) throw new Error("no admin profile");
  const { data: userData } = await service.auth.admin.getUserById(adminProfile.id);
  const email = userData.user?.email;
  if (!email) throw new Error("no admin email");
  const { data: linkData, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !linkData?.properties?.email_otp) throw new Error(`generateLink: ${error?.message}`);
  const { data, error: vErr } = await anonClient.auth.verifyOtp({
    type: "magiclink",
    email: linkData.user.email,
    token: linkData.properties.email_otp,
  });
  if (vErr || !data?.session) throw new Error(`verifyOtp: ${vErr?.message}`);
  return data.session;
}

// ---- 1. fetch a real in-stock product (read-only) ----
const { data: productRow, error: prodErr } = await anonClient
  .from("products")
  .select("id, name, image_url")
  .eq("in_stock", true)
  .limit(1)
  .maybeSingle();
if (prodErr || !productRow?.id) {
  console.error("Could not read a product from the live DB:", prodErr?.message ?? "none found");
  process.exit(2);
}
const PRODUCT_ID = productRow.id;
console.log(`using product: ${PRODUCT_ID} (${productRow.name})\n`);

// ---- Playwright ----
const browser = await chromium.launch({ headless: true });
try {
  // A. Patient product detail — gallery fallback (no controls for single image)
  await rec("Patient gallery — single image, no controls", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/product/${PRODUCT_ID}`, { waitUntil: "load", timeout: 60_000 });
    await page.getByRole("button", { name: "Add to Cart" }).waitFor({ state: "visible", timeout: 20_000 });
    const imgCount = await page.locator("img").count();
    const prev = await page.getByRole("button", { name: "Previous image" }).count();
    const next = await page.getByRole("button", { name: "Next image" }).count();
    const dots = await page.locator("[aria-label^='Go to image']").count();
    if (prev !== 0 || next !== 0 || dots !== 0 || imgCount === 0) {
      throw new Error(`prev=${prev} next=${next} dots=${dots} imgs=${imgCount}`);
    }
    await ctx.close();
  });

  // B. Admin products — form dialog heading + upload controls
  await rec("Admin form — Product Form heading + upload + packing + condition", async () => {
    const session = await mintStaffSession();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(
      ([k, s]) => localStorage.setItem(k, JSON.stringify(s)),
      [STAFF_KEY, session],
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/admin/products`, { waitUntil: "load", timeout: 60_000 });
    await page.getByRole("button", { name: "Add Product" }).waitFor({ state: "visible", timeout: 20_000 });
    await page.getByRole("button", { name: "Add Product" }).click();
    await page.getByRole("heading", { name: "Product Form" }).waitFor({ state: "visible", timeout: 10_000 });
    const upload = await page.getByText("Upload from device").count();
    const packing = await page.locator("label:has-text('Packing / size')").count();
    const condition = await page.locator("label:has-text('Condition')").count();
    const addUrl = await page.getByRole("button", { name: "Add URL" }).count();
    if (upload < 1 || packing < 1 || condition < 1 || addUrl < 1) {
      throw new Error(`upload=${upload} packing=${packing} condition=${condition} addUrl=${addUrl}`);
    }
    if (errors.length > 0) throw new Error(`page errors: ${errors.join(" | ")}`);
    await ctx.close();
  });
} finally {
  await browser.close();
}

// ---- results ----
const passed = results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
if (!passed) process.exit(1);