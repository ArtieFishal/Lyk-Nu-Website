// Serves one stored damage photo to anyone holding a valid signed link (from the notification email).
import { json, verifyPhotoLink, uploadStore } from '../lib/core.mjs';

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const q = new URL(req.url).searchParams;
  const key = q.get('key') || '';
  if (!verifyPhotoLink(key, q.get('exp'), q.get('sig'))) return json({ error: 'This link is invalid or has expired.' }, 403);
  const r = await uploadStore().getWithMetadata(key, { type: 'arrayBuffer' });
  if (!r) return json({ error: 'Not found' }, 404);
  const type = /^image\/(jpeg|png|webp|heic|heif)$/.test(r.metadata?.type || '') ? r.metadata.type : 'image/jpeg';
  return new Response(r.data, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff' } });
};

export const config = { path: '/api/photo' };
