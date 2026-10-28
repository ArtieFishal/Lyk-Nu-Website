// In-memory stand-in for @netlify/blobs (only the calls this app uses), for tests/local/serve.mjs.
import { createHash } from 'node:crypto';
const stores = new Map();
const etagOf = (buf) => createHash('md5').update(buf).digest('hex');

function makeStore(name) {
  const m = new Map(); // key -> { buf, metadata, etag }
  const toBuf = (v) => (typeof v === 'string' ? Buffer.from(v) : Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v));
  const out = (e, type) => {
    if (!e) return null;
    if (type === 'json') return JSON.parse(e.buf.toString('utf8'));
    if (type === 'arrayBuffer') return e.buf.buffer.slice(e.buf.byteOffset, e.buf.byteOffset + e.buf.byteLength);
    return e.buf.toString('utf8');
  };
  return {
    async get(key, { type = 'text' } = {}) { return out(m.get(key), type); },
    async getWithMetadata(key, { type = 'text' } = {}) { const e = m.get(key); return e ? { data: out(e, type), etag: e.etag, metadata: e.metadata } : null; },
    async set(key, value, { metadata } = {}) { const buf = toBuf(value); const etag = etagOf(buf); m.set(key, { buf, metadata, etag }); return { modified: true, etag }; },
    async setJSON(key, value, opts = {}) {
      const cur = m.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      const buf = Buffer.from(JSON.stringify(value)); const etag = etagOf(buf) + ':' + Math.random().toString(36).slice(2);
      m.set(key, { buf, metadata: opts.metadata, etag }); return { modified: true, etag };
    },
    async delete(key) { m.delete(key); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: m.get(key).etag })) }; },
  };
}
export function getStore(arg) {
  const name = typeof arg === 'string' ? arg : arg.name;
  if (!stores.has(name)) stores.set(name, makeStore(name));
  return stores.get(name);
}
