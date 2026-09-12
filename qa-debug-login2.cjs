const { chromium } = require("playwright");
const BASE = "http://localhost:8080";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const log = [];
  page.on("console", (m) => log.push(`[console:${m.type()}] ${m.text().slice(0, 200)}`));
  page.on("request", (r) => {
    if (r.url().includes("auth")) log.push(`REQ ${r.method()} ${r.url().slice(0, 140)}`);
  });
  page.on("requestfailed", (r) =>
    log.push(`REQFAIL ${r.method()} ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`),
  );
  page.on("response", (r) => {
    if (r.url().includes("auth")) log.push(`RESP ${r.status()} ${r.url().slice(0, 140)}`);
  });
  await page.goto(BASE + "/admin/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.fill("#email", process.env.QA_ADMIN_EMAIL);
  await page.fill("#password", process.env.QA_ADMIN_PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  log.push(`FINAL URL: ${page.url()}`);
  const err = await page.evaluate(() => {
    const p = document.querySelector("form p");
    return p ? p.textContent : "(none)";
  });
  log.push(`FORM ERROR: ${JSON.stringify(err)}`);
  const hasOverlay = await page.evaluate(() => !!document.querySelector("vite-error-overlay"));
  log.push(`VITE ERROR OVERLAY: ${hasOverlay}`);
  console.log(log.join("\n"));
  await browser.close();
})().catch((e) => {
  console.error("EXC", e);
  process.exit(1);
});
