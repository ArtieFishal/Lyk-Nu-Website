// Browser test of the /book/ form on an iPhone-like device (Chromium mobile emulation; WebKit if it can launch).
// Not part of `npm test` (needs Playwright). Run:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core ADMIN_PASSWORD=... BASE=http://localhost:8888 node tests/ui.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const BASE = process.env.BASE || 'http://localhost:8888', PW = process.env.ADMIN_PASSWORD;
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } }

let engine = pw.chromium, launch = { executablePath: process.env.CHROME || undefined };
if (process.env.ENGINE === 'webkit') { engine = pw.webkit; launch = {}; }
const browser = await engine.launch(launch);
const ctx = await browser.newContext({ ...pw.devices['iPhone 13'], reducedMotion: 'reduce' });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(BASE + '/book/', { waitUntil: 'load' });
await p.waitForSelector('.cal button.avail');
const opts = (sel) => p.$$eval(sel + ' option', (o) => o.map((x) => x.textContent));

await t('no <datalist> is used; Make, Model, Year and Insurance are native selects', async () => {
  assert.equal(await p.$$eval('datalist', (d) => d.length), 0);
  for (const id of ['vehicleYear', 'vehicleMake', 'vehicleModel', 'insurance']) assert.equal(await p.$eval('#' + id, (e) => e.tagName), 'SELECT');
});
await t('Make lists real makes plus "Other (type it in)"', async () => {
  const m = await opts('#vehicleMake'); assert.ok(m.length > 40 && m.includes('Ford') && m.includes('Nissan') && m.at(-1) === 'Other (type it in)');
  assert.equal(await p.isDisabled('#vehicleModel'), true);
});
await t('Model repopulates when Make changes', async () => {
  await p.selectOption('#vehicleMake', 'Ford');
  let m = await opts('#vehicleModel'); assert.ok(m.includes('F-150') && !m.includes('Altima') && m.at(-1) === 'Other (type it in)');
  assert.equal(await p.isDisabled('#vehicleModel'), false);
  await p.selectOption('#vehicleMake', 'Nissan');
  m = await opts('#vehicleModel'); assert.ok(m.includes('Altima') && !m.includes('F-150'));
  assert.equal(await p.inputValue('#vehicleModel'), '');
});
await t('Other reveals a text box (make and model)', async () => {
  assert.equal(await p.isVisible('#vehicleModelOther'), false);
  await p.selectOption('#vehicleModel', { label: 'Other (type it in)' });
  assert.equal(await p.isVisible('#vehicleModelOther'), true);
  await p.selectOption('#vehicleMake', { label: 'Other (type it in)' });
  assert.equal(await p.isVisible('#vehicleMakeOther'), true);
  assert.equal(await p.isVisible('#vehicleModelOther'), true); // unknown make: model typed too
  await p.selectOption('#vehicleMake', 'Nissan'); // back to a known make hides both
  assert.equal(await p.isVisible('#vehicleMakeOther'), false); assert.equal(await p.isVisible('#vehicleModelOther'), false);
});
await t('Insurance lists the 8 insurers, Other, and out-of-pocket', async () => {
  const o = await opts('#insurance');
  for (const n of ['State Farm', 'Farm Bureau', 'Progressive', 'Erie', 'Allstate', 'Geico', 'Auto-Owners', 'Safeco', 'Other (type it in)', 'Paying out of pocket / not sure']) assert.ok(o.includes(n), n);
  await p.selectOption('#insurance', { label: 'Other (type it in)' }); assert.equal(await p.isVisible('#insuranceOther'), true);
  await p.selectOption('#insurance', 'Progressive'); assert.equal(await p.isVisible('#insuranceOther'), false);
});
await t('form shows errors when Make/Model are not chosen', async () => {
  await p.selectOption('#vehicleMake', ''); 
  await p.click('.cal button.avail >> nth=1'); await p.waitForSelector('#slots button'); await p.click('#slots button >> nth=2');
  await p.fill('#name', 'Phone Tester'); await p.fill('#phone', '(423) 555-0142'); await p.fill('#description', 'Hail dents on hood and roof.');
  await p.selectOption('#vehicleYear', '2015');
  await p.click('#submit-btn');
  assert.ok(await p.isVisible('#vehicleMake ~ .err:not(:empty), .f.invalid #vehicleMake'));
  assert.equal(await p.$$eval('.f.invalid', (x) => x.length), 2); // make + model
});
await t('full booking submits with selected make/model/insurance and shows the confirmation', async () => {
  await p.selectOption('#vehicleMake', 'Nissan'); await p.selectOption('#vehicleModel', 'Altima'); await p.selectOption('#insurance', 'Progressive');
  await p.click('#submit-btn');
  await p.waitForSelector('#confirm:not([hidden])', { timeout: 15000 });
  assert.match(await p.textContent('#confirm-id'), /^[A-F0-9]+$/);
});
await t('full booking with Other make/model/insurance typed in', async () => {
  await p.goto(BASE + '/book/', { waitUntil: 'load' }); await p.waitForSelector('.cal button.avail');
  await p.click('.cal button.avail >> nth=1'); await p.waitForSelector('#slots button'); await p.click('#slots button >> nth=4');
  await p.fill('#name', 'Other Typer'); await p.fill('#phone', '(423) 555-0143'); await p.fill('#description', 'Scratch along the passenger side.');
  await p.selectOption('#vehicleYear', '1987'); await p.selectOption('#vehicleMake', { label: 'Other (type it in)' });
  await p.fill('#vehicleMakeOther', 'Studebaker'); await p.fill('#vehicleModelOther', 'Avanti');
  await p.selectOption('#insurance', { label: 'Other (type it in)' }); await p.fill('#insuranceOther', 'Tennessee Farmers');
  await p.click('#submit-btn'); await p.waitForSelector('#confirm:not([hidden])', { timeout: 15000 });
});
await t('the owner sees the right vehicle and insurance in admin', async () => {
  const login = await (await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PW }) })).json();
  const h = { authorization: 'Bearer ' + login.token };
  const a = await (await fetch(BASE + '/api/admin/appointments?from=2026-01-01&to=2030-12-31', { headers: h })).json();
  const one = a.appointments.find((x) => x.name === 'Phone Tester'), two = a.appointments.find((x) => x.name === 'Other Typer');
  assert.equal(`${one.vehicleYear} ${one.vehicleMake} ${one.vehicleModel}`, '2015 Nissan Altima'); assert.equal(one.insurance, 'Progressive');
  assert.equal(`${two.vehicleYear} ${two.vehicleMake} ${two.vehicleModel}`, '1987 Studebaker Avanti'); assert.equal(two.insurance, 'Tennessee Farmers');
  for (const x of [one, two]) await fetch(`${BASE}/api/admin/appointments/${x.date}/${x.id}/cancel`, { method: 'POST', headers: h });
});

