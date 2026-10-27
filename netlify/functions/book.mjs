import crypto from 'node:crypto';
import {
  json, isDate, isTime, shopNow, getSettings, getBlocks, casUpdate, computeSlots, uploadStore,
  sendEmail, fmtDate, fmtTime, BUSINESS_NAME, DEFAULT_NOTIFY_TO, buildAttachments, signedPhotoPath, parseVehicle,
} from '../lib/core.mjs';

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Invalid form submission.' }, 400); }

  // Honeypot: real people never fill this hidden field.
  if (clean(form.get('company'))) return json({ ok: true, id: 'ok' });

  const data = {
    date: clean(form.get('date'), 10),
    time: clean(form.get('time'), 5),
    name: clean(form.get('name'), 100),
    phone: clean(form.get('phone'), 30),
    email: clean(form.get('email'), 120),
    insurance: clean(form.get('insurance'), 80),
    description: String(form.get('description') ?? '').replace(/\u0000/g, '').trim().slice(0, 2000),
  };
  const v = parseVehicle({ vehicleYear: form.get('vehicleYear'), vehicleMake: form.get('vehicleMake'), vehicleModel: form.get('vehicleModel'), vehicle: form.get('vehicle') });
  data.vehicleYear = v.year; data.vehicleMake = v.make; data.vehicleModel = v.model;
  const errors = { ...v.errors };
  if (!isDate(data.date)) errors.date = 'Pick a date.';
  if (!isTime(data.time)) errors.time = 'Pick a time.';
  if (data.name.length < 2) errors.name = 'Enter your name.';
  if (!data.phone) errors.phone = 'Phone number is required so we can reach you about your appointment.';
  else if (data.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a phone number with area code (at least 10 digits).';
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Enter a valid email or leave it blank.';
  if (data.description.length < 5) errors.description = 'Briefly describe the damage or problem.';

  const photos = form.getAll('photos').filter((f) => f && typeof f === 'object' && f.size > 0);
  if (photos.length > MAX_PHOTOS) errors.photos = `Up to ${MAX_PHOTOS} photos, please.`;
  for (const f of photos) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type)) errors.photos = 'Photos must be JPG, PNG, WEBP or HEIC images.';
    if (f.size > MAX_PHOTO_BYTES) errors.photos = 'Each photo must be under 1.5 MB.';
  }
  if (Object.keys(errors).length) return json({ error: 'Please fix the highlighted fields.', fields: errors }, 400);

  const id = crypto.randomBytes(6).toString('hex').toUpperCase();
  const photoKeys = [];
  const photoData = [];
  const up = uploadStore();
  for (const [i, f] of photos.entries()) {
    const key = `${data.date}/${id}/${i + 1}`;
    const buf = await f.arrayBuffer();
    await up.set(key, buf, { metadata: { type: f.type, name: clean(f.name, 80) } });
    photoKeys.push(key); photoData.push({ type: f.type, data: buf });
  }

  const now = shopNow();
  try {
    // Re-validate against the latest settings, blocks and bookings, atomically per day.
    await casUpdate(
      `days/${data.date}`,
      (d) => (Array.isArray(d?.appts) ? d.appts : []),
      async (appts) => {
        const [settings, { blocks }] = await Promise.all([getSettings(), getBlocks()]);
        const r = computeSlots(data.date, settings, blocks, appts, now);
        const slot = r.slots.find((s) => s.time === data.time);
        if (!slot || !slot.available) {
          const e = new Error('Sorry, that time was just taken or is no longer available. Please pick another time.');
          e.status = 409; throw e;
        }
        return { appts: [...appts, { id, ...data, duration: settings.slotMinutes, photos: photoKeys, status: 'booked', createdAt: new Date().toISOString() }] };
      },
      { verify: (d) => Array.isArray(d?.appts) && d.appts.some((a) => a.id === id) },
    );
  } catch (e) {
    await Promise.all(photoKeys.map((k) => up.delete(k).catch(() => {})));
    return json({ error: e.message || 'Could not book.' }, e.status || 500);
  }

  const when = `${fmtDate(data.date)} at ${fmtTime(data.time)}`;
  const vehicle = v.label;
  const notify = process.env.NOTIFY_TO || DEFAULT_NOTIFY_TO;
  if (notify) {
    const origin = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : new URL(req.url).origin;
    const links = photoKeys.map((k, n) => { const p = signedPhotoPath(k); return p ? `  ${n + 1}. ${origin}${p}` : null; }).filter(Boolean);
    const photoLine = photoKeys.length
      ? `Photos: ${photoKeys.length} (attached to this email${links.length ? '; backup links below, good for 30 days' : ''})${links.length ? '\n' + links.join('\n') : ''}`
      : 'Photos: none';
    await sendEmail({
      to: notify.split(',').map((s) => s.trim()),
      replyTo: data.email || undefined,
      subject: `New estimate: ${data.name} — ${when}`,
      attachments: buildAttachments(photoData, `damage-${id}`),
      text: `New estimate appointment (#${id})\n\nWhen: ${when}\nName: ${data.name}\nPhone: ${data.phone}\nEmail: ${data.email || '-'}\nVehicle: ${vehicle}\nInsurance: ${data.insurance || '-'}\n${photoLine}\n\n${data.description}\n\nManage appointments on the /admin page of the website.`,
    });
  }
  if (data.email && process.env.NOTIFY_CUSTOMER === 'true') {
    await sendEmail({
      to: data.email,
      subject: `Your estimate appointment at ${BUSINESS_NAME}`,
      text: `Hi ${data.name},\n\nYou're booked for a free estimate on ${when} for your ${vehicle}.\nConfirmation #: ${id}\n\nNeed to change it? Just give us a call.\n\n${BUSINESS_NAME}`,
    });
  }
  return json({ ok: true, id, date: data.date, time: data.time, when });
};

export const config = { path: '/api/book' };
