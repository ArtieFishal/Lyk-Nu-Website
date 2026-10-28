// Browser tests for the repair tracker: the public /status/ page and the admin "Repairs" tab (360px phone).
// Needs Playwright and a running server (netlify dev, or `node tests/local/serve.mjs`). Demo data only; cleans up after itself. Run:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core CHROME=/usr/bin/google-chrome ADMIN_PASSWORD=... BASE=http://localhost:8888 node tests/ui-repairs.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const BASE = process.env.BASE || 'http://localhost:8888', PW = process.env.ADMIN_PASSWORD;
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } }

const run = String(Date.now()).slice(-5);
const WO = `97${run}`, WO2 = `96${run}`, LAST4 = '0199';
const phone = `(555) 010-${LAST4}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
const phoneCtx = { ...pw.devices['iPhone 13'], viewport: { width: 360, height: 740 }, reducedMotion: 'reduce' };

const login = await (await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PW }) })).json();
const H = { 'content-type': 'application/json', authorization: 'Bearer ' + login.token };
const api = (path, init = {}) => fetch(`${BASE}/api/admin/${path}`, { ...init, headers: H });
const make = (workOrder, extra = {}) => api('repairs', { method: 'POST', body: JSON.stringify({ workOrder, name: 'Demo Testerson', phone, vehicleYear: '2019', vehicleMake: 'Ford', vehicleModel: 'F-150', stage: 'body', ...extra }) });
const noScrollX = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await make(WO, { note: 'DEMO DATA: Fender is straightened and ready for filler.', estimatedCompletion: '2030-01-15', waitingOnParts: true, email: 'demo.customer@example.com' });

// ---------------- public /status/ ----------------
{
  const c = await browser.newContext(phoneCtx); const pg = await c.newPage();
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(m.text()); });
  await pg.goto(BASE + '/status/', { waitUntil: 'load' });

  await t('/status/: not hidden (linked from nav and footer), noindex meta, fits a 360px screen', async () => {
    assert.match(await pg.getAttribute('meta[name=robots]', 'content'), /noindex/);
    assert.ok(await pg.locator('footer a[href="/status/"]').first().textContent().then((x) => /Check repair status/i.test(x)));
    assert.ok(await pg.locator('header a[href="/status/"]').count() >= 1, 'nav link');
    assert.ok(await noScrollX(pg), 'no horizontal scroll');
    assert.equal(await pg.getAttribute('#wo', 'inputmode'), 'numeric');
  });
  await t('/status/: empty or malformed input shows field errors and sends no request', async () => {
    let calls = 0; pg.on('request', (r) => { if (r.url().includes('/api/status')) calls++; });
    await pg.click('#status-submit');
    assert.match(await pg.textContent('#wo ~ .err'), /work order/i); assert.match(await pg.textContent('#last4 ~ .err'), /4 digits/);
    await pg.fill('#wo', WO); await pg.fill('#last4', '12'); await pg.click('#status-submit');
    assert.match(await pg.textContent('#last4 ~ .err'), /4 digits/); assert.equal(calls, 0);
  });
  await t('/status/: wrong last 4 and unknown work order show the same generic "call us" error', async () => {
    await pg.fill('#wo', WO); await pg.fill('#last4', '0000'); await pg.click('#status-submit');
    await pg.waitForSelector('#status-error:not([hidden])'); const a = await pg.textContent('#status-error');
    await pg.fill('#wo', '9999999'); await pg.fill('#last4', '0000'); await pg.click('#status-submit');
    await pg.waitForFunction((x) => document.getElementById('status-error').textContent && !document.getElementById('status-error').hidden, a);
    assert.equal(await pg.textContent('#status-error'), a); assert.match(a, /call/i); assert.match(a, /562-5156/);
    assert.equal(await pg.isHidden('#status-result'), true);
  });
  await t('/status/: correct work order + last 4 shows vehicle, progress, stepper, note, estimate, history and the call button', async () => {
    await pg.goto(BASE + `/status/?wo=${WO}`, { waitUntil: 'load' });
    assert.equal(await pg.inputValue('#wo'), WO);
    await pg.fill('#last4', LAST4); await pg.click('#status-submit'); await pg.waitForSelector('#status-result:not([hidden])');
    assert.equal(await pg.textContent('#r-vehicle'), '2019 Ford F-150');
    assert.match(await pg.textContent('#r-for'), new RegExp(`#${WO} · Demo T\\.`));
    assert.equal(await pg.textContent('#r-stage'), 'Body repair');
    assert.equal(await pg.isVisible('#r-parts'), true);
    assert.equal(await pg.getAttribute('#r-bar', 'aria-valuenow'), '5'); assert.match(await pg.getAttribute('#r-bar', 'aria-valuetext'), /Step 5 of 9/);
    assert.equal(await pg.$$eval('#r-steps li', (l) => l.length), 9);
    assert.equal(await pg.$$eval('#r-steps li.done', (l) => l.length), 4); assert.equal(await pg.$$eval('#r-steps li.current', (l) => l.length), 1);
    assert.equal(await pg.getAttribute('#r-steps li.current', 'aria-current'), 'step');
    assert.match(await pg.textContent('#r-note'), /DEMO DATA: Fender/);
    assert.match(await pg.textContent('#r-est'), /Estimated completion: .*January 15.*an estimate/);
    assert.match(await pg.textContent('#r-updated'), /Last updated/);
    assert.ok((await pg.$$eval('#r-history li', (l) => l.length)) >= 1);
    assert.equal(await pg.getAttribute('#r-call', 'href'), 'tel:+14235625156'); assert.match(await pg.textContent('#r-call'), /Questions\? Call \(423\) 562-5156/);
    assert.ok(await noScrollX(pg), 'no horizontal scroll with results');
    assert.ok((await pg.locator('#r-call').boundingBox()).height >= 44, 'tap target');
    const text = await pg.evaluate(() => document.body.innerText) + await pg.content();
    for (const bad of [LAST4 + ')', '010-0199', 'demo.customer@example.com', 'Testerson', '5550100199']) assert.ok(!text.includes(bad), 'page leaks ' + bad);
    assert.equal(await pg.$$eval('img', (i) => i.filter((x) => x.closest('#status-result')).length), 0, 'no photos');
  });
  await t('/status/: "Check another vehicle" returns to the form', async () => {
    await pg.click('#r-again'); assert.equal(await pg.isVisible('#status-form'), true); assert.equal(await pg.inputValue('#last4'), '');
  });
  await t('/status/ and /: no console errors; /status/ is a normal page in the nav on desktop too', async () => {
    const d = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const dp = await d.newPage(); const de = []; dp.on('pageerror', (e) => de.push(e.message));
    await dp.goto(BASE + '/status/', { waitUntil: 'load' }); assert.equal(await dp.isVisible('header nav a[href="/status/"]'), true);
    assert.ok(await noScrollX(dp), 'no horizontal scroll at 1280'); assert.deepEqual(de, []); assert.deepEqual(errors, []); await d.close();
  });
  await c.close();
}

