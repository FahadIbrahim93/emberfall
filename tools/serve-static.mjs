#!/usr/bin/env node
/* serve-static.mjs — test-only static file server for the browser suite and
   the ?selftest harness. Production is Vercel (static) + Supabase; this just
   mirrors that locally: serves the repo root read-only, 404s everything
   else, and sends the same CSP as vercel.json. No API, no database.
     node tools/serve-static.mjs [--port 8123] */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT) || 8123;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.gif': 'image/gif', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css' };
/* only the public payload: the same shape Vercel serves after .vercelignore */
const ALLOW = /^\/(index\.html|stats\.html|pilot\.html|sw\.js|manifest\.webmanifest|js\/[\w.-]+\.js|js\/vendor\/[\w.-]+|icons\/[\w.-]+\.png|fonts\/[\w.-]+\.woff2|docs\/press-kit\.html|docs\/press\/[\w.-]+|docs\/screenshots\/[\w.-]+)$/;
let headers = {};
try {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  for (const h of (v.headers?.[0]?.headers || [])) headers[h.key] = h.value;
} catch { /* no vercel.json: serve without extra headers */ }

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (!ALLOW.test(p) || p.includes('..')) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(path.join(ROOT, p), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`static: http://127.0.0.1:${PORT}/`));
