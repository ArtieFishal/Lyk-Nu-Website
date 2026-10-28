// Local test server that needs no `netlify dev`: serves public/ and runs netlify/functions/*.mjs
// against an in-memory blobs stub.   node tests/local/serve.mjs   (PORT=8888 by default; run `npm run build` first)
import { register } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./loader.mjs', import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = path.join(root, 'public');
const fnDir = path.join(root, 'netlify/functions');
const routes = [];
for (const f of fs.readdirSync(fnDir).filter((n) => n.endsWith('.mjs'))) {
  const mod = await import(pathToFileURL(path.join(fnDir, f)).href);
  for (const p of [].concat(mod.config?.path || [])) routes.push({ p, handler: mod.default });
}
const match = (pathname) => routes.find(({ p }) => (p.endsWith('/*') ? pathname.startsWith(p.slice(0, -1)) : pathname === p));
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', txt: 'text/plain', xml: 'application/xml', json: 'application/json', woff2: 'font/woff2' };

http.createServer(async (req, res) => {
  const origin = `http://${req.headers.host || 'localhost'}`;
  const url = new URL(req.url, origin);
  const hit = match(url.pathname);
  if (hit) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const request = new Request(url, { method: req.method, headers: req.headers, body });
    try {
      const r = await hit.handler(request, { ip: req.socket.remoteAddress });
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { console.error(e); res.writeHead(500); res.end('function error'); }
    return;
  }
  let f = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (!f.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404, { 'content-type': MIME.html }); return res.end(fs.existsSync(path.join(PUBLIC, '404.html')) ? fs.readFileSync(path.join(PUBLIC, '404.html')) : 'Not found'); }
  res.writeHead(200, { 'content-type': MIME[f.split('.').pop()] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(Number(process.env.PORT) || 8888, () => console.log('local test server on :' + (process.env.PORT || 8888)));
