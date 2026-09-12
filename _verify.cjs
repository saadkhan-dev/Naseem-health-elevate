const { chromium } = require("playwright");

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("CONSOLE: " + m.text());
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + (e.stack || e.message)));

  const url = process.argv[2] || "http://localhost:8080/video/test-vc-123";
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  } catch (e) {
    errors.push("GOTO: " + e.message);
  }
  await page.waitForTimeout(30000);
  console.log("FINAL_URL:", page.url());
  console.log("BODY:\n" + (await page.locator("body").innerText()).slice(0, 1200));
  console.log("ERROR_COUNT:", errors.length);
  console.log("ERRORS:\n" + errors.join("\n"));
  await browser.close();
})();
