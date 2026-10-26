// End-to-end API tests. Run against a local `netlify dev` (default) or any deploy:
//   ADMIN_PASSWORD=... BASE=http://localhost:8888 node tests/api.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8888';
const PW = process.env.ADMIN_PASSWORD;
if (!PW) { console.error('Set ADMIN_PASSWORD to the same value the server uses.'); process.exit(2); }
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } }

const avail = async (start, days = 1) => (await fetch(`${BASE}/api/availability?start=${start}&days=${days}`)).json();
const book = async (date, time, extra = {}, photo) => {
  const fd = new FormData();
  const f = { date, time, name: 'Test Customer', phone: '(423) 555-0100', email: 'test@example.com', vehicleYear: '2018', vehicleMake: 'Ford', vehicleModel: 'F-150', description: 'Rear bumper dent from parking lot.', ...extra };
  for (const [k, v] of Object.entries(f)) fd.set(k, v);
  if (photo) fd.append('photos', new Blob([photo], { type: 'image/jpeg' }), 'damage.jpg');
  const r = await fetch(`${BASE}/api/book`, { method: 'POST', body: fd });
  return { status: r.status, body: await r.json() };
};
let token = '';
const admin = async (path, opts = {}) => {
  const r = await fetch(`${BASE}/api/admin/${path}`, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() };
};

console.log(`Testing ${BASE}`);
const first = await avail('', 62);
const openDays = first.days.filter((d) => d.open && d.slots.length >= 8).map((d) => d.date);
assert.ok(openDays.length >= 4, 'need at least 4 open days in next 62 days');
// use days far enough out that test runs don't collide with demo data
const [D1, D2, D3, D4] = openDays.slice(-4);
console.log(`  test days: ${D1} ${D2} ${D3} ${D4}`);

await t('availability lists weekday slots and hides weekends', async () => {
  assert.ok(first.days.some((d) => !d.open), 'some days closed');
  for (const d of first.days) {
    const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) assert.equal(d.open, false, `${d.date} weekend should be closed`);
  }
});

await t('validation rejects bad input with field errors (400)', async () => {
  const r = await book(D1, '09:00', { phone: '123', vehicleYear: 'abcd', description: '' });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.phone && r.body.fields.vehicleYear && r.body.fields.description);
});

let apptId;
await t('booking an open slot succeeds (with photo upload)', async () => {
  const jpg = fs.readFileSync(new URL('../src/assets/img/og-image.jpg', import.meta.url));
  const r = await book(D1, '10:00', {}, jpg);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.ok && r.body.id); apptId = r.body.id;
});

await t('booked slot disappears from availability', async () => {
  const a = await avail(D1); assert.ok(!a.days[0].slots.includes('10:00'));
  assert.ok(a.days[0].slots.includes('10:20'));
});

await t('double-booking the same slot is rejected (409)', async () => {
  const r = await book(D1, '10:00', { name: 'Second Person' });
  assert.equal(r.status, 409); assert.match(r.body.error, /just taken|no longer available/);
});

await t('10 simultaneous requests for one slot → exactly 1 succeeds', async () => {
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => book(D2, '11:00', { name: `Racer ${i}` })));
  const ok = rs.filter((r) => r.status === 200).length, conflict = rs.filter((r) => r.status === 409).length;
  assert.equal(ok, 1, `successes=${ok} statuses=${rs.map((r) => r.status)}`); assert.equal(conflict, 9);
});

await t('times outside hours / on closed days are rejected', async () => {
  assert.equal((await book(D1, '06:00')).status, 409);
  assert.equal((await book(D1, '10:15')).status, 409); // not on the slot grid
  const sat = first.days.find((d) => new Date(d.date + 'T12:00:00Z').getUTCDay() === 6).date;
  assert.equal((await book(sat, '10:00')).status, 409);
});

await t('admin API requires login (401 without token)', async () => {
  assert.equal((await admin('appointments')).status, 401);
  token = 'forged.token'; assert.equal((await admin('settings')).status, 401); token = '';
});

