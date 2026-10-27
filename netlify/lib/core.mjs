// Shared booking logic for Lyk-Nu Netlify Functions.
// Storage: Netlify Blobs (store "lyknu-booking"). All times are shop-local wall
// clock times ("HH:MM") on shop-local dates ("YYYY-MM-DD") in SHOP_TIMEZONE.
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import siteConfig from '../../business.config.json' with { type: 'json' };

export const TZ = process.env.SHOP_TIMEZONE || 'America/New_York';
// Default booking-notification recipient (env NOTIFY_TO overrides). Emails only go out once RESEND_API_KEY + NOTIFY_FROM are set.
export const DEFAULT_NOTIFY_TO = siteConfig.notifyEmail || '';
export const BUSINESS_NAME = process.env.BUSINESS_NAME || 'Lyk-Nu Auto Collision & Service Center';

export const DEFAULT_SETTINGS = {
  slotMinutes: 20,          // length of one estimate appointment (owner can change on /admin)
  capacityPerSlot: 1,       // how many estimates can be booked at the same time
  minNoticeHours: 2,        // customers can't book closer than this to "now"
  maxDaysAhead: 60,         // how far ahead customers can book
  // 0 = Sunday ... 6 = Saturday. null = closed. breakStart/breakEnd optional (e.g. lunch).
  weekly: {
    0: null,
    1: { open: '08:00', close: '17:00', breakStart: '', breakEnd: '' },
    2: { open: '08:00', close: '17:00', breakStart: '', breakEnd: '' },
    3: { open: '08:00', close: '17:00', breakStart: '', breakEnd: '' },
    4: { open: '08:00', close: '17:00', breakStart: '', breakEnd: '' },
    5: { open: '08:00', close: '17:00', breakStart: '', breakEnd: '' },
    6: null,
  },
  closeMajorHolidays: true, // customers can't book on major US holidays (the shop is closed)
  openHolidayDates: [],     // specific holiday dates (YYYY-MM-DD) the owner chose to open anyway
  bookingMessage: '',       // optional notice shown on the booking page
};

export function store() {
  return getStore({ name: 'lyknu-booking', consistency: 'strong' });
}
export function uploadStore() {
  return getStore({ name: 'lyknu-uploads', consistency: 'strong' });
}

// ---------- helpers ----------
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const dow = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};

/** Current date and minute-of-day in the shop's timezone. */
export function shopNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// ---------- major holidays (shop is closed) ----------
const pad = (n) => String(n).padStart(2, '0');
/** Date of the nth (1-based) weekday `wd` (0=Sun) in a month, or the last one when n === -1. */
function nthWeekday(y, m, wd, n) {
  if (n > 0) { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; }
  const last = new Date(Date.UTC(y, m, 0)); return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7);
}
/** The shop's closed holidays for a year: New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving, Christmas. */
export function majorHolidays(y) {
  return [
    { date: `${y}-01-01`, name: "New Year's Day" },
    { date: `${y}-05-${pad(nthWeekday(y, 5, 1, -1))}`, name: 'Memorial Day' },
    { date: `${y}-07-04`, name: 'Independence Day' },
    { date: `${y}-09-${pad(nthWeekday(y, 9, 1, 1))}`, name: 'Labor Day' },
    { date: `${y}-11-${pad(nthWeekday(y, 11, 4, 4))}`, name: 'Thanksgiving Day' },
    { date: `${y}-12-25`, name: 'Christmas Day' },
  ];
}
export const majorHolidayName = (date) => (isDate(date) ? majorHolidays(Number(date.slice(0, 4))).find((h) => h.date === date)?.name : undefined) || '';
/** Holidays from `fromDate` forward, for the admin page. */
export function upcomingHolidays(fromDate, count = 8) {
  const y = Number(fromDate.slice(0, 4));
  return [y, y + 1, y + 2].flatMap(majorHolidays).filter((h) => h.date >= fromDate).slice(0, count);
}

export function sanitizeSettings(input, base = DEFAULT_SETTINGS) {
  const s = structuredClone(base);
  if (!input || typeof input !== 'object') return s;
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  if ('slotMinutes' in input) s.slotMinutes = int(input.slotMinutes, 10, 240, s.slotMinutes);
  if ('capacityPerSlot' in input) s.capacityPerSlot = int(input.capacityPerSlot, 1, 20, s.capacityPerSlot);
  if ('minNoticeHours' in input) s.minNoticeHours = int(input.minNoticeHours, 0, 168, s.minNoticeHours);
  if ('maxDaysAhead' in input) s.maxDaysAhead = int(input.maxDaysAhead, 1, 365, s.maxDaysAhead);
  if ('closeMajorHolidays' in input) s.closeMajorHolidays = input.closeMajorHolidays === true || input.closeMajorHolidays === 'true';
  if (Array.isArray(input.openHolidayDates)) s.openHolidayDates = [...new Set(input.openHolidayDates.filter((d) => majorHolidayName(d)))].sort().slice(0, 24);
  if ('bookingMessage' in input) s.bookingMessage = String(input.bookingMessage || '').slice(0, 500);
  if (input.weekly && typeof input.weekly === 'object') {
    for (let d = 0; d < 7; d++) {
      const v = input.weekly[d] ?? input.weekly[String(d)];
      if (v === undefined) continue;
      if (!v || !isTime(v.open) || !isTime(v.close) || toMin(v.close) <= toMin(v.open)) { s.weekly[d] = null; continue; }
      const day = { open: v.open, close: v.close, breakStart: '', breakEnd: '' };
      if (isTime(v.breakStart) && isTime(v.breakEnd) && toMin(v.breakEnd) > toMin(v.breakStart)) {
        day.breakStart = v.breakStart; day.breakEnd = v.breakEnd;
      }
      s.weekly[d] = day;
    }
  }
  return s;
}

