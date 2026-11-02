const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { E2E_PORT } = require('../playwright.config');

/* Offline guarantee (ADR 0003 migration, 2026-10): the game has become a set
   of single-path runtime scripts (js/hazards.js, js/math.js, js/rng.js,
   …). If a future migration adds a runtime file to index.html but forgets
   the service worker's CORE precache, the game boots fine ONLINE and dies
   OFFLINE — the exact failure this suite exists to prevent. The manifest of
   truth is what the client <script>-loads; CORE must cover all of it, and
   the deck must serve every precached status at 200 text/javascript. */

const ROOT = join(dirname(__filename), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

/* every static runtime the client executes */
const clientScripts = [...html.matchAll(/<script src="(js\/[\w.-]+\.js)"><\/script>/g)].map(m => m[1]);

/* the SW's precache list */
const core = [...sw.matchAll(/'\.\/(js\/[\w.-]+\.js)'/g)].map(m => m[1]);

test('the service worker precache covers every runtime script the client loads', () => {
  expect(clientScripts.length, 'the client actually loads js modules').toBeGreaterThan(0);
  const missing = clientScripts.filter(s => !core.includes(s));
  expect(missing, 'routers missing from sw.js CORE').toEqual([]);
});

test('every precached runtime exists on disk and the deck serves it 200', async ({ request }) => {
  expect(core.length, 'CORE actually lists js modules').toBeGreaterThan(0);
  for (const rel of core) {
    expect(() => readFileSync(join(ROOT, rel)), `${rel} exists on disk`).not.toThrow();
    const res = await request.get(`http://127.0.0.1:${E2E_PORT}/${rel}`);
    expect(res.status(), `${rel} served`).toBe(200);
    expect(res.headers()['content-type'], `${rel} content type`).toContain('text/javascript');
  }
});
