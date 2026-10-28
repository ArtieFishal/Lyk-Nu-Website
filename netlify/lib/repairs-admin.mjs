// Staff-only repair endpoints, mounted by netlify/functions/admin.mjs AFTER its login check.
import { json } from './core.mjs';
import { listRepairs, getRepair, createRepair, updateRepair, advanceRepair, pickupRepair, restoreRepair, deleteRepair, emailCustomer, toAdmin, normWO, STAGES } from './repairs.mjs';

const readBody = async (req) => { try { return (await req.json()) || {}; } catch { return {}; } };
const bool = (v) => v === true || v === 'true' || v === 'on' || v === 1;

export async function repairsRoute(req, route, url) {
  const m = req.method;
  const match = route.match(/^repairs(?:\/(\d+))?(?:\/(advance|pickup|restore))?$/);
  if (!match) return json({ error: 'Not found' }, 404);
  const [, rawWo, action] = match;
  const origin = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : url.origin;
  try {
    if (!rawWo) {
      if (m === 'GET') {
        const list = await listRepairs({ q: url.searchParams.get('q') || '', includeArchived: url.searchParams.get('archived') !== '0' });
        return json({ repairs: list.map(toAdmin), stages: STAGES });
      }
      if (m === 'POST') {
        const rec = await createRepair(await readBody(req));
        return json({ repair: toAdmin(rec) }, 201);
      }
      return json({ error: 'Method not allowed' }, 405);
    }
    const wo = normWO(rawWo);
    if (!wo) return json({ error: 'Bad work order number.' }, 400);
    if (!action && m === 'GET') {
      const r = await getRepair(wo);
      return r ? json({ repair: toAdmin(r) }) : json({ error: 'That work order was not found.' }, 404);
    }
    if (!action && m === 'DELETE') { await deleteRepair(wo); return json({ ok: true }); }
    if (!action && (m === 'PUT' || m === 'PATCH')) {
      const { notify, ...fields } = await readBody(req);
      const res = await updateRepair(wo, fields);
      const emailed = res.stageChanged && bool(notify) ? await emailCustomer(res.repair, origin) : 'none';
      return json({ repair: toAdmin(res.repair), emailed });
    }
    if (action === 'advance' && m === 'POST') {
      const b = await readBody(req);
      const res = await advanceRepair(wo);
      const emailed = bool(b.notify) ? await emailCustomer(res.repair, origin) : 'none';
      return json({ repair: toAdmin(res.repair), emailed });
    }
    if (action === 'pickup' && m === 'POST') return json({ repair: toAdmin((await pickupRepair(wo)).repair) });
    if (action === 'restore' && m === 'POST') return json({ repair: toAdmin((await restoreRepair(wo)).repair) });
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    if (e.status) return json({ error: e.message, fields: e.fields }, e.status);
    console.error('repairs route failed', e);
    return json({ error: 'Something went wrong saving that. Please try again.' }, 500);
  }
}
