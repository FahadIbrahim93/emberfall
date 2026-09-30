#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-onboarding.mjs — launch-day acceptance, flown against a scratch
   deck with the REAL deck client (js/net.js), not raw fetches.

   The question this drill answers: the moment the world deck is live,
   can a stranger show up and become a ranked pilot? Exactly the loop a
   first player flies:

     act 1  the client probes the deck and signs a pilot UP (cookie session)
     act 2  they fly a HONEST run (the anti-cheat-accepted arc) — the
            submission is accepted, a global rank comes back, and the
            pilot stands on the worldwide board
     act 3  second device: sign in on a fresh session — same pilot row,
            same best, the ledger identity holds
     act 4  a stranger cannot sit on someone's callsign (duplicate name
            refused 409, census unchanged)
     act 5  the global board reads back clean: accepted-only, one row
            per pilot, the onboarding pilot ranked

   Runs against the same scratch-deck discipline as every drill:
   own data dir, own port, live-fence refusal, torn down after.

     ONBOARD_DRILL_PORT=<port> node tools/drill-onboarding.mjs
   Exit 0 = all green · exit 1 = any gap.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeHealth, assertPortFree, assertNotLive } from './live-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.ONBOARD_DRILL_PORT || 8171;
const BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0, child = null;
const say = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad = m => { fail++; say('  FAIL-', m); };

/* load the REAL deck client source and run it in a function scope with
   the game core's symbols injected as stubs: the auth/board paths the
   drill exercises run the client's own code (req bearer contract,
   probe/whoami adoption), not a re-implementation */
function makeClient() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'net.js'), 'utf8');
  const DB = {
    _s: new Map(),
    get(k, d) { return this._s.has(k) ? this._s.get(k) : d; },
    set(k, v) { this._s.set(k, v); },
    del(k) { this._s.delete(k); }
  };
  const META = { daily: {}, feats: {}, owned: ['vesper'], paints: ['yard'], sigils: [''], alloy: 0, runs: 0, totalKills: 0, bestWave: 0, skyLog: [], donated: 0, ship: 'vesper', refits: {}, codex: {}, sky: {} };
  const CFG = {};
  const deps = {
    console, URL, URLSearchParams, location: { search: '', protocol: 'http:' },
    localStorage: {
      _s: new Map(),
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); }
    },
    /* present as the ALLOWED origin (the Pages geometry): the deck then
       issues bearer tokens, which the client's req() captures — the same
       cross-origin auth story production flies (no cookie jar needed) */
    fetch: (u, o) => fetch(new URL(u, BASE), { ...o, headers: { ...(o && o.headers), Origin: 'http://127.0.0.1:8123' } }),
    XMLHttpRequest: class { open() {} send() { throw new Error('no sync xhr in the drill'); } },
    setTimeout, clearTimeout, AbortController,
    DB, META, CFG,
    HULLS: [{ id: 'vesper' }, { id: 'halcyon' }, { id: 'atlas' }, { id: 'wraith' }, { id: 'seraph' }],
    REFITS: [], PAINTS: [],
    note() { }, saveMeta() { }, saveCfg() { }, clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    honorOf: () => 0, todaySeedKey: () => 'drill',
    sanitizeSnapMeta: m => m || {}, vaultOfferWorthy: () => false,
    AU: { pickup() { }, ui() { } }, MUSIC: {}, GAME: { state: 'title' }
  };
  const keys = Object.keys(deps);
  const factory = new Function(...keys, src + '\n;return NET;');
  return factory(...keys.map(k => deps[k]));
}

async function req(method, p, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
}
const tokenOf = sc => { const m = /EF_SESSION=([^;\r]+)/.exec(sc || ''); return m ? m[1] : null; };

