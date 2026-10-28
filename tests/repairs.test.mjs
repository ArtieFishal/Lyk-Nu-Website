// Repair-status tracker tests. Same setup as api.test.mjs:
//   ADMIN_PASSWORD=... SESSION_SECRET=... BASE=http://localhost:8888 node tests/repairs.test.mjs
// All data is obviously fake (work orders 99xxxxx, 555-01xx phones) and removed at the end.
import assert from 'node:assert/strict';
import http from 'node:http';

const BASE = process.env.BASE || 'http://localhost:8888';
const PW = process.env.ADMIN_PASSWORD;
if (!PW) { console.error('Set ADMIN_PASSWORD to the same value the server uses.'); process.exit(2); }
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } }

let token = '';
const admin = async (path, opts = {}) => {
  const r = await fetch(`${BASE}/api/admin/${path}`, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, body: await r.json() };
};
let ipN = 10;
const A = 1 + Math.floor(Math.random() * 250), B = 1 + Math.floor(Math.random() * 250);
const freshIp = () => `198.51.${A}.${B}.${ipN++}`; // unique per run; the local server and netlify dev pass x-nf-client-connection-ip through (Netlify itself overwrites it in production)
const lookup = async (workOrder, last4, ip = freshIp()) => {
  const r = await fetch(`${BASE}/api/status`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip }, body: JSON.stringify({ workOrder, last4 }) });
  return { status: r.status, body: await r.json(), headers: r.headers };
};
const run = String(Date.now()).slice(-5);
const WO = `99${run}`, WO2 = `98${run}`, WO3 = `97${run}`, WO4 = `96${run}`;
const created = [];
const mk = (wo, extra = {}) => ({ workOrder: wo, name: 'Demo Testerson', phone: '(555) 010-4242', email: 'demo.customer@example.com', vehicleYear: '2019', vehicleMake: 'Ford', vehicleModel: 'F-150', stage: 'estimate', ...extra });

console.log(`Testing repairs at ${BASE}`);
const login = await admin('login', { method: 'POST', body: JSON.stringify({ password: PW }) });
assert.equal(login.status, 200); token = login.body.token;

await t('repairs admin API requires login (401 without token)', async () => {
  token = '';
  for (const [p, o] of [['repairs', {}], ['repairs', { method: 'POST', body: JSON.stringify(mk(WO)) }], [`repairs/${WO}`, { method: 'DELETE' }], [`repairs/${WO}/advance`, { method: 'POST' }]]) {
    const r = await admin(p, o); assert.equal(r.status, 401, `${o.method || 'GET'} ${p}`);
  }
  token = login.body.token;
});

await t('create a repair; duplicate work order is rejected (409) with a field error', async () => {
  const a = await admin('repairs', { method: 'POST', body: JSON.stringify(mk(WO, { note: 'DEMO DATA note' })) });
  assert.equal(a.status, 201, JSON.stringify(a.body)); created.push(WO);
  assert.equal(a.body.repair.history.length, 1); assert.equal(a.body.repair.history[0].stage, 'estimate');
  const dup = await admin('repairs', { method: 'POST', body: JSON.stringify(mk(WO, { name: 'Someone Else' })) });
  assert.equal(dup.status, 409); assert.ok(dup.body.fields?.workOrder);
  assert.equal((await admin(`repairs/${WO}`)).body.repair.name, 'Demo Testerson', 'original untouched');
});

await t('create validates work order, name, phone, email, vehicle and stage', async () => {
  const bad = await admin('repairs', { method: 'POST', body: JSON.stringify({ workOrder: 'abc', name: '', phone: '123', email: 'nope', stage: 'bogus' }) });
  assert.equal(bad.status, 400);
  for (const k of ['workOrder', 'name', 'phone', 'email', 'stage']) assert.ok(bad.body.fields[k], 'field error for ' + k);
});

