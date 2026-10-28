// Customer repair status tracker: data model, validation, public view, lookup throttle, customer email.
// Storage: Netlify Blobs (store "lyknu-booking"), one JSON blob per repair at repairs/<workOrder>.
import crypto from 'node:crypto';
import siteConfig from '../../business.config.json' with { type: 'json' };
import { store, casUpdate, parseVehicle, sendEmail, isDate, TZ, BUSINESS_NAME } from './core.mjs';

export const STAGES = [
  { id: 'estimate', label: 'Estimate' },
  { id: 'insurance', label: 'Waiting on insurance' },
  { id: 'parts', label: 'Parts ordered' },
  { id: 'disassembly', label: 'Disassembly' },
  { id: 'body', label: 'Body repair' },
  { id: 'paint', label: 'Paint' },
  { id: 'reassembly', label: 'Reassembly' },
  { id: 'detail', label: 'Detail & QC' },
  { id: 'ready', label: 'Ready for pickup' },
];
const STAGE_IDS = STAGES.map((s) => s.id);
const PICKED_UP = 'picked-up';
export const stageLabel = (id) => (id === PICKED_UP ? 'Picked up' : STAGES.find((s) => s.id === id)?.label || id);
export const SHOP_PHONE = siteConfig.phone;
export const SHOP_PHONE_E164 = siteConfig.phoneE164;

const err = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const rkey = (wo) => `repairs/${wo}`;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const normWO = (v) => { const s = String(v ?? '').trim(); return /^\d{3,10}$/.test(s) ? s : ''; };
export const digitsOf = (v) => String(v ?? '').replace(/\D/g, '');
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const lastFour = (phone) => digitsOf(phone).slice(-4);

// "Jane Doe" -> "Jane D."; one word stays as is.
export function publicName(name) {
  const p = clean(name, 80).split(' ').filter(Boolean);
  if (p.length < 2) return p[0] || '';
  return `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`;
}

// ---------- validation ----------
// Partial-friendly: only fields present in `input` are validated/returned (create requires all the essentials).
export function validateRepair(input = {}, { creating = false, now = new Date() } = {}) {
  const errors = {}, v = {};
  if (creating) {
    v.workOrder = normWO(input.workOrder);
    if (!v.workOrder) errors.workOrder = 'Enter the work order number (numbers only).';
  }
  if (creating || 'name' in input) {
    v.name = clean(input.name, 80);
    if (!v.name) errors.name = 'Enter the customer name.';
  }
  if (creating || 'phone' in input) {
    const d = digitsOf(input.phone);
    if (d.length < 10 || d.length > 15) errors.phone = 'Enter the full phone number (10 digits).';
    else v.phone = clean(input.phone, 30);
  }
  if ('email' in input) {
    v.email = clean(input.email, 120);
    if (v.email && !EMAIL_RE.test(v.email)) errors.email = 'That email address does not look right.';
  }
  if (creating || ['vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicle'].some((k) => k in input)) {
    const pv = parseVehicle(input, now);
    Object.assign(errors, pv.errors);
    v.vehicleYear = pv.year; v.vehicleMake = pv.make; v.vehicleModel = pv.model;
  }
  if ('stage' in input || creating) {
    const s = input.stage === undefined || input.stage === '' ? (creating ? 'estimate' : undefined) : input.stage;
    if (s === undefined) { /* leave as is */ } else if (!STAGE_IDS.includes(s)) errors.stage = 'Pick one of the listed stages.';
    else v.stage = s;
  }
  if ('note' in input) v.note = String(input.note ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, ' ').trim().slice(0, 600);
  if ('estimatedCompletion' in input) {
    const d = String(input.estimatedCompletion ?? '').trim();
    if (d && !isDate(d)) errors.estimatedCompletion = 'Use a real date.';
    else v.estimatedCompletion = d;
  }
  if ('waitingOnParts' in input) v.waitingOnParts = input.waitingOnParts === true || input.waitingOnParts === 'true' || input.waitingOnParts === 'on';
  return { value: v, errors };
}

const vehicleLabel = (r) => `${r.vehicleYear} ${r.vehicleMake} ${r.vehicleModel}`.trim();

// ---------- views ----------
// The ONLY shape the public lookup returns. Never add phone, email, last name or internal ids.
export function toPublic(r) {
  const idx = Math.max(0, STAGE_IDS.indexOf(r.stage));
  return {
    workOrder: r.workOrder,
    customer: publicName(r.name),
    vehicle: vehicleLabel(r),
    stages: STAGES,
    stage: r.stage,
    stageLabel: stageLabel(r.stage),
    stageIndex: idx,
    stageCount: STAGES.length,
    pickedUp: !!r.archived,
    note: r.note || '',
    estimatedCompletion: r.estimatedCompletion || '',
    waitingOnParts: !!r.waitingOnParts,
    updatedAt: r.updatedAt,
    history: (r.history || []).map((h) => ({ stage: h.stage, label: stageLabel(h.stage), at: h.at })),
    timezone: TZ,
    shopPhone: SHOP_PHONE,
    shopPhoneE164: SHOP_PHONE_E164,
  };
}
// Staff view: everything stored, plus ready-made labels.
export const toAdmin = (r) => ({ ...r, vehicle: vehicleLabel(r), stageLabel: stageLabel(r.stage), nextStage: STAGE_IDS[STAGE_IDS.indexOf(r.stage) + 1] || null });

