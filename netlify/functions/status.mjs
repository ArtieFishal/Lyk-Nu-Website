// Public repair status lookup: POST /api/status { workOrder, last4 }.
import { json } from '../lib/core.mjs';
import { lookupRepair, clientIp } from '../lib/repairs.mjs';

export default async (req, context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Enter your work order number and the last 4 digits of your phone number.' }, 400); }
  try {
    const ip = clientIp(req, context);
    const r = await lookupRepair({ workOrder: body?.workOrder, last4: body?.last4, ip });
    const extra = {};
    if (r.retryAfter) extra['Retry-After'] = String(r.retryAfter);
    return json(r.body, r.status, extra);
  } catch (e) {
    console.error('status lookup failed', e);
    return json({ error: 'Something went wrong. Please try again, or call us.' }, 500);
  }
};
export const config = { path: '/api/status' };
