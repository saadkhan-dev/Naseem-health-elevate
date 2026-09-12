const { chromium } = require("playwright");
const BASE = "http://localhost:8080";
const EMAIL = process.env.QA_ADMIN_EMAIL;
const PASS = process.env.QA_ADMIN_PASS;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const seen = [];
  page.on("response", (r) => {
    if (r.url().includes("_serverfn") || r.url().includes("auth/v1")) {
      seen.push({ status: r.status(), url: r.url() });
    }
  });
  await page.goto(BASE + "/admin/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);
  const url = page.url();
  const errText = await page.evaluate(() => {
    const p = document.querySelector(
      "form p.text-destructive, p.text-sm.font-medium.text-destructive",
    );
    return p ? p.textContent : "(no error element)";
  });
  console.log("FINAL URL:", url);
  console.log("VISIBLE ERROR:", JSON.stringify(errText));
  console.log("AUTH/SERVERFN RESPONSES:");
  seen.forEach((r) => console.log(`  ${r.status} ${r.url.slice(0, 120)}`));
  await browser.close();
})().catch((e) => {
  console.error("EXC", e.message);
  process.exit(1);
});
