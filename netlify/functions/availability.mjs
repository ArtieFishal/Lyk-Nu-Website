import { json, isDate, addDays, shopNow, getSettings, getBlocks, store, computeSlots } from '../lib/core.mjs';

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const url = new URL(req.url);
  const now = shopNow();
  const start = isDate(url.searchParams.get('start')) ? url.searchParams.get('start') : now.date;
  const days = Math.min(62, Math.max(1, Number(url.searchParams.get('days')) || 1));
  const [settings, { blocks }] = await Promise.all([getSettings(), getBlocks()]);
  const end = addDays(start, days - 1);

  // Only fetch day documents that exist in the range.
  const { blobs } = await store().list({ prefix: 'days/' });
  const wanted = blobs.map((b) => b.key.slice(5)).filter((d) => d >= start && d <= end);
  const dayDocs = Object.fromEntries(
    await Promise.all(wanted.map(async (d) => [d, (await store().get(`days/${d}`, { type: 'json' }))?.appts || []])),
  );

  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const r = computeSlots(date, settings, blocks, dayDocs[date] || [], now);
    // Public API never reveals who booked; only whether a slot can be booked.
    out.push({ date, open: r.open && r.slots.some((s) => s.available), slots: r.slots.filter((s) => s.available).map((s) => s.time) });
  }
  return json({
    today: now.date,
    slotMinutes: settings.slotMinutes,
    maxDate: addDays(now.date, settings.maxDaysAhead),
    bookingMessage: settings.bookingMessage,
    days: out,
  });
};

export const config = { path: '/api/availability' };
