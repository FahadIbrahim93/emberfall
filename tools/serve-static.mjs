#!/usr/bin/env node
/* serve-static.mjs — test-only static file server for the browser suite and
   the ?selftest harness. Production is Vercel (static) + Supabase; this just
   mirrors that locally. --release verifies and serves only dist/site's
   manifest assets with the packaged security headers. No API, no database.
     node tools/serve-static.mjs --release [--build] [--port 8123] */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, currentCommit, MANIFEST, verifySite } from './site-payload.mjs';

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT) || 8123;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.gif': 'image/gif', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css' };
/* only the public payload: the same shape Vercel serves after .vercelignore */
const ALLOW = /^\/(index\.html|stats\.html|pilot\.html|sw\.js|manifest\.webmanifest|js\/[\w.-]+\.js|js\/vendor\/[\w.-]+|icons\/[\w.-]+\.png|fonts\/[\w.-]+\.woff2|docs\/press-kit\.html|docs\/press\/[\w.-]+|docs\/screenshots\/[\w.-]+)$/;
export function createStaticServer({ root = SOURCE, release = false, expectedCommit } = {}) {
  root = path.resolve(root);
  const manifest = release ? verifySite(root, expectedCommit) : null;
  const assets = manifest ? new Map(manifest.assets.map(asset => [`/${asset.path}`, asset])) : null;
  if (assets) assets.set(`/${MANIFEST}`, { mime: 'application/json' });
  const headers = {};
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  for (const header of (config.headers?.[0]?.headers || [])) headers[header.key] = header.value;
  if (manifest) headers['X-Emberfall-Commit'] = manifest.commitSha;
  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400); return res.end('invalid URL'); }
    if (p === '/') p = '/index.html';
    const asset = assets?.get(p);
    if ((assets ? !asset : !ALLOW.test(p)) || p.includes('..') || p.includes('\\') || p.includes('\0')) {
      res.writeHead(404); return res.end('not found');
    }
    fs.readFile(path.join(root, p), (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { ...headers, 'Content-Type': asset?.mime || TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const release = process.argv.includes('--release');
    if (process.argv.includes('--build')) buildSite();
    const root = release ? path.resolve(SOURCE, process.env.EMBERFALL_SITE_ROOT || 'dist/site') : SOURCE;
    createStaticServer({ root, release, expectedCommit: release ? currentCommit() : undefined })
      .listen(PORT, '127.0.0.1', () => console.log(`static${release ? ' release' : ''}: http://127.0.0.1:${PORT}/`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