await t('public lookup succeeds with work order + last 4 and returns only safe fields', async () => {
  const r = await lookup(WO, '4242');
  assert.equal(r.status, 200);
  const rep = r.body.repair, raw = JSON.stringify(r.body);
  assert.equal(rep.workOrder, WO); assert.equal(rep.customer, 'Demo T.'); assert.equal(rep.vehicle, '2019 Ford F-150');
  assert.equal(rep.stage, 'estimate'); assert.equal(rep.stages.length, 9); assert.equal(rep.stageCount, 9);
  assert.equal(rep.note, 'DEMO DATA note'); assert.equal(rep.history.length, 1);
  assert.ok(rep.shopPhone.includes('562-5156'));
});

await t('public response never leaks phone, email, or the full last name', async () => {
  const r = await lookup(WO, '4242'); const raw = JSON.stringify(r.body);
  for (const bad of ['4242', '010-', '5550104', 'demo.customer', '@example.com', 'Testerson']) assert.ok(!raw.includes(bad), 'leaked ' + bad);
  for (const k of ['phone', 'email', 'name']) assert.ok(!(k in r.body.repair), 'has key ' + k);
  const err = await lookup(WO, '0000'); assert.ok(!JSON.stringify(err.body).includes('Testerson'));
});

await t('wrong last 4 and unknown work order give the identical generic "not found, call us" error', async () => {
  const wrong = await lookup(WO, '0000'), unknown = await lookup('9900000', '4242');
  assert.equal(wrong.status, 404); assert.equal(unknown.status, 404);
  assert.deepEqual(wrong.body, unknown.body);
  assert.match(wrong.body.error, /call us at \(423\) 562-5156/);
  assert.ok(!('repair' in wrong.body));
});

await t('malformed lookups are rejected (400) and GET is not allowed', async () => {
  assert.equal((await lookup('', '4242')).status, 400); assert.equal((await lookup(WO, '42')).status, 400);
  assert.equal((await lookup('12ab', '4242')).status, 400); assert.equal((await lookup(WO, 'abcd')).status, 400);
  assert.equal((await fetch(`${BASE}/api/status?workOrder=${WO}&last4=4242`)).status, 405);
});

await t('stage history grows on each change, in order; edits without a stage change do not add history', async () => {
  const adv = await admin(`repairs/${WO}/advance`, { method: 'POST', body: '{}' });
  assert.equal(adv.status, 200); assert.equal(adv.body.repair.stage, 'insurance'); assert.equal(adv.body.emailed, 'none');
  const put = await admin(`repairs/${WO}`, { method: 'PUT', body: JSON.stringify({ stage: 'paint', waitingOnParts: true, estimatedCompletion: '2026-12-15' }) });
  assert.equal(put.status, 200); assert.equal(put.body.repair.stage, 'paint'); assert.equal(put.body.emailed, 'none');
  const noteOnly = await admin(`repairs/${WO}`, { method: 'PUT', body: JSON.stringify({ note: 'DEMO DATA: second note' }) });
  assert.equal(noteOnly.status, 200);
  const h = noteOnly.body.repair.history.map((x) => x.stage);
  assert.deepEqual(h, ['estimate', 'insurance', 'paint']);
  const pub = (await lookup(WO, '4242')).body.repair;
  assert.deepEqual(pub.history.map((x) => x.stage), ['estimate', 'insurance', 'paint']);
  assert.equal(pub.history[2].label, 'Paint'); assert.equal(pub.stageIndex, 5); assert.equal(pub.waitingOnParts, true);
  assert.equal(pub.estimatedCompletion, '2026-12-15'); assert.equal(pub.note, 'DEMO DATA: second note');
  assert.ok(pub.history.every((x) => !Number.isNaN(Date.parse(x.at))));
});

