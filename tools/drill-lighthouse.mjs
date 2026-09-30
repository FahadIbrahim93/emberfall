#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-lighthouse.mjs — the page's deck ADOPTION ladder, proven live.

   v4.26.1 ships deck.json with the page: the live Pages game adopts the
   world deck with zero configuration. The ladder (js/net.js probe()):
     1. a stored choice (emberfall2.deck) — the pilot decided;
     2. this origin's OWN deck (same-origin /api/health, 400ms window) —
        a self-hosted/LAN pilot is never hijacked off their local deck;
     3. the ADOPTED deck (deck.json) — the zero-config Pages story;
     4. nothing — honest local mode, play never blocked.

   One scratch deck + one genuinely DECKLESS static origin (a tiny file
   server with no /api/* at all — the exact geometry of GitHub Pages),
   and a real browser flying every rung plus the guard rails:
   file:// never adopts, ?deck= still wins once, and a foreign origin
   the deck has not allowlisted cannot mint sessions (ADR 0002).

     node tools/drill-lighthouse.mjs
   Exit 0 = all green · exit 1 = any gap · the live-ledger fence applies.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { probeHealth, assertPortFree, assertNotLive } from './live-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 8161;                       /* the deck-under-test (serves the repo root) */
const XO_PORT = 8165;                    /* the foreign STATIC origin (deckless geometry) */
const BASE = 'http://127.0.0.1:' + PORT;
const XO = 'http://127.0.0.1:' + XO_PORT;
let pass = 0, fail = 0, child = null, xoServer = null, corsChild = null;
const say = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad = m => { fail++; say('  FAIL-', m); };

function bootDeck(port, dataDir, cors) {
  /* cors=true → the XO origin (a Pages stand-in) is allowlisted, the
     geometry under test; the stranger leg boots its OWN no-CORS deck */
  const env = { ...process.env, EF_DATA_DIR: dataDir };
  if (cors) env.EF_CORS_ORIGINS = XO;
  return spawn(process.execPath, ['server.js', '--port', String(port)], {
    cwd: ROOT, env, stdio: 'ignore'
  });
}

/* the Pages geometry: static files only, /api/* 404s — a deckless origin.
   deck.json is served as a DRILL VARIANT pointing at the deck-under-test:
   the real fly.dev must never eat drill traffic (the v4.23.1 fence), and
   the sign-up leg needs the adoption to actually reach the scratch deck. */
function bootStatic(port, root, deckBase) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
  const OK = new Set(['/index.html', '/deck.json', '/sw.js', '/manifest.webmanifest',
    '/js/net.js', '/js/art.js', '/js/input.js', '/js/audio.js', '/js/sky.js']);
  const srv = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p.startsWith('/api/')) { res.writeHead(404); res.end(); return; }   /* DECKLESS: no API */
    if (p === '/deck.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deck: deckBase, note: 'drill variant — the real deck.json points at production' }));
      return;
    }
    const f = OK.has(p) ? path.join(root, p) : null;
    if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  srv.listen(port);
  return srv;
}

async function waitHealthy(base) {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) { const j = await r.json(); if (j.ok) return j; } } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

/* boot ritual: goto 'load' (input listeners bound), one early Space (the
   house openTitle ritual), notes closed if shown, then wait for the deck
   handshake — no hand-rolled spin gates */