// ---------- CRUD ----------
export async function getRepair(wo) {
  return store().get(rkey(wo), { type: 'json' });
}
export async function listRepairs({ q = '', includeArchived = true } = {}) {
  const s = store();
  const { blobs } = await s.list({ prefix: 'repairs/' });
  const all = (await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
  const needle = clean(q, 60).toLowerCase().replace(/^#/, '');
  const hit = (r) => !needle || r.workOrder.includes(needle) || r.name.toLowerCase().includes(needle) || vehicleLabel(r).toLowerCase().includes(needle);
  return all
    .filter((r) => (includeArchived || !r.archived) && hit(r))
    .sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function createRepair(input, now = new Date()) {
  const { value, errors } = validateRepair(input, { creating: true, now });
  if (Object.keys(errors).length) throw err('Please fix the highlighted fields.', 400, { fields: errors });
  const at = now.toISOString();
  const rec = {
    workOrder: value.workOrder, name: value.name, phone: value.phone, email: value.email || '',
    vehicleYear: value.vehicleYear, vehicleMake: value.vehicleMake, vehicleModel: value.vehicleModel,
    stage: value.stage, note: value.note || '', estimatedCompletion: value.estimatedCompletion || '', waitingOnParts: !!value.waitingOnParts,
    archived: false, createdAt: at, updatedAt: at, history: [{ stage: value.stage, at }],
  };
  await casUpdate(rkey(rec.workOrder), (cur) => {
    if (cur) throw err(`Work order ${rec.workOrder} already exists.`, 409, { fields: { workOrder: 'That work order number is already in the list.' } });
    return undefined;
  }, () => rec);
  return rec;
}

// Shared edit helper: fn(cur, info) returns the next record and may set flags on `info`.
async function editRepair(wo, fn) {
  const info = {};
  const next = await casUpdate(rkey(wo), (cur) => {
    if (!cur) throw err('That work order was not found.', 404);
    return cur;
  }, (cur) => { Object.keys(info).forEach((k) => delete info[k]); return fn(cur, info); });
  return { repair: next, ...info };
}
const pubSig = (r) => JSON.stringify([r.stage, r.note, r.estimatedCompletion, !!r.waitingOnParts, vehicleLabel(r), publicName(r.name)]);

export async function updateRepair(wo, input, now = new Date()) {
  const { value, errors } = validateRepair(input, { now });
  if (Object.keys(errors).length) throw err('Please fix the highlighted fields.', 400, { fields: errors });
  const at = now.toISOString();
  return editRepair(wo, (cur, info) => {
    if (cur.archived && value.stage !== undefined && value.stage !== cur.stage) throw err('This repair is marked picked up. Restore it first to change the stage.', 400);
    const next = { ...cur, ...value, workOrder: cur.workOrder, history: [...(cur.history || [])] };
    info.stageChanged = value.stage !== undefined && value.stage !== cur.stage;
    if (info.stageChanged) next.history.push({ stage: value.stage, at });
    if (pubSig(cur) !== pubSig(next)) next.updatedAt = at;
    return next;
  });
}
export async function advanceRepair(wo, now = new Date()) {
  const at = now.toISOString();
  return editRepair(wo, (cur, info) => {
    const i = STAGE_IDS.indexOf(cur.stage);
    if (cur.archived) throw err('This repair is already marked picked up.', 400);
    if (i < 0 || i >= STAGE_IDS.length - 1) throw err('Already at Ready for pickup.', 400);
    info.stageChanged = true;
    return { ...cur, stage: STAGE_IDS[i + 1], updatedAt: at, history: [...(cur.history || []), { stage: STAGE_IDS[i + 1], at }] };
  });
}
export async function pickupRepair(wo, now = new Date()) {
  const at = now.toISOString();
  return editRepair(wo, (cur) => {
    if (cur.archived) return cur;
    if (cur.stage !== 'ready') throw err('Move it to "Ready for pickup" first, then mark it picked up.', 400);
    return { ...cur, archived: true, pickedUpAt: at, updatedAt: at, history: [...(cur.history || []), { stage: PICKED_UP, at }] };
  });
}
export async function restoreRepair(wo, now = new Date()) {
  return editRepair(wo, (cur) => (cur.archived ? { ...cur, archived: false, pickedUpAt: undefined, updatedAt: now.toISOString() } : cur));
}
export async function deleteRepair(wo) {
  if (!(await getRepair(wo))) throw err('That work order was not found.', 404);
  await store().delete(rkey(wo));
}

// ---------- customer email (optional; needs RESEND_API_KEY + NOTIFY_FROM) ----------
const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function buildRepairEmail(r, origin = '') {
  const first = clean(r.name, 80).split(' ')[0] || 'there';
  const step = STAGE_IDS.indexOf(r.stage) + 1;
  const link = `${origin.replace(/\/$/, '')}/status/?wo=${encodeURIComponent(r.workOrder)}`;
  const lines = [
    `Hi ${first},`, '',
    `Here is an update on your ${vehicleLabel(r)} at ${BUSINESS_NAME}.`, '',
    `Current stage: ${stageLabel(r.stage)} (step ${step} of ${STAGES.length})`,
  ];
  if (r.waitingOnParts) lines.push('We are waiting on parts for your vehicle.');
  if (r.note) lines.push('', `Note from the shop: ${r.note}`);
  if (r.estimatedCompletion) lines.push('', `Estimated completion: ${longDate(r.estimatedCompletion)} (an estimate, and it can change)`);
  lines.push('', `Check progress any time: ${link}`);
  lines.push(`You will need your work order number (${r.workOrder}) and the last 4 digits of your phone number.`);
  lines.push('', `Questions? Call us at ${SHOP_PHONE}.`, '', BUSINESS_NAME);
  return { subject: `${stageLabel(r.stage)}: update on your ${vehicleLabel(r)} (work order ${r.workOrder})`, text: lines.join('\n') };
}
// Returns 'sent' | 'failed' | 'skipped' (Resend not configured) | 'none' (no email on file). Never throws.
export async function emailCustomer(r, origin) {
  if (!r.email) return 'none';
  try {
    const res = await sendEmail({ to: r.email, ...buildRepairEmail(r, origin), replyTo: process.env.NOTIFY_TO || siteConfig.notifyEmail || undefined });
    return res.skipped ? 'skipped' : res.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

// ---------- public lookup + throttling ----------
export const THROTTLE = {
  windowMs: 15 * 60 * 1000,
  ipLimit: () => Number(process.env.STATUS_IP_LIMIT) || 20, // failed lookups per visitor address per 15 min
  woLimit: () => Number(process.env.STATUS_WO_LIMIT) || 8, // failed lookups per work order per 15 min
};
const hash = (s) => crypto.createHash('sha256').update('lyknu-status:' + s).digest('hex').slice(0, 32);
export const clientIp = (req, context) =>
  req.headers.get('x-nf-client-connection-ip') || context?.ip || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

async function failCount(key, now) {
  try {
    const d = await store().get(key, { type: 'json' });
    return d && d.start + THROTTLE.windowMs > now ? d.count : 0;
  } catch { return 0; }
}
async function addFail(key, now) {
  const bump = (d) => (d && d.start + THROTTLE.windowMs > now ? { start: d.start, count: d.count + 1 } : { start: now, count: 1 });
  try { await casUpdate(key, (d) => d, bump, { tries: 6 }); } catch (e) { console.error('throttle write failed', e); }
}
const sha = (s) => crypto.createHash('sha256').update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

const MSG_FORMAT = 'Enter your work order number and the last 4 digits of the phone number you gave us.';
const MSG_NOT_FOUND = `We could not find a repair with that work order number and phone number. Please check them and try again, or call us at ${SHOP_PHONE}.`;
const MSG_LOCKED = `Too many tries. Please wait about 15 minutes and try again, or call us at ${SHOP_PHONE}.`;

// Returns { status, body }. An unknown work order and a wrong last 4 look identical. Only FAILURES count toward the limits.
export async function lookupRepair({ workOrder, last4, ip }, now = Date.now()) {
  const wo = normWO(workOrder), l4 = String(last4 ?? '').trim();
  if (!wo || !/^\d{4}$/.test(l4)) return { status: 400, body: { error: MSG_FORMAT } };
  const ipKey = `throttle/ip/${hash(ip)}`, woKey = `throttle/wo/${wo}`;
  const [ipN, woN] = await Promise.all([failCount(ipKey, now), failCount(woKey, now)]);
  if (ipN >= THROTTLE.ipLimit() || woN >= THROTTLE.woLimit()) {
    return { status: 429, retryAfter: Math.ceil(THROTTLE.windowMs / 1000), body: { error: MSG_LOCKED } };
  }
  const rec = await getRepair(wo).catch(() => null);
  const want = rec ? lastFour(rec.phone) : '';
  const same = safeEqual(l4, want.length === 4 ? want : 'none');
  if (!rec || !same) {
    await Promise.all([addFail(ipKey, now), addFail(woKey, now)]);
    await new Promise((r) => setTimeout(r, 350)); // slow guessing down a little
    return { status: 404, body: { error: MSG_NOT_FOUND } };
  }
  return { status: 200, body: { repair: toPublic(rec) } };
}