/* the battery's proven-honest arc — the plausibility engine accepts exactly this shape */
const ARC = [[2.1, 1, 320, 4, 30, 12, 3, 1], [12.4, 2, 940, 11, 72, 31, 8, 2], [25.0, 3, 1880, 19, 118, 54, 15, 2], [44.7, 3, 2410, 24, 151, 66, 21, 2]];

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-onboard-'));
  say(`── booting a scratch deck on :${PORT} (${dataDir})`);
  await assertPortFree(await probeHealth(BASE), BASE, 'drill-onboarding', 'ONBOARD_DRILL_PORT');
  child = spawn(process.execPath, ['server.js', '--port', String(PORT)], {
    cwd: ROOT, env: { ...process.env, EF_DATA_DIR: dataDir, EF_CORS_ORIGINS: 'http://127.0.0.1:8123' }, stdio: 'ignore'
  });
  const h = await (async () => { for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + '/api/health'); if (r.ok) { const j = await r.json(); if (j.ok) return j; } } catch {} await new Promise(r => setTimeout(r, 250)); } return null; })();
  if (!h) { say('  FAIL- deck never became healthy'); process.exit(1); }
  assertNotLive(h, BASE, 'drill-onboarding');
  say(`── deck up (pilot census: ${h.pilots})`);

  const name = 'Newbie' + String(Date.now()).slice(-6);

  /* act 1 — the client itself onboards the pilot */
  say('── act 1: the deck client signs a fresh pilot up (zero config)');
  const net = makeClient();
  net.setDeck('');   /* same-origin client: cookies like the LAN story */
  const on = await net.probe();
  on === true ? good('probe() linked the deck') : bad('probe failed');
  const j1 = await net.register(name, 'onboard-pass-1');
  j1 && j1.ok && j1.user && j1.user.name === name ? good(`registered ${name} through the real client`) : bad('register: ' + JSON.stringify(j1).slice(0, 100));
  await net.whoami();   /* whoami() adopts into NET.user (returns undefined by design) */
  net.user && net.user.name === name ? good('the session answers /api/me — the client holds the pilot') : bad('whoami: ' + JSON.stringify(net.user ?? null).slice(0, 80));

  /* act 2 — fly an honest run; the deck accepts and ranks it */
  say('── act 2: the fresh pilot flies an honest run and ranks worldwide');
  const r2 = await net.submitScore('main', 2410, 3, 'vesper', 1, { runT: 44.7, kills: 24, cps: ARC }, {});
  r2 && r2.verdict === 'accepted' ? good('the run was accepted by the anti-cheat') : bad('submit: ' + JSON.stringify(r2).slice(0, 100));
  r2 && typeof r2.rank === 'number' && r2.rank === 1 ? good('the game-over screen would show global rank #' + r2.rank) : bad('rank: ' + JSON.stringify(r2 && r2.rank));
  const bd2 = await req('GET', '/api/scores?mode=main');
  const row = bd2.json && bd2.json.top && bd2.json.top.find(t => t.n === name);
  row && row.s === 2410 ? good('the pilot stands on the worldwide board (2410)') : bad('board row: ' + JSON.stringify(bd2.json && bd2.json.top).slice(0, 100));

  /* act 3 — second device: fresh client, fresh session, same pilot */
  say('── act 3: a second device signs in — same pilot, same history');
  const net2 = makeClient();
  net2.setDeck('');
  await net2.probe();
  const j3 = await net2.login(name, 'onboard-pass-1');
  j3 && j3.user && j3.user.name === name ? good('second-device login answers the same callsign') : bad('login: ' + JSON.stringify(j3).slice(0, 80));
  const bd3 = await req('GET', '/api/scores?mode=main');
  const mine3 = bd3.json && bd3.json.top && bd3.json.top.filter(t => t.n === name);
  mine3 && mine3.length === 1 ? good('exactly one pilot row — history travels with the account') : bad('rows: ' + (mine3 || []).length);

  /* act 4 — a stranger cannot take the callsign */
  say('── act 4: the callsign is defended');
  const r4 = await req('POST', '/api/register', { body: { name, password: 'stolen-attempt' } });
  r4.status === 409 ? good('duplicate callsign refused (409)') : bad('duplicate: ' + r4.status);

  /* act 5 — the board reads back clean */
  say('── act 5: the worldwide board reads back clean');
  const census = await req('GET', '/api/health');
  census.json && census.json.pilots === 1 ? good('census: exactly one pilot onboarded') : bad('census: ' + JSON.stringify(census.json));
  const top = bd3.json && bd3.json.top && bd3.json.top[0];
  top && top.n === name && top.s === 2410 ? good('the onboarding pilot leads the board they just joined') : bad('top: ' + String(JSON.stringify(top) || 'undefined').slice(0, 80));

  if (child) child.kill('SIGKILL');
  if (fail === 0) say(`DRILL-ONBOARDING: ALL GREEN (${pass} checks)`);
  else say(`DRILL-ONBOARDING: ${fail} FAILURES ABOVE (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

process.on('exit', () => { try { if (child) child.kill('SIGKILL'); } catch { /* gone */ } });

main().catch(e => { console.error('drill-onboarding harness error:', e); process.exit(1); });
