import crypto from 'node:crypto';
import {
  json, isDate, upcomingHolidays, isTime, toMin, shopNow, addDays, store, uploadStore, getSettings, getBlocks, getDay,
  casUpdate, sanitizeSettings, DEFAULT_SETTINGS, checkPassword, makeToken, verifyToken, TZ,
} from '../lib/core.mjs';

const body = async (req) => { try { return await req.json(); } catch { return {}; } };

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  const m = req.method;

  if (!process.env.ADMIN_PASSWORD) {
    return json({ error: 'Admin is not set up yet: add an ADMIN_PASSWORD environment variable in Netlify and redeploy.' }, 503);
  }

  if (route === 'login' && m === 'POST') {
    const { password } = await body(req);
    if (!checkPassword(password)) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return json({ error: 'Wrong password.' }, 401);
    }
    return json({ token: makeToken(12), expiresInHours: 12 });
  }

  if (!verifyToken(req)) return json({ error: 'Please log in.' }, 401);

  // ----- settings -----
  if (route === 'settings' && m === 'GET') { const today = shopNow().date; return json({ settings: await getSettings(), timezone: TZ, today, holidays: upcomingHolidays(today, 8) }); }
  if (route === 'settings' && m === 'PUT') {
    const input = await body(req);
    const s = sanitizeSettings(input, await getSettings());
    await store().setJSON('settings', s);
    return json({ settings: s });
  }
  if (route === 'settings/reset' && m === 'POST') {
    await store().setJSON('settings', DEFAULT_SETTINGS);
    return json({ settings: DEFAULT_SETTINGS });
  }

  // ----- blocked time -----
  if (route === 'blocks' && m === 'GET') {
    const { blocks } = await getBlocks();
    const today = shopNow().date;
    return json({ blocks: blocks.filter((b) => (b.endDate || b.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)) });
  }
  if (route === 'blocks' && m === 'POST') {
    const b = await body(req);
    const startDate = b.startDate, endDate = b.endDate || b.startDate;
    if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) return json({ error: 'Choose a valid start and end date.' }, 400);
    if (Math.round((Date.parse(endDate) - Date.parse(startDate)) / 864e5) > 366) return json({ error: 'Range too long (max 1 year).' }, 400);
    const allDay = !!b.allDay || !b.startTime || !b.endTime;
    if (!allDay && (!isTime(b.startTime) || !isTime(b.endTime) || toMin(b.endTime) <= toMin(b.startTime))) {
      return json({ error: 'End time must be after start time.' }, 400);
    }
    const block = {
      id: crypto.randomBytes(5).toString('hex'), startDate, endDate, allDay,
      startTime: allDay ? '' : b.startTime, endTime: allDay ? '' : b.endTime,
      reason: String(b.reason || '').slice(0, 120), createdAt: new Date().toISOString(),
    };
    await casUpdate('blocks', (d) => (Array.isArray(d) ? d : []), (list) => {
      const today = shopNow().date;
      return [...list.filter((x) => (x.endDate || x.startDate) >= addDays(today, -30)), block];
    });
    return json({ block });
  }
  if (route.startsWith('blocks/') && m === 'DELETE') {
    const id = route.slice(7);
    await casUpdate('blocks', (d) => (Array.isArray(d) ? d : []), (list) => list.filter((x) => x.id !== id));
    return json({ ok: true });
  }

  // ----- appointments -----
  if (route === 'appointments' && m === 'GET') {
    const today = shopNow().date;
    const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from') : today;
    const to = isDate(url.searchParams.get('to')) ? url.searchParams.get('to') : addDays(today, 400);
    const includeCanceled = url.searchParams.get('canceled') === '1';
    const { blobs } = await store().list({ prefix: 'days/' });
    const dates = blobs.map((b) => b.key.slice(5)).filter((d) => d >= from && d <= to).sort();
    const days = await Promise.all(dates.map(async (d) => (await getDay(d)).appts.map((a) => ({ ...a, date: d }))));
    const list = days.flat().filter((a) => includeCanceled || a.status !== 'canceled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return json({ appointments: list, today });
  }
  const cancel = route.match(/^appointments\/(\d{4}-\d{2}-\d{2})\/([A-F0-9]+)\/cancel$/);
  if (cancel && m === 'POST') {
    const [, date, id] = cancel;
    let found = false;
    await casUpdate(`days/${date}`, (d) => (Array.isArray(d?.appts) ? d.appts : []), (appts) => ({
      appts: appts.map((a) => (a.id === id ? ((found = true), { ...a, status: 'canceled', canceledAt: new Date().toISOString() }) : a)),
    }));
    return found ? json({ ok: true }) : json({ error: 'Appointment not found.' }, 404);
  }
  if (route === 'photo' && m === 'GET') {
    const key = url.searchParams.get('key') || '';
    if (!/^\d{4}-\d{2}-\d{2}\/[A-F0-9]+\/\d+$/.test(key)) return json({ error: 'Bad key' }, 400);
    const r = await uploadStore().getWithMetadata(key, { type: 'arrayBuffer' });
    if (!r) return json({ error: 'Not found' }, 404);
    return new Response(r.data, { headers: { 'content-type': r.metadata?.type || 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
  }

  return json({ error: 'Not found' }, 404);
};

export const config = { path: ['/api/admin', '/api/admin/*'] };