async function openGame(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.keyboard.press('Space').catch(() => { /* not focused yet */ });
  const close = page.locator('#btnNotesClose');
  try { await close.waitFor({ state: 'visible', timeout: 2500 }); await close.click(); } catch { /* already seen */ }
  for (let i = 0; i < 40; i++) {
    /* bare NET resolves in the page's classic-script scope; window.NET does not exist (top-level const) */
    if (await page.evaluate(() => typeof NET !== 'undefined' && NET.probed).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/* one snapshot of the client's ladder state from the page's own origin.
   Bare NET (top-level const is scoped to the classic scripts, never a
   window property — the same lesson the v4.25 selftest learned). */
async function snap(p) {
  try {
    return await p.evaluate(() => {
      if (typeof NET === 'undefined') return { opaque: 'NET not loaded' };
      return {
        on: !!NET.on,
        deck: NET.deck || '(auto)',
        user: (NET.user && NET.user.name) || null,
        token: localStorage.getItem('emberfall2.token') || '',
        adopted: NET.DECK_ADOPTED || '',
        gsic: NET.googleClientId || '(unarmed)'
      };
    });
  } catch (e) { return { opaque: String(e && e.message || e).slice(0, 100) }; }
}

/* entry: a hard watchdog (this drill drives real browsers; it must never
   hang a battery), then the ladder legs */
(async () => {
  const arm = setTimeout(() => { console.error('drill-lighthouse: watchdog — 4 minutes elapsed, aborting'); console.trace(); process.exit(1); }, 240000);
  try { await main(arm); } finally { clearTimeout(arm); }
})();

async function main(arm) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-lighthouse-'));
  say('── booting the deck-under-test on :' + PORT + ' and the deckless origin on :' + XO_PORT);
  await assertPortFree(await probeHealth(BASE), BASE, 'drill-lighthouse', 'LIGHTHOUSE_PORT');
  child = bootDeck(PORT, dataDir, true);
  const h = await waitHealthy(BASE);
  if (!h) { say('  FAIL- deck never became healthy'); process.exitCode = 1; return; }
  assertNotLive(h, BASE, 'drill-lighthouse');
  say(`── deck up (pilot census: ${h.pilots})`);

  xoServer = bootStatic(XO_PORT, ROOT, BASE);   /* drill deck.json → the scratch deck, not the real one */
  {
    const r = await fetch(XO + '/api/health').then(x => x.status).catch(e => e.message.slice(0, 20));
    String(r) === '404' ? say('── foreign origin is deckless (Pages geometry confirmed)') : bad('the static origin answered /api/health: ' + r);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  /* ── geometry A: playing FROM the deck's own origin (self-hosted story) ── */
  say('── ladder A: on the deck origin, the local deck always wins');
  if (!await openGame(page, BASE + '/index.html')) bad('local page never finished the deck handshake');
  let s = await snap(page);
  s.on === true ? good('auto on the deck origin → THIS origin\'s deck answers') : bad('A local leg on: ' + JSON.stringify(s));

  /* A1: explicit choice beats everything — point at a dead deck, honored */
  await page.evaluate(() => localStorage.setItem('emberfall2.deck', 'http://127.0.0.1:9191'));
  if (!await openGame(page, BASE + '/index.html')) bad('re-boot failed (choice leg)');
  s = await snap(page);
  s.deck === 'http://127.0.0.1:9191' ? good('a stored choice is honored even on the deck origin') : bad('A choice leg deck: ' + JSON.stringify(s));
  s.on === false ? good('a dead chosen deck degrades to local mode (play not blocked)') : bad('A dead choice on: ' + JSON.stringify(s));

  /* A2: clear the choice (auto) → the LOCAL deck wins the ladder — a
     self-hosted pilot is never hijacked off their own accounts */
  await page.evaluate(() => localStorage.removeItem('emberfall2.deck'));
  if (!await openGame(page, BASE + '/index.html')) bad('re-boot failed (local leg)');
  s = await snap(page);
  s.on === true ? good('auto again on the deck origin → the local deck answers') : bad('A auto leg on: ' + JSON.stringify(s));
  s.deck === '(auto)' ? good('the local deck is reached with no address (no hijack to the adopted deck)') : bad('A auto leg deck: ' + JSON.stringify(s));
  await page.close();

  /* ── geometry B: the deckless static origin (the Pages story) ── */
  say('── ladder B: on a deckless origin, the adopted deck is joined');
  const page2 = await browser.newPage();
  if (!await openGame(page2, XO + '/index.html')) bad('remote page never finished the deck handshake');
  s = await snap(page2);
  s.adopted === BASE ? good('the drill deck.json rides the deckless page (adoption record loaded)') : bad('B adopted: ' + JSON.stringify(s));
  s.on === true ? good('deckless origin + no choice → the ADOPTED deck answers') : bad('B adopt leg on: ' + JSON.stringify(s));
  s.deck === BASE ? good('the adopted address is exactly the drill deck.json\'s') : bad('B adopt leg deck: ' + JSON.stringify(s));
  s.gsic === '(unarmed)' ? good('an unconfigured adopted deck arms no Google button (501-honest)') : bad('B google: ' + JSON.stringify(s));

  /* B2: zero-config sign-up from the foreign origin — the whole point.
     The wire is the witness (the raw fetch cannot repaint the panel):
     register 200 + the exposed bearer + that bearer answering /api/me. */
  const name = 'LhJoin' + String(Date.now()).slice(-6);
  const reg = await page2.evaluate(async (n) => {
    try {
      const r = await fetch(NET.deck + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' },
        body: JSON.stringify({ name: n, password: 'lighthouse-pass' })
      });
      const j = await r.json().catch(() => null);
      const tok = r.headers.get('x-emberfall-token') || '';
      let meName = null;
      if (tok && r.status === 200) {
        const me = await fetch(NET.deck + '/api/me', { headers: { Authorization: 'Bearer ' + tok, 'X-Emberfall': 'command-deck' } });
        const mj = await me.json().catch(() => null);
        meName = (mj && mj.user && mj.user.name) || null;
      }
      return { ok: r.status === 200 && !!(j && j.ok), status: r.status, tokLen: tok.length, meName };
    } catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 80) }; }
  }, name);
  reg.ok ? good(`zero-config sign-up from the deckless origin works (${name})`) : bad('B register: ' + JSON.stringify(reg));
  reg.tokLen > 20 ? good('the bearer session arrived cross-origin (ADR 0002)') : bad('B bearer: ' + JSON.stringify(reg));
  reg.meName === name ? good('that bearer answers /api/me as the fresh pilot') : bad('B /api/me: ' + JSON.stringify(reg));

  /* B3: ?deck= still wins once; clearing the choice returns to adoption —
     the ADR 0002 addressing contract is untouched by adoption */
  if (!await openGame(page2, XO + '/index.html?deck=' + BASE)) bad('re-boot failed (?deck leg)');
  s = await snap(page2);
  s.deck === BASE ? good('?deck= overrides adoption for this boot (and persists as a choice)') : bad('B ?deck leg: ' + JSON.stringify(s));
  await page2.evaluate(() => localStorage.removeItem('emberfall2.deck'));
  await page2.evaluate(() => localStorage.removeItem('emberfall2.token'));
  if (!await openGame(page2, XO + '/index.html')) bad('re-boot failed (clear leg)');
  s = await snap(page2);
  s.deck === BASE ? good('clearing the choice returns the page to the adopted deck') : bad('B clear leg: ' + JSON.stringify(s));
  await page2.close();

  /* ── guard rail: file:// play never adopts (a local file has no
     accounts contract) — the game stays honestly local ── */
  say('── guard rail: file:// play never adopts');
  const page3 = await browser.newPage();
  const fileUrl = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';
  try {
    await Promise.race([
      (async () => {
        await page3.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page3.waitForTimeout(1500);
        s = await snap(page3);
      })(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('file:// navigation did not settle')), 18000))
    ]);
    s.adopted === '' ? good('file:// boot: the adoption record stays empty') : bad('file:// adoption: ' + JSON.stringify(s));
    s.on === false && s.deck === '(auto)' ? good('file:// boot: honest local mode, no deck dialed') : bad('file:// mode: ' + JSON.stringify(s));
  } catch (e) {
    say('  ..   skipped: this environment cannot fly file:// (' + String(e && e.message || e).slice(0, 60) + ') — the guard lives in DECK_ADOPTED\'s protocol gate');
  }
  await page3.close();

  /* ── guard rail: ADR 0002 unchanged — a foreign origin the deck has
     NOT allowlisted cannot mint sessions (opaque CORS failure, no token) */
  say('── guard rail: the adopted deck still refuses non-allowlisted origins');
  const corsData = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-lighthouse-cors-'));
  corsChild = bootDeck(PORT + 1, corsData, false);   /* no allowlist: same-origin only */
  const corsBase = 'http://127.0.0.1:' + (PORT + 1);
  const corsHealth = await waitHealthy(corsBase);
  if (!corsHealth) bad('no-CORS deck never booted');
  else assertNotLive(corsHealth, corsBase, 'drill-lighthouse-cors');
  const page4 = await browser.newPage();
  if (!await openGame(page4, XO + '/index.html')) bad('stranger page never finished the boot ritual');
  await page4.evaluate(u => localStorage.setItem('emberfall2.deck', u), corsBase);
  if (!await openGame(page4, XO + '/index.html')) bad('stranger page re-boot failed');
  const reg2 = await page4.evaluate(async () => {
    try {
      const r = await fetch(NET.deck + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' },
        body: JSON.stringify({ name: 'LhNope' + String(Date.now()).slice(-6), password: 'lighthouse-pass' })
      });
      const j = await r.json().catch(() => null);
      return { ok: r.status === 200 && !!(j && j.ok), status: r.status };
    } catch (e) { return { ok: false, opaque: String(e && e.message || e).slice(0, 60) }; }
  });
  reg2.ok === false ? good('register from a non-allowlisted origin is refused (' + (reg2.opaque ? 'opaque CORS failure' : 'status ' + reg2.status) + ')') : bad('CORS guard: ' + JSON.stringify(reg2));
  s = await snap(page4);
  s.token === '' ? good('no bearer token was minted for the stranger origin') : bad('stranger bearer: ' + JSON.stringify(s));
  await page4.close();

  await browser.close();
  if (corsChild) { corsChild.kill('SIGKILL'); corsChild = null; }
  if (child) { child.kill('SIGKILL'); child = null; }
  if (xoServer) { xoServer.close(); xoServer = null; }

  if (fail === 0) say(`DRILL-LIGHTHOUSE: ALL GREEN (${pass} checks)`);
  else say(`DRILL-LIGHTHOUSE: ${fail} FAILURES ABOVE (${pass} passed)`);
  process.exitCode = fail === 0 ? 0 : 1;   /* no forced exit: libuv drains its handles */
  arm.unref?.();
}