// ---------------- admin "Repairs" tab ----------------
{
  const c = await browser.newContext(phoneCtx); const pg = await c.newPage();
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(m.text()); });
  let dialogs = []; pg.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await pg.goto(BASE + '/admin/', { waitUntil: 'load' });
  await t('admin: owner logs in on the phone and sees a Repairs tab with the active repair first', async () => {
    await pg.fill('#password', PW); await pg.click('#login-form button[type=submit], #login-form button');
    await pg.waitForSelector('[data-tab=repairs]'); await pg.click('[data-tab=repairs]');
    await pg.waitForSelector(`.rep-card:has-text("#${WO}")`);
    assert.ok(await noScrollX(pg), 'no horizontal scroll at 360');
    const btn = pg.locator(`.rep-card:has-text("#${WO}") .btn-red`); assert.match(await btn.textContent(), /Advance to: Paint/);
    assert.ok((await btn.boundingBox()).height >= 48, 'big phone-friendly button');
  });
  await t('admin: add a repair with Year/Make/Model selects; the same work order again is refused with a clear message', async () => {
    await pg.click('#rep-new');
    for (const id of ['rv-year', 'rv-make', 'rv-model']) assert.equal(await pg.$eval('#' + id, (e) => e.tagName), 'SELECT');
    await pg.fill('#rep-wo', WO2); await pg.fill('#rep-name', 'Demo Testerson'); await pg.fill('#rep-phone', phone);
    await pg.selectOption('#rv-year', '2021'); await pg.selectOption('#rv-make', 'Chevrolet'); await pg.selectOption('#rv-model', { index: 1 });
    await pg.selectOption('#rep-stage', 'estimate'); await pg.fill('#rep-note', 'DEMO DATA: estimate written.');
    assert.equal(await pg.isChecked('#rep-notify'), false, 'email box is off when there is no customer email');
    await pg.click('#rep-save'); await pg.waitForSelector(`.rep-card:has-text("#${WO2}")`);
    await pg.click('#rep-new'); await pg.fill('#rep-wo', WO2); await pg.fill('#rep-name', 'Demo Testerson'); await pg.fill('#rep-phone', phone);
    await pg.selectOption('#rv-year', '2021'); await pg.selectOption('#rv-make', 'Chevrolet'); await pg.selectOption('#rv-model', { index: 1 });
    await pg.click('#rep-save');
    await pg.waitForSelector('.f.invalid #rep-wo, .f.invalid:has(#rep-wo)'); assert.match(await pg.textContent('.f.invalid:has(#rep-wo) .err'), /already/i);
    await pg.click('#rep-cancel'); await pg.waitForSelector('#rep-list');
  });
  await t('admin: the email box defaults on only when the repair has an email address', async () => {
    await pg.click(`.rep-card:has-text("#${WO}") >> text=Open / edit`); await pg.waitForSelector('#rep-form:not([hidden])');
    assert.equal(await pg.isChecked('#rep-notify'), true);
    await pg.fill('#rep-email', ''); await pg.dispatchEvent('#rep-email', 'input'); assert.equal(await pg.isChecked('#rep-notify'), false);
    assert.ok(await noScrollX(pg), 'edit form fits 360');
    await pg.click('#rep-cancel');
  });
  await t('admin: search finds by work order and by name; Advance moves the stage and shows in the public timeline', async () => {
    await pg.waitForSelector('#rep-q'); await pg.fill('#rep-q', WO2);
    await pg.waitForFunction((w) => document.querySelectorAll('.rep-card').length === 1 && document.querySelector('.rep-card').textContent.includes(w), WO2);
    await pg.fill('#rep-q', 'testerson'); await pg.waitForFunction(() => document.querySelectorAll('.rep-card').length >= 2);
    await pg.fill('#rep-q', WO); await pg.waitForFunction((w) => document.querySelectorAll('.rep-card').length === 1, WO);
    dialogs = []; await pg.click('.rep-card .btn-red'); // advance
    await pg.waitForSelector('.rep-card:has-text("Paint")'); assert.equal(dialogs.length, 1); assert.match(dialogs[0], /Paint/);
    const r = await (await fetch(BASE + '/api/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workOrder: WO, last4: LAST4 }) })).json();
    assert.equal(r.repair.stageLabel, 'Paint'); assert.deepEqual(r.repair.history.map((h) => h.label).slice(-2), ['Body repair', 'Paint']);
  });
  await t('admin: no console errors', async () => { assert.deepEqual(errors, []); });
  await c.close();
}

for (const wo of [WO, WO2]) await api(`repairs/${wo}`, { method: 'DELETE' });
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