await t('picked up needs "Ready for pickup" first; archived repairs leave the active list and can be restored; delete works', async () => {
  const early = await admin(`repairs/${WO}/pickup`, { method: 'POST' }); assert.equal(early.status, 400);
  assert.equal((await admin(`repairs/${WO}`, { method: 'PUT', body: JSON.stringify({ stage: 'ready' }) })).status, 200);
  const done = await admin(`repairs/${WO}/pickup`, { method: 'POST' });
  assert.equal(done.status, 200); assert.equal(done.body.repair.archived, true);
  assert.equal(done.body.repair.history.at(-1).stage, 'picked-up');
  assert.ok(!(await admin('repairs?archived=0')).body.repairs.some((r) => r.workOrder === WO), 'hidden from active list');
  assert.ok((await admin('repairs?archived=1')).body.repairs.some((r) => r.workOrder === WO), 'shown with picked-up');
  assert.equal((await admin(`repairs/${WO}`, { method: 'PUT', body: JSON.stringify({ stage: 'paint' }) })).status, 400, 'archived stage is locked');
  assert.equal((await admin(`repairs/${WO}/restore`, { method: 'POST' })).body.repair.archived, false);
  const gone = await admin('repairs', { method: 'POST', body: JSON.stringify(mk(WO2, { name: 'Delete Me' })) }); assert.equal(gone.status, 201);
  assert.equal((await admin(`repairs/${WO2}`, { method: 'DELETE' })).status, 200);
  assert.equal((await admin(`repairs/${WO2}`)).status, 404);
  assert.equal((await lookup(WO2, '4242')).status, 404, 'deleted repair is not found publicly');
});

await t('admin list: active first, newest update first; search by work order number or name', async () => {
  for (const [wo, name] of [[WO3, `Zed Alpha${run}`], [WO4, `Yan Bravo${run}`]]) { assert.equal((await admin('repairs', { method: 'POST', body: JSON.stringify(mk(wo, { name })) })).status, 201); created.push(wo); }
  await admin(`repairs/${WO3}`, { method: 'PUT', body: JSON.stringify({ stage: 'ready' }) }); await admin(`repairs/${WO3}/pickup`, { method: 'POST' });
  const all = (await admin('repairs?archived=1')).body.repairs; const i3 = all.findIndex((r) => r.workOrder === WO3), i4 = all.findIndex((r) => r.workOrder === WO4);
  assert.ok(i4 >= 0 && i3 > i4, 'active before picked up');
  assert.deepEqual((await admin(`repairs?q=${WO4}`)).body.repairs.map((r) => r.workOrder), [WO4]);
  assert.deepEqual((await admin(`repairs?q=yan%20bravo${run}`)).body.repairs.map((r) => r.workOrder), [WO4]);
  assert.equal((await admin('repairs?q=zzzznomatch')).body.repairs.length, 0);
  assert.equal((await admin('repairs')).body.stages.length, 9);
});

// ---- throttling (only failures count; per work order and per IP) ----
const WO5 = `95${run}`;
await t('throttling: 8 failed tries on one work order lock it, even for the right last 4 (429 + Retry-After)', async () => {
  assert.equal((await admin('repairs', { method: 'POST', body: JSON.stringify(mk(WO5, { name: 'Throttle Test' })) })).status, 201); created.push(WO5);
  for (let i = 0; i < 3; i++) assert.equal((await lookup(WO5, '4242')).status, 200, 'successes do not count');
  for (let i = 0; i < 8; i++) assert.equal((await lookup(WO5, '0000')).status, 404, `failure ${i + 1}`); // each from a different IP
  const locked = await lookup(WO5, '4242');
  assert.equal(locked.status, 429); assert.ok(Number(locked.headers.get('retry-after')) >= 60); assert.match(locked.body.error, /call us/i);
  assert.ok(!('repair' in locked.body));
});

await t('throttling: one IP making 20 failed guesses across different work orders is locked out', async () => {
  const ip = freshIp();
  for (let i = 0; i < 20; i++) assert.equal((await lookup(`94${run}${i}`.slice(0, 10), '1111', ip)).status, 404, `failure ${i + 1}`);
  const r = await lookup(WO, '4242', ip);
  assert.equal(r.status, 429, 'valid lookup from the locked IP is refused');
  assert.equal((await lookup(WO, '4242', freshIp())).status, 200, 'other IPs are not affected');
});

// ---- customer email (Resend mocked) ----
const mails = [];
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { mails.push({ auth: req.headers.authorization, body: JSON.parse(b || '{}') }); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"mock"}'); }); });
await new Promise((ok) => mock.listen(9911, ok));
Object.assign(process.env, { RESEND_API_KEY: 'test-key', NOTIFY_FROM: 'Shop <shop@example.com>', RESEND_API_URL: 'http://localhost:9911' });
const lib = await import('../netlify/lib/repairs.mjs');