await t('phone is marked required and shows a clear error when empty', async () => {
  await p.goto(BASE + '/book/', { waitUntil: 'load' }); await p.waitForSelector('.cal button.avail');
  assert.match(await p.textContent('label[for=phone]'), /required/i); assert.equal(await p.getAttribute('#phone', 'aria-required'), 'true');
  await p.click('.cal button.avail >> nth=1'); await p.waitForSelector('#slots button'); await p.click('#slots button >> nth=1');
  await p.fill('#name', 'No Phone'); await p.selectOption('#vehicleYear', '2015'); await p.selectOption('#vehicleMake', 'Ford'); await p.selectOption('#vehicleModel', 'F-150');
  await p.fill('#description', 'Dent in the door panel.'); await p.click('#submit-btn');
  assert.match(await p.textContent('#phone ~ .err'), /required/i);
  await p.fill('#phone', '12345'); await p.click('#submit-btn'); assert.match(await p.textContent('#phone ~ .err'), /10 digits/);
});

// ---------- dictation: the phone's own keyboard mic (no custom mic button) ----------
await t('description is a plain textarea so the keyboard mic works; no custom mic button; hint text; type-only still works', async () => {
  const c = await browser.newContext({ ...pw.devices['iPhone 13'], reducedMotion: 'reduce' });
  const pg = await c.newPage(); await pg.goto(BASE + '/book/', { waitUntil: 'load' });
  assert.equal(await pg.locator('#mic-btn, #dictate, .mic-btn, #mic-privacy').count(), 0, 'no custom mic UI');
  const ta = pg.locator('#description');
  assert.equal(await ta.evaluate((e) => e.tagName), 'TEXTAREA');
  for (const a of ['autocomplete', 'inputmode', 'readonly', 'disabled']) assert.equal(await ta.getAttribute(a), null, a + ' would hide or block the keyboard mic');
  assert.match(await pg.textContent('#description-hint'), /Tap the microphone on your phone's keyboard to describe the damage by voice, or just type it\./);
  assert.equal(await ta.getAttribute('aria-describedby'), 'description-hint');
  await ta.fill('typed only'); assert.equal(await ta.inputValue(), 'typed only');
  const src = await (await fetch(BASE + '/js/book.js')).text(); assert.ok(!/SpeechRecognition/.test(src), 'no Web Speech code shipped');
  const pp = (await fetch(BASE + '/')).headers.get('permissions-policy'); if (pp) assert.match(pp, /microphone=\(\)/);
  await c.close();
});


assert.deepEqual(errors, []);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
