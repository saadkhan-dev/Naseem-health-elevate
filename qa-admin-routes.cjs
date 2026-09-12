const { chromium } = require("playwright");

const BASE = "http://localhost:8080";
const EMAIL = process.env.QA_ADMIN_EMAIL;
const PASS = process.env.QA_ADMIN_PASS;

const ROUTES = [
  ["/admin", "/admin"],
  ["/admin/analytics", "/admin/analytics"],
  ["/admin/appointments", "/admin/appointments"],
  ["/admin/availability", "/admin/availability"],
  ["/admin/conditions", "/admin/conditions"],
  ["/admin/doctor", "/admin/doctor"],
  ["/admin/documents", "/admin/documents"],
  ["/admin/faq", "/admin/faq"],
  ["/admin/offers", "/admin/offers"],
  ["/admin/orders", "/admin/orders"],
  ["/admin/payments", "/admin/payments"],
  ["/admin/product-reviews", "/admin/product-reviews"],
  ["/admin/products", "/admin/products"],
  ["/admin/reminders", "/admin/reminders"],
  ["/admin/reviews", "/admin/reviews"],
  ["/admin/services", "/admin/services"],
  ["/admin/support", "/admin/support"],
  ["/admin/videos", "/admin/videos"],
];

async function waitForUrl(page, expectedPrefix, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const url = page.url();
    if (url.startsWith(expectedPrefix)) return url;
    await page.waitForTimeout(200);
  }
  return page.url();
}

(async () => {
  if (!EMAIL || !PASS) {
    console.error("MISSING QA_ADMIN_EMAIL/QA_ADMIN_PASS");
    process.exit(2);
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  const failedReqs = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedReqs.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) failedReqs.push(`HTTP ${res.status()} ${res.url()}`);
  });

  const settle = async () => {
    await page.waitForTimeout(2000);
  };

  console.log("== Login ==");
  await page.goto(BASE + "/admin/login", { waitUntil: "domcontentloaded" });
  await settle();
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASS);
  await page.waitForTimeout(500);
  await page.click('button[type="submit"]');
  const afterLogin = await waitForUrl(page, BASE + "/admin", 15000).catch(() => page.url());
  console.log("after login url:", afterLogin);
  if (!afterLogin.startsWith(BASE + "/admin")) {
    console.error("LOGIN FAILED");
    process.exit(1);
  }
  await page.waitForTimeout(1500);

  const results = [];
  for (const [route, expectPrefix] of ROUTES) {
    const errsBefore = consoleErrors.length;
    console.log(`\n== ${route} hard-load ==`);
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await settle();
    const url1 = await waitForUrl(page, BASE + expectPrefix);
    await page.waitForTimeout(800);
    const url2 = page.url();
    const landedOk = url2.startsWith(BASE + expectPrefix) && !url2.includes("/admin/login");
    const text = await page.evaluate(() => {
      const h = document.querySelector("h1, h2, main");
      return h ? (h.textContent || "").trim().slice(0, 80) : "";
    });
    const newErrors = consoleErrors.slice(errsBefore);
    results.push({ route, landedOk, finalUrl: url2, heading: text, errors: newErrors });

    console.log(`refresh on ${route}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle();
    await waitForUrl(page, BASE + expectPrefix);
    await page.waitForTimeout(800);
    const urlAfterRefresh = page.url();
    const refreshOk =
      urlAfterRefresh.startsWith(BASE + expectPrefix) && !urlAfterRefresh.includes("/admin/login");
    const errsAfterRefresh = consoleErrors.slice(errsBefore + newErrors.length);
    results[results.length - 1].refreshOk = refreshOk;
    results[results.length - 1].refreshFinalUrl = urlAfterRefresh;
    results[results.length - 1].errors =
      results[results.length - 1].errors.concat(errsAfterRefresh);
  }

  console.log("\n== Back / Forward ==");
  const navResults = [];
  await page.goto(BASE + "/admin/appointments", { waitUntil: "domcontentloaded" });
  await settle();
  await waitForUrl(page, BASE + "/admin/appointments");
  await page.goto(BASE + "/admin/conditions", { waitUntil: "domcontentloaded" });
  await settle();
  await waitForUrl(page, BASE + "/admin/conditions");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await settle();
  const backUrl = await waitForUrl(page, BASE + "/admin/appointments");
  await page.goForward({ waitUntil: "domcontentloaded" });
  await settle();
  const forwardUrl = await waitForUrl(page, BASE + "/admin/conditions");
  navResults.push({
    op: "back",
    url: backUrl,
    ok: backUrl.startsWith(BASE + "/admin/appointments"),
  });
  navResults.push({
    op: "forward",
    url: forwardUrl,
    ok: forwardUrl.startsWith(BASE + "/admin/conditions"),
  });
  console.log(JSON.stringify(navResults, null, 2));

  await browser.close();

  console.log("\n===== SUMMARY =====");
  let fail = 0;
  for (const r of results) {
    const status = r.landedOk && r.refreshOk === true ? "PASS" : "FAIL";
    if (status === "FAIL") fail++;
    console.log(`${status}  ${r.route}  heading="${r.heading}"  errs=${r.errors.length}`);
    if (!r.landedOk) console.log(`     landedUrl=${r.finalUrl}`);
    if (r.refreshOk === false) console.log(`     refreshUrl=${r.refreshFinalUrl}`);
    if (r.errors.length)
      r.errors.slice(0, 5).forEach((e) => console.log(`     console-error: ${e.slice(0, 200)}`));
  }
  console.log(`\nFAIL count: ${fail}/${results.length}`);
  console.log("Distinct console errors:");
  [...new Set(consoleErrors)].slice(0, 20).forEach((e) => console.log("  - " + e.slice(0, 200)));
  console.log("Failed requests:");
  [...new Set(failedReqs)].slice(0, 20).forEach((r) => console.log("  - " + r.slice(0, 200)));
  console.log(`Unique req-attrs: ${failedReqs.length}`);
  process.exit(fail === 0 && navResults.every((n) => n.ok) ? 0 : 1);
})();
