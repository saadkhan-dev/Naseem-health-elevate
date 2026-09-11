const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8080';
const A_EMAIL = 'qa.patient.a.260926@example.com';
const A_PASS  = 'PatientA#2026$strong';
const A_NAME  = 'QA Patient A';
const A_PHONE = '+920000000101';
const APT_NO  = 'APT-AB5Z6Y'; // seeded earlier

let errors = [];
let pass = 0, fail = 0;

async function settle(ms = 2500) { await new Promise(r => setTimeout(r, ms)); }

async function assert(name, ok) {
  if (ok) { pass++; console.log('  PASS', name); }
  else    { fail++; console.log('  FAIL', name); }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  console.log('== Patient Portal: Login ==');
  await page.goto(BASE + '/patient', { waitUntil: 'domcontentloaded' });
  await settle();
  await assert('Lock screen renders', await page.locator('text=Patient Portal').isVisible().catch(() => false));

  // AuthModal auto-opens when not logged in — dialog should be visible
  await settle(1500);
  const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false);
  console.log('  AuthModal opened:', dialogVisible);
  if (!dialogVisible) {
    await page.click('text=Sign in / Register');
    await settle();
  }
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('#email').fill(A_EMAIL);
  await dialog.locator('#password').fill(A_PASS);
  await dialog.locator('button[type="submit"]').click();
  await settle(4000);

  const url1 = page.url();
  await assert('Logged in → dashboard (URL=/patient)', url1 === BASE + '/patient' || url1 === BASE + '/patient/');
  await assert('Dashboard heading visible', await page.locator('h1:has-text("My Appointments")').isVisible().catch(() => false));
  await assert('Appointment card visible', await page.locator('text=' + APT_NO).isVisible().catch(() => false));
  await assert('Sidebar shows QA Patient A', (await page.locator('div.truncate').first().textContent())?.includes('QA Patient A') ?? false);

  console.log('== Patient Portal: Documents ==');
  await page.click('text=My Documents');
  await settle();
  await assert('Documents heading', await page.locator('h1:has-text("My Documents")').isVisible().catch(() => false));
  await assert('Upload input exists', await page.locator('#doc-file').isVisible().catch(() => false));

  // Upload a tiny test file
  const testFile = path.join(process.env.TEMP || '/tmp', 'qa-test-doc.txt');
  fs.writeFileSync(testFile, 'QA test document content');
  await page.locator('#doc-file').setInputFiles(testFile);
  await page.click('button:has-text("Upload")');
  await settle(5000);
  const uploadRow = await page.locator('text=qa-test-doc.txt').isVisible().catch(() => false);
  await assert('Uploaded doc appears in list', uploadRow);

  // Delete the document
  const delBtn = page.locator('button:has-text("Delete")').first();
  if (await delBtn.isVisible().catch(() => false)) {
    page.on('dialog', d => d.accept());
    await delBtn.click();
    await settle(3000);
    const deleted = !(await page.locator('text=qa-test-doc.txt').isVisible().catch(() => false));
    await assert('Deleted doc removed from list', deleted);
  } else {
    console.log('  SKIP delete (no button)');
  }

  console.log('== Patient Portal: Profile ==');
  await page.click('text=Profile');
  await settle();
  await assert('Profile heading', await page.locator('h1:has-text("My Profile")').isVisible().catch(() => false));
  const nameInput = page.locator('input[placeholder="Your full name"]').first();
  const origName = await nameInput.inputValue().catch(() => '');
  console.log('  current name:', origName);
  await nameInput.fill('QA Patient A Edited');
  await page.click('button:has-text("Save changes")');
  await settle(2000);
  const savedName = await page.locator('text=Profile updated').isVisible().catch(() => false);
  await assert('Name saved (message shown)', savedName);
  // Restore
  await nameInput.fill(A_NAME);
  await page.click('button:has-text("Save changes")');
  await settle(2000);

  console.log('== Patient Portal: Orders (empty) ==');
  await page.click('text=My Orders');
  await settle();
  await assert('Orders heading', await page.locator('h1:has-text("My Orders")').isVisible().catch(() => false));
  await assert('Orders empty state', await page.locator('text=No orders').isVisible().catch(() => false));

  console.log('== Patient Portal: Reload Persistence ==');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(3000);
  await assert('Stay logged in after reload', !page.url().includes('login'));
  await assert('Dashboard persists', await page.locator('text=' + APT_NO).isVisible().catch(() => false));

  console.log('== Patient Portal: Logout ==');
  await page.click('text=Sign out');
  await settle(3000);
  await assert('Logout → home', page.url() === BASE + '/');
  await page.goto(BASE + '/patient', { waitUntil: 'domcontentloaded' });
  await settle(2000);
  await assert('Patient portal shows lock screen after logout', await page.locator('text=Patient Portal').isVisible().catch(() => false));

  await browser.close();

  console.log('\n===== SUMMARY =====');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  console.log('Distinct console errors:');
  [...new Set(errors)].slice(0, 20).forEach(e => console.log('  - ' + e.slice(0, 200)));
  console.log(`Total unique console errors: ${[...new Set(errors)].length}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('EXC', e.message); process.exit(2); });