// End-to-end API tests. Run against a local `netlify dev` (default) or any deploy:
//   ADMIN_PASSWORD=... SESSION_SECRET=... BASE=http://localhost:8888 node tests/api.test.mjs   (secrets = same values the server uses)
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

await t('phone is required: missing, blank or <10 digits is rejected with 400', async () => {
  for (const phone of ['', '   ', '555-0100', '(423) 555-01']) {
    const r = await book(D1, '09:00', { phone });
    assert.equal(r.status, 400, `phone "${phone}" should be rejected`); assert.ok(r.body.fields.phone, 'phone error present');
  }
  const fd = new FormData(); // field omitted entirely
  for (const [k, v] of Object.entries({ date: D1, time: '09:00', name: 'No Phone', vehicleYear: '2018', vehicleMake: 'Ford', vehicleModel: 'F-150', description: 'Dent in the door panel.' })) fd.set(k, v);
  const r = await fetch(`${BASE}/api/book`, { method: 'POST', body: fd });
  assert.equal(r.status, 400); const b = await r.json(); assert.match(b.fields.phone, /required/i);
  assert.match((await book(D1, '09:00', { phone: '123' })).body.fields.phone, /10 digits/);
});

let apptId, photoKey;
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

await t('major holidays: dates are right, shop is closed, admin can override', async () => {
  const core = await import('../netlify/lib/core.mjs');
  const h = Object.fromEntries(core.majorHolidays(2026).map((x) => [x.name, x.date]));
  assert.deepEqual(h, { "New Year's Day": '2026-01-01', 'Memorial Day': '2026-05-25', 'Independence Day': '2026-07-04', 'Labor Day': '2026-09-07', 'Thanksgiving Day': '2026-11-26', 'Christmas Day': '2026-12-25' });
  assert.equal(core.majorHolidays(2027).find((x) => x.name === 'Thanksgiving Day').date, '2027-11-25');
  assert.equal(core.majorHolidays(2027).find((x) => x.name === 'Memorial Day').date, '2027-05-31');
  const now = { date: '2026-11-01', minutes: 0 };
  const base = structuredClone(core.DEFAULT_SETTINGS);
  const r = core.computeSlots('2026-11-26', base, [], [], now);          // Thanksgiving (a Thursday)
  assert.equal(r.open, false); assert.equal(r.reason, 'holiday'); assert.equal(r.holiday, 'Thanksgiving Day');
  assert.ok(core.computeSlots('2026-11-25', base, [], [], now).slots.length > 8, 'day before is open');
  const ov = core.sanitizeSettings({ openHolidayDates: ['2026-11-26', '2026-11-27'] }, base);   // 11-27 is not a holiday: dropped
  assert.deepEqual(ov.openHolidayDates, ['2026-11-26']);
  assert.ok(core.computeSlots('2026-11-26', ov, [], [], now).open, 'owner override opens the holiday');
  const off = core.sanitizeSettings({ closeMajorHolidays: false }, base);
  assert.ok(core.computeSlots('2026-11-26', off, [], [], now).open, 'turning the holiday rule off opens it');
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

await t('admin settings include upcoming holidays and persist the holiday rule', async () => {
  const g = (await admin('settings')).body;
  assert.ok(Array.isArray(g.holidays) && g.holidays.length >= 6 && g.holidays[0].name);
  assert.equal(g.settings.closeMajorHolidays, true);
  const orig = g.settings;
  const put = (await admin('settings', { method: 'PUT', body: JSON.stringify({ closeMajorHolidays: false, openHolidayDates: [g.holidays[0].date] }) })).body.settings;
  assert.equal(put.closeMajorHolidays, false); assert.deepEqual(put.openHolidayDates, [g.holidays[0].date]);
  await admin('settings', { method: 'PUT', body: JSON.stringify({ closeMajorHolidays: true, openHolidayDates: [] }) });
  assert.equal((await admin('settings')).body.settings.closeMajorHolidays, true);
});

await t('owner sees appointment details + photo; cancel frees the slot', async () => {
  const list = (await admin(`appointments?from=${D1}&to=${D1}`)).body.appointments;
  const ap = list.find((x) => x.id === apptId); assert.ok(ap, 'appointment listed');
  assert.equal(ap.vehicleMake, 'Ford'); assert.equal(ap.photos.length, 1); photoKey = ap.photos[0];
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


// ---------- photos in the notification email + signed links ----------
const core = await import('../netlify/lib/core.mjs');

await t('email payload attaches photos as base64 with filenames (Resend format)', async () => {
  const jpg = fs.readFileSync(new URL('../src/assets/img/og-image.jpg', import.meta.url));
  const att = core.buildAttachments([{ type: 'image/jpeg', data: jpg }, { type: 'image/png', data: Buffer.from('abc') }], 'damage-ABC');
  assert.equal(att.length, 2);
  assert.deepEqual(att.map((a) => a.filename), ['damage-ABC-1.jpg', 'damage-ABC-2.png']);
  assert.equal(att[0].content, jpg.toString('base64')); assert.equal(att[1].content_type, 'image/png');
  const p = core.buildEmailPayload({ from: 'a@b.co', to: 'm@x.co', subject: 's', text: 't', replyTo: 'c@d.co', attachments: att });
  assert.deepEqual(p.to, ['m@x.co']); assert.equal(p.reply_to, 'c@d.co'); assert.equal(p.attachments.length, 2);
  assert.ok(Object.keys(p.attachments[0]).every((k) => ['filename', 'content', 'content_type'].includes(k)));
  assert.equal(JSON.parse(JSON.stringify(p)).attachments[0].content, att[0].content);
});

await t('email payload omits attachments when there are no photos', async () => {
  const p = core.buildEmailPayload({ from: 'a@b.co', to: ['m@x.co'], subject: 's', text: 't', attachments: [] });
  assert.ok(!('attachments' in p) && !('reply_to' in p));
});

await t('attachments are capped so the email stays under the size limit', async () => {
  const big = Buffer.alloc(900); // pretend sizes via a tiny cap
  const att = core.buildAttachments([1, 2, 3, 4].map(() => ({ type: 'image/jpeg', data: big })), 'x', 2000);
  assert.equal(att.length, 2);
  assert.ok(core.MAX_EMAIL_ATTACH_BYTES <= 20 * 1024 * 1024);
  assert.equal(core.buildAttachments([{ type: 'image/jpeg', data: Buffer.alloc(0) }]).length, 0);
});

await t('signed photo links verify, expire, and reject tampering', async () => {
  const key = '2030-01-02/ABCDEF123456/1';
  const path = core.signedPhotoPath(key, 30); assert.ok(path.startsWith('/api/photo?key='));
  const q = new URL('http://x' + path).searchParams;
  assert.ok(core.verifyPhotoLink(q.get('key'), q.get('exp'), q.get('sig')));
  assert.ok(!core.verifyPhotoLink(q.get('key'), q.get('exp'), q.get('sig') + 'x'));
  assert.ok(!core.verifyPhotoLink('2030-01-02/ABCDEF123456/2', q.get('exp'), q.get('sig')));
  assert.ok(!core.verifyPhotoLink(q.get('key'), q.get('exp'), q.get('sig'), Number(q.get('exp')) + 1));
  assert.equal(core.signedPhotoPath('../etc/passwd'), null);
});

await t('/api/photo serves a photo for a valid signed link only', async () => {
  const path = core.signedPhotoPath(photoKey);
  const ok = await fetch(BASE + path); assert.equal(ok.status, 200); assert.match(ok.headers.get('content-type'), /^image\//);
  assert.ok((await ok.arrayBuffer()).byteLength > 1000);
  assert.equal((await fetch(BASE + path.replace(/sig=./, 'sig=Z'))).status, 403);
  assert.equal((await fetch(`${BASE}/api/photo?key=${encodeURIComponent(photoKey)}`)).status, 403);
});

// ---------- vehicle year / make / model ----------
await t('vehicle parser: new fields, legacy single string, and sanitizing', async () => {
  assert.equal(core.parseVehicle({ vehicleYear: '2015', vehicleMake: 'Nissan', vehicleModel: 'Altima' }).label, '2015 Nissan Altima');
  assert.equal(core.parseVehicle({ vehicle: '2015 Nissan Altima SV' }).label, '2015 Nissan Altima SV');
  const dirty = core.parseVehicle({ vehicleYear: ' 2015 ', vehicleMake: ' <b>Ni\u0000ssan</b> ', vehicleModel: 'Alti   ma' });
  assert.ok(!/[<>\u0000]/.test(dirty.label)); assert.equal(dirty.model, 'Alti ma');
  assert.ok(core.parseVehicle({ vehicleYear: '1850', vehicleMake: 'Ford', vehicleModel: 'T' }).errors.vehicleYear);
  assert.ok(core.parseVehicle({ vehicleYear: String(new Date().getFullYear() + 5), vehicleMake: 'Ford', vehicleModel: 'T' }).errors.vehicleYear);
  const e = core.parseVehicle({}).errors; assert.ok(e.vehicleYear && e.vehicleMake && e.vehicleModel);
});

await t('booking accepts a custom ("Other") make/model and a legacy single vehicle string', async () => {
  const days = (await avail(D3, 1)).days[0];
  const t1 = days.slots[days.slots.length - 1], t2 = days.slots[days.slots.length - 6];
  const r1 = await book(D3, t1, { vehicleYear: '1987', vehicleMake: 'Studebaker', vehicleModel: 'Avanti', name: 'Other Maker' });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const fd = new FormData();
  for (const [k, v] of Object.entries({ date: D3, time: t2, name: 'Legacy Client', phone: '4235550101', vehicle: '2015 Nissan Altima', description: 'Door ding on the left side.' })) fd.set(k, v);
  const r2 = await fetch(`${BASE}/api/book`, { method: 'POST', body: fd }); assert.equal(r2.status, 200, await r2.text());
  const list = (await admin(`appointments?from=${D3}&to=${D3}`)).body.appointments;
  const a = list.find((x) => x.name === 'Other Maker'), b = list.find((x) => x.name === 'Legacy Client');
  assert.equal(`${a.vehicleYear} ${a.vehicleMake} ${a.vehicleModel}`, '1987 Studebaker Avanti');
  assert.equal(`${b.vehicleYear} ${b.vehicleMake} ${b.vehicleModel}`, '2015 Nissan Altima');
  for (const x of [a, b]) await admin(`appointments/${D3}/${x.id}/cancel`, { method: 'POST' });
});

await t('static vehicle list covers common makes and has no duplicates', async () => {
  const src = fs.readFileSync(new URL('../src/js/vehicles.js', import.meta.url), 'utf8');
  const data = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
  for (const m of ['Ford', 'Chevrolet', 'Toyota', 'Honda', 'Nissan', 'Dodge', 'Ram', 'Jeep', 'GMC', 'Hyundai', 'Kia', 'Subaru', 'Mazda', 'Volkswagen', 'BMW', 'Mercedes-Benz', 'Audi', 'Buick', 'Cadillac', 'Chrysler', 'Lincoln', 'Mitsubishi', 'Volvo', 'Lexus', 'Acura', 'Infiniti', 'Tesla']) assert.ok(data[m]?.length >= 3, m);
  for (const [m, list] of Object.entries(data)) assert.equal(new Set(list).size, list.length, 'dupes in ' + m);
  assert.ok(data.Ford.includes('F-150') && data.Nissan.includes('Altima') && data.Chevrolet.includes('Silverado 1500'));
});

// cleanup the race-test booking
const left = (await admin(`appointments?from=${D2}&to=${D2}`)).body.appointments || [];
for (const a of left.filter((x) => x.name.startsWith('Racer'))) await admin(`appointments/${D2}/${a.id}/cancel`, { method: 'POST' });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