await t('wrong admin password is rejected (401)', async () => {
  const r = await admin('login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) });
  assert.equal(r.status, 401);
});

await t('built-in defaults: 20-minute estimates, 1 car per slot, notify email from config', async () => {
  const core = await import('../netlify/lib/core.mjs');
  assert.equal(core.DEFAULT_SETTINGS.slotMinutes, 20); assert.equal(core.DEFAULT_SETTINGS.capacityPerSlot, 1);
  assert.equal(core.DEFAULT_NOTIFY_TO, 'mikefreeman@lyknu.com');
});

await t('correct admin password returns a working token', async () => {
  const r = await admin('login', { method: 'POST', body: JSON.stringify({ password: PW }) });
  assert.equal(r.status, 200); token = r.body.token;
  assert.equal((await admin('settings')).status, 200);
});

let blockId;
await t('blocking 1:00–3:00 PM removes those slots and rejects bookings in it', async () => {
  const r = await admin('blocks', { method: 'POST', body: JSON.stringify({ startDate: D3, endDate: D3, allDay: false, startTime: '13:00', endTime: '15:00', reason: 'test' }) });
  assert.equal(r.status, 200); blockId = r.body.block.id;
  const a = await avail(D3);
  for (const s of ['13:00', '13:20', '13:40', '14:00', '14:20', '14:40']) assert.ok(!a.days[0].slots.includes(s), `${s} should be blocked`);
  assert.ok(a.days[0].slots.includes('12:40') && a.days[0].slots.includes('15:00'));
  assert.equal((await book(D3, '13:20')).status, 409);
});

await t('removing the block re-opens the times', async () => {
  assert.equal((await admin('blocks/' + blockId, { method: 'DELETE' })).status, 200);
  assert.ok((await avail(D3)).days[0].slots.includes('13:20'));
});

await t('all-day block closes the whole day', async () => {
  const r = await admin('blocks', { method: 'POST', body: JSON.stringify({ startDate: D4, allDay: true, reason: 'test day off' }) });
  const a = await avail(D4); assert.equal(a.days[0].open, false); assert.equal(a.days[0].slots.length, 0);
  assert.equal((await book(D4, '09:00')).status, 409);
  await admin('blocks/' + r.body.block.id, { method: 'DELETE' });
});

await t('changing weekly hours updates availability (close a weekday, change slot length)', async () => {
  const orig = (await admin('settings')).body.settings;
  const dow = new Date(D3 + 'T12:00:00Z').getUTCDay();
  const weekly = { ...orig.weekly, [dow]: null };
  await admin('settings', { method: 'PUT', body: JSON.stringify({ weekly }) });
  assert.equal((await avail(D3)).days[0].open, false);
  await admin('settings', { method: 'PUT', body: JSON.stringify({ weekly: orig.weekly, slotMinutes: 60 }) });
  const s = (await avail(D3)).days[0].slots; assert.ok(s.includes('09:00') && !s.includes('09:20'));
  await admin('settings', { method: 'PUT', body: JSON.stringify(orig) });
  assert.ok((await avail(D3)).days[0].slots.includes('09:20'));
});

await t('owner sees appointment details + photo; cancel frees the slot', async () => {
  const list = (await admin(`appointments?from=${D1}&to=${D1}`)).body.appointments;
  const ap = list.find((x) => x.id === apptId); assert.ok(ap, 'appointment listed');
  assert.equal(ap.vehicleMake, 'Ford'); assert.equal(ap.photos.length, 1);
  const ph = await admin('photo?key=' + encodeURIComponent(ap.photos[0])); assert.equal(ph.status, 200); assert.ok(ph.body.byteLength > 1000);
  token = ''; assert.equal((await admin('photo?key=' + encodeURIComponent(ap.photos[0]))).status, 401);
  token = (await admin('login', { method: 'POST', body: JSON.stringify({ password: PW }) })).body.token;
  assert.equal((await admin(`appointments/${D1}/${apptId}/cancel`, { method: 'POST' })).status, 200);
  assert.ok((await avail(D1)).days[0].slots.includes('10:00'));
});

await t('public availability never exposes customer data', async () => {
  const txt = await (await fetch(`${BASE}/api/availability?start=${D2}&days=1`)).text();
  assert.ok(!/Racer|555-0100|example\.com/.test(txt));
});

// cleanup the race-test booking
const left = (await admin(`appointments?from=${D2}&to=${D2}`)).body.appointments || [];
for (const a of left.filter((x) => x.name.startsWith('Racer'))) await admin(`appointments/${D2}/${a.id}/cancel`, { method: 'POST' });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