export async function getSettings() {
  const raw = await store().get('settings', { type: 'json' });
  return sanitizeSettings(raw || {}, DEFAULT_SETTINGS);
}

export async function getBlocks() {
  const r = await store().getWithMetadata('blocks', { type: 'json' });
  return { blocks: Array.isArray(r?.data) ? r.data : [], etag: r?.etag };
}

export async function getDay(date) {
  const r = await store().getWithMetadata(`days/${date}`, { type: 'json' });
  return { appts: Array.isArray(r?.data?.appts) ? r.data.appts : [], etag: r?.etag };
}

/** Optimistic-concurrency update of a JSON blob. mutate(current) returns new value or throws. */
export async function casUpdate(key, read, mutate, { tries = 8, verify } = {}) {
  const s = store();
  for (let i = 0; i < tries; i++) {
    const r = await s.getWithMetadata(key, { type: 'json' });
    const current = read(r?.data);
    const next = await mutate(current);
    const res = r ? await s.setJSON(key, next, { onlyIfMatch: r.etag }) : await s.setJSON(key, next, { onlyIfNew: true });
    if (res.modified) {
      if (!verify) return next;
      // Defense in depth: confirm our write survived (guards against a store whose
      // conditional writes are not atomic, e.g. some local emulators). If it was
      // overwritten, loop again: mutate() re-validates against the winner's data.
      await new Promise((ok) => setTimeout(ok, 150));
      const check = await s.get(key, { type: 'json' });
      if (verify(check)) return next;
      continue;
    }
    await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 120));
  }
  const e = new Error('Busy, please try again.'); e.status = 409; throw e;
}

/** Is [startMin, endMin) on `date` covered by a block? */
export function blockedRanges(date, blocks) {
  const out = [];
  for (const b of blocks) {
    if (!b || date < b.startDate || date > (b.endDate || b.startDate)) continue;
    if (b.allDay || !b.startTime || !b.endTime) out.push([0, 24 * 60]);
    else out.push([toMin(b.startTime), toMin(b.endTime)]);
  }
  return out;
}

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/**
 * Compute the slot list for one date.
 * Returns { open:boolean, reason?:string, slots:[{time, available}] }
 */
export function computeSlots(date, settings, blocks, appts, now = shopNow()) {
  const day = settings.weekly[dow(date)];
  if (!day) return { open: false, reason: 'closed', slots: [] };
  if (date < now.date) return { open: false, reason: 'past', slots: [] };
  if (date > addDays(now.date, settings.maxDaysAhead)) return { open: false, reason: 'too-far', slots: [] };
  const holiday = majorHolidayName(date);
  if (holiday && settings.closeMajorHolidays !== false && !(settings.openHolidayDates || []).includes(date)) return { open: false, reason: 'holiday', holiday, slots: [] };
  const len = settings.slotMinutes;
  const ranges = blockedRanges(date, blocks);
  if (ranges.some(([a, b]) => a <= toMin(day.open) && b >= toMin(day.close))) return { open: false, reason: 'blocked', slots: [] };

  // earliest allowed start (minutes after this date's midnight), honoring minimum notice
  const daysBetween = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(now.date + 'T00:00:00Z')) / 86400000);
  const earliest = now.minutes + Math.max(1, settings.minNoticeHours * 60) - daysBetween * 1440;
  const active = appts.filter((a) => a.status !== 'canceled');
  const slots = [];
  const open = toMin(day.open), close = toMin(day.close);
  const bs = day.breakStart ? toMin(day.breakStart) : null, be = day.breakEnd ? toMin(day.breakEnd) : null;
  for (let t = open; t + len <= close; t += len) {
    let available = t >= earliest;
    if (available && bs !== null && overlaps(t, t + len, bs, be)) continue; // break: not shown at all
    if (available && ranges.some(([a, b]) => overlaps(t, t + len, a, b))) available = false;
    if (available) {
      const used = active.filter((a) => overlaps(t, t + len, toMin(a.time), toMin(a.time) + (a.duration || len))).length;
      if (used >= settings.capacityPerSlot) available = false;
    }
    slots.push({ time: toHHMM(t), available });
  }
  return { open: true, slots };
}

// ---------- admin auth ----------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function authKey() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return crypto.createHash('sha256').update('lyknu-admin:' + pw + ':' + (process.env.SESSION_SECRET || '')).digest();
}
export function checkPassword(given) {
  const pw = process.env.ADMIN_PASSWORD || '';
  if (!pw || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(pw).digest();
  return crypto.timingSafeEqual(a, b);
}
export function makeToken(hours = 12) {
  const key = authKey();
  const exp = String(Date.now() + hours * 3600e3);
  const sig = crypto.createHmac('sha256', key).update(exp).digest();
  return b64u(exp) + '.' + b64u(sig);
}
export function verifyToken(req) {
  const key = authKey();
  if (!key) return false;
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [p, s] = tok.split('.');
  if (!p || !s) return false;
  const exp = Buffer.from(p, 'base64url').toString();
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expect = crypto.createHmac('sha256', key).update(exp).digest();
  const got = Buffer.from(s, 'base64url');
  return got.length === expect.length && crypto.timingSafeEqual(got, expect);
}

// ---------- optional email (Resend) ----------
export async function sendEmail({ to, subject, text, replyTo }) {
  const key = process.env.RESEND_API_KEY, from = process.env.NOTIFY_FROM;
  if (!key || !from || !to) return { skipped: true };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    console.error('email failed', e);
    return { ok: false };
  }
}

export function fmtTime(t) {
  const m = toMin(t); const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export function fmtDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