await t('email: stage-change message has stage, note, status link + work order, and never the phone digits', async () => {
  const rec = { workOrder: '8123', name: 'Jane Demo', phone: '(555) 010-4242', email: 'jane@example.com', vehicleYear: '2019', vehicleMake: 'Ford', vehicleModel: 'F-150', stage: 'paint', note: 'DEMO: Paint goes on today.', waitingOnParts: false, estimatedCompletion: '2026-12-15' };
  const m = lib.buildRepairEmail(rec, 'https://shop.example.com/');
  assert.match(m.subject, /Paint/); assert.match(m.subject, /8123/);
  for (const s of ['Hi Jane,', 'Current stage: Paint (step 6 of 9)', 'DEMO: Paint goes on today.', 'https://shop.example.com/status/?wo=8123', 'work order number (8123)', 'estimated completion'.replace('estimated', 'Estimated'), '(423) 562-5156']) assert.ok(m.text.includes(s), 'missing: ' + s);
  for (const bad of ['4242', '010-', '5550104']) assert.ok(!m.text.includes(bad) && !m.subject.includes(bad), 'leaked ' + bad);
  mails.length = 0;
  assert.equal(await lib.emailCustomer(rec, 'https://shop.example.com'), 'sent');
  assert.equal(mails.length, 1); assert.equal(mails[0].auth, 'Bearer test-key');
  assert.deepEqual(mails[0].body.to, ['jane@example.com']); assert.equal(mails[0].body.from, 'Shop <shop@example.com>');
  assert.equal(mails[0].body.text, m.text); assert.equal(mails[0].body.subject, m.subject);
  assert.ok(!JSON.stringify(mails[0].body).includes('4242'));
});

await t('email: fails gracefully when Resend is not configured, errors, or the repair has no email', async () => {
  const rec = { workOrder: '8124', name: 'Jane Demo', phone: '5550100000', email: 'jane@example.com', vehicleYear: '2019', vehicleMake: 'Ford', vehicleModel: 'F-150', stage: 'body' };
  const saved = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  assert.equal(await lib.emailCustomer(rec, 'https://x.test'), 'skipped');
  process.env.RESEND_API_KEY = saved;
  assert.equal(await lib.emailCustomer({ ...rec, email: '' }, 'https://x.test'), 'none');
  const url = process.env.RESEND_API_URL; process.env.RESEND_API_URL = 'http://localhost:59999'; // nothing listening
  assert.equal(await lib.emailCustomer(rec, 'https://x.test'), 'failed');
  process.env.RESEND_API_URL = url;
});

await t('email via the admin API: only when the stage changes AND "notify" is on (sent, or skipped if the server has no Resend)', async () => {
  mails.length = 0;
  const noMail = await admin(`repairs/${WO4}`, { method: 'PUT', body: JSON.stringify({ stage: 'parts', notify: false }) });
  assert.equal(noMail.body.emailed, 'none');
  const sameStage = await admin(`repairs/${WO4}`, { method: 'PUT', body: JSON.stringify({ note: 'DEMO DATA note only', notify: true }) });
  assert.equal(sameStage.body.emailed, 'none', 'no stage change, no email');
  const yes = await admin(`repairs/${WO4}`, { method: 'PUT', body: JSON.stringify({ stage: 'disassembly', note: 'DEMO DATA: teardown started', notify: true }) });
  assert.ok(['sent', 'skipped'].includes(yes.body.emailed), yes.body.emailed);
  if (yes.body.emailed === 'sent') {
    assert.equal(mails.length, 1, 'exactly one email'); assert.deepEqual(mails[0].body.to, ['demo.customer@example.com']);
    assert.match(mails[0].body.text, /Disassembly/); assert.match(mails[0].body.text, /teardown started/); assert.ok(!mails[0].body.text.includes('4242'));
  } else console.log('      (server has no RESEND_* env, so the end-to-end email was skipped as designed)');
  const adv = await admin(`repairs/${WO4}/advance`, { method: 'POST', body: JSON.stringify({ notify: true }) });
  assert.ok(['sent', 'skipped'].includes(adv.body.emailed));
});

for (const wo of created) await admin(`repairs/${wo}`, { method: 'DELETE' });
mock.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
