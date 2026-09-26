#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-cross-origin.mjs — ADR 0002, executable.

   The game ships from GitHub Pages; the deck self-hosts elsewhere. This
   drill plays the OTHER ORIGIN with raw fetches (Origin + Authorization
   headers, exactly what the browser sends on a CORS request) against a
   scratch deck booted with EF_CORS_ORIGINS set to a foreign origin:

     1. public reads carry the ACAO grant for the allowed origin, and
        NOTHING for a disallowed one (the browser blocks, the deck stays
        silent) — /api/health, /api/stats, /api/scores, pagination, /pilot
     2. preflight: the exact OPTIONS the game's PUT/POST would trigger —
        granted for allowed origins, answered 204-without-grant for the
        rest (never a hang)
     3. register + login return the token in X-Emberfall-Token (exposed to
        JS), the token authenticates /api/me and /api/scores via
        Authorization: Bearer, and logout via BEARER kills the session
     4. the pilot profile answers for a real pilot, 404 for nobody
     5. pagination: 15 honest runs seed 5 extra board rows; offset=10
        serves them, ?offset=cat is refused

   Same-origin decks (no EF_CORS_ORIGINS) are the v4.21 world and stay
   pinned by smoke.sh — no cookie of any kind appears in this drill.

   RUNS ITS OWN DECK. Exit 0 = the world can play · exit 1 = the door lies.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.XO_PORT || 8159;
const BASE = 'http://127.0.0.1:' + PORT;
const GAME_ORIGIN = 'https://fahadibrahim93.github.io';      // the foreign origin — exactly Pages
const EVIL_ORIGIN = 'https://evil.example';
const HDR = { 'Content-Type': 'application/json', 'x-emberfall': 'command-deck', Origin: GAME_ORIGIN };
let pass = 0, fail = 0, child = null;
const say  = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad  = m => { fail++; say('  FAIL-', m); };

async function req(method, p, { token, body, origin, preflight } = {}) {
  const headers = { ...HDR };
  if (origin !== undefined) headers.Origin = origin;
  if (token) headers.Authorization = 'Bearer ' + token;
  if (preflight) { delete headers['Content-Type']; delete headers['x-emberfall']; headers['Access-Control-Request-Method'] = method; if (preflight.hdrs) headers['Access-Control-Request-Headers'] = preflight.hdrs; }
  const res = await fetch(BASE + p, {
    method: preflight ? 'OPTIONS' : method,
    headers,
    body: body && !preflight ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return {
    status: res.status, json,
    acao: res.headers.get('access-control-allow-origin'),
    token: res.headers.get('x-emberfall-token'),
    expose: res.headers.get('access-control-expose-headers'),
    methods: res.headers.get('access-control-allow-methods'),
    vary: res.headers.get('vary')
  };
}
const arc = (wave, score, runT, kills) => {
  const cps = []; const N = 16;
  for (let i = 1; i <= N; i++) cps.push([
    Math.round(runT * i / N * 10) / 10,
    Math.min(wave, Math.ceil(wave * i / N)),
    Math.round(score * i / N),
    Math.round(kills * i / N),
    Math.round(900 * i / N),
    Math.round(500 * i / N),
    Math.round(40 * i / N),
    1
  ]);
  return cps;
};

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-xorigin-'));
  say(`── booting a cross-origin deck on :${PORT} (allowlist: ${GAME_ORIGIN})`);
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir, EF_CORS_ORIGINS: GAME_ORIGIN },
    stdio: 'ignore'
  });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const h = await req('GET', '/api/health'); up = !!(h.json && h.json.ok); }
    catch { await new Promise(r => setTimeout(r, 250)); }
  }
  up ? good('scratch deck healthy') : bad('deck never came up');
  if (!up) return;

  /* ── 1. public reads: grant for the friend, silence for the stranger ── */
  say('── public reads carry the grant, and only for allowed origins');
  const h = await req('GET', '/api/health');
  (h.status === 200 && h.acao === GAME_ORIGIN) ? good('health: ACAO echoes the allowed origin')
    : bad(`health: ${h.status} acao=${h.acao}`);
  const st = await req('GET', '/api/stats');
  (st.status === 200 && st.acao === GAME_ORIGIN) ? good('stats: granted for the game origin')
    : bad(`stats: ${st.status} acao=${st.acao}`);
  const evil = await req('GET', '/api/stats', { origin: EVIL_ORIGIN });
  (evil.status === 200 && !evil.acao) ? good('disallowed origin: 200 body but NO grant (browser blocks)')
    : bad(`disallowed origin: ${evil.status} acao=${evil.acao}`);
  const noO = await req('GET', '/api/stats', { origin: '' });
  (!noO.acao) ? good('no Origin header (same-origin/LAN): no CORS noise') : bad('same-origin got an ACAO?!');
  (st.vary || '').toLowerCase().includes('origin') ? good('Vary: Origin on granted answers (cache-safe)')
    : bad('missing Vary: Origin — a proxy could cross the grants');

  /* ── 2. boards + pagination, cross-origin ── */
  say('── boards read across the origin line');
  const b0 = await req('GET', '/api/scores?mode=main');
  (b0.status === 200 && b0.json && b0.json.ok) ? good('empty board answers granted') : bad('board read: ' + b0.status);

  /* ── 3. accounts: register, token, me, score, bearer logout ── */
  say('── accounts over the origin line: bearer tokens, no cookies');
  const reg = await req('POST', '/api/register', { body: { name: 'XO Pilot', password: 'cross-origin-pass' } });
  if (reg.status !== 200) { bad('register: ' + reg.status + ' ' + JSON.stringify(reg.json)); return; }
  reg.token ? good('register returns the session token in an exposed header')
    : bad('register: no X-Emberfall-Token');
  const regExpose = (reg.expose || '').includes('X-Emberfall-Token');
  regExpose ? good('token header is exposed to the page\'s JS (Access-Control-Expose-Headers)')
    : bad('token header NOT exposed — fetch could never read it');
  const me = await req('GET', '/api/me', { token: reg.token });
  (me.status === 200 && me.json && me.json.user && me.json.user.name === 'XO Pilot')
    ? good('Authorization: Bearer authenticates /api/me')
    : bad('bearer /api/me: ' + me.status + ' ' + JSON.stringify(me.json).slice(0, 80));

  /* an honest run over the bearer — cross-origin pilots climb the same board */
  const sc = await req('POST', '/api/scores', {
    token: reg.token,
    body: { mode: 'main', score: 12500, wave: 5, diff: 1, ship: 'vesper', runT: 180, kills: 90, cps: arc(5, 12500, 180, 90) }
  });
  (sc.status === 200 && sc.json && sc.json.ok && sc.json.verdict === 'accepted')
    ? good('an accepted run posted with the bearer token')
    : bad('cross-origin score post: ' + sc.status + ' ' + JSON.stringify(sc.json).slice(0, 80));
  const bd = await req('GET', '/api/scores?mode=main');
  (bd.json && bd.json.top && bd.json.top.length === 1 && bd.json.top[0].n === 'XO Pilot')
    ? good('the run ranks on the cross-origin board') : bad('board missing the pilot: ' + JSON.stringify(bd.json && bd.json.top));

  /* PUT /api/profile is the request that NEEDS a preflight (custom headers) */
  const pf = await req('PUT', '/api/profile', { preflight: { hdrs: 'content-type,x-emberfall,authorization' } });
  (pf.status === 204 && pf.acao === GAME_ORIGIN && (pf.methods || '').includes('PUT'))
    ? good('preflight: granted with the requested headers echoed')
    : bad(`preflight: ${pf.status} acao=${pf.acao} methods=${pf.methods}`);
  const pfEvil = await req('PUT', '/api/profile', { origin: EVIL_ORIGIN, preflight: { hdrs: 'content-type,x-emberfall' } });
  (pfEvil.status === 204 && !pfEvil.acao)
    ? good('preflight from a stranger: answered 204 with NO grant (no hang, no door)')
    : bad('evil preflight: ' + pfEvil.status + ' acao=' + pfEvil.acao);

  /* the profile PUT itself, over the bearer */
  const prof = await req('PUT', '/api/profile', {
    token: reg.token,
    body: { meta: { alloy: 100, runs: 1, paint: 'slate' }, cfg: {}, updated: Date.now() }
  });
  prof.status === 200 ? good('profile PUT rides the token (no cookie involved)')
    : bad('profile PUT: ' + prof.status + ' ' + JSON.stringify(prof.json).slice(0, 80));

  /* bearer logout must kill the session the token names */
  const out = await req('POST', '/api/logout', { token: reg.token });
  out.status === 200 ? good('logout accepts the bearer') : bad('bearer logout: ' + out.status);
  const meAfter = await req('GET', '/api/me', { token: reg.token });
  (meAfter.status === 200 && meAfter.json && meAfter.json.user === null)
    ? good('the token is dead after logout (session row deleted)')
    : bad('token still alive after logout');

  /* ── 4. the pilot profile page ── */
  say('── pilot profiles');
  const who = await req('GET', '/pilot/xo%20pilot');
  (who.status === 200 && who.json && who.json.name === 'XO Pilot' && who.json.bests.main && who.json.paint === 'slate')
    ? good('profile serves bests + the worn paint (case-insensitive lookup)')
    : bad('profile: ' + who.status + ' ' + JSON.stringify(who.json).slice(0, 100));
  const no = await req('GET', '/pilot/nobody');
  no.status === 404 ? good('unknown pilot 404s') : bad('unknown pilot: ' + no.status);

  /* ── 5. pagination ── */
  say('── pagination (board rows are DISTINCT pilots: 11 needed, the register bucket forces one window age-out)');
  await new Promise(r => setTimeout(r, 61000));   /* age the register bucket — the limiters drill's own pattern */
  for (let i = 0; i < 10; i++) {   /* +10 pilots: 11 rows total → page 0 full, page 1 holds XO Pilot */
    const name = 'XO Echo' + i;
    const r = await req('POST', '/api/register', { body: { name, password: 'cross-origin-pass' } });
    if (r.status !== 200) { bad(name + ' register: ' + r.status); continue; }
    const score = 30000 - i * 100;   /* descending: deterministic rank order */
    const rr = await req('POST', '/api/scores', {
      token: r.token, body: { mode: 'main', score, wave: 7, diff: 1, ship: 'vesper', runT: 240 + i, kills: 120, cps: arc(7, score, 240 + i, 120) }
    });
    if (rr.status !== 200) bad(`${name} run: ${rr.status} ${JSON.stringify(rr.json).slice(0, 60)}`);
  }
  const p0 = await req('GET', '/api/scores?mode=main');
  (p0.json && p0.json.top.length === 10 && p0.json.more === true)
    ? good('page 0: 10 rows + more:true') : bad('page 0: ' + JSON.stringify(p0.json && p0.json.top.length) + ' more=' + JSON.stringify(p0.json && p0.json.more));
  const p1 = await req('GET', '/api/scores?mode=main&offset=10');
  (p1.json && p1.json.top.length >= 1 && p1.json.top.every(r2 => !p0.json.top.some(r3 => r3.n === r2.n)) && p1.json.more === false)
    ? good('page 1: the remaining pilots, no overlap, more:false')
    : bad('page 1: ' + JSON.stringify(p1.json && p1.json.top.map(r2 => r2.n)));
  const pBad = await req('GET', '/api/scores?mode=main&offset=cat');
  (pBad.status === 200 && pBad.json && pBad.json.offset === 0)
    ? good('garbage offset floors to 0') : bad('offset=cat: ' + pBad.status);
  const pBig = await req('GET', '/api/scores?mode=main&offset=500');
  (pBig.status === 200 && pBig.json && pBig.json.offset <= 190 && pBig.json.top.length === 0)
    ? good('offset is hard-capped (public, unauthenticated endpoint)') : bad('offset=500: ' + JSON.stringify(pBig.json && pBig.json.offset));

  say(`── verdict: pass=${pass} fail=${fail}`);
  if (fail === 0) say('DRILL-CROSS-ORIGIN: ALL GREEN');
  else say('DRILL-CROSS-ORIGIN: FAILURES ABOVE');
}

main()
  .catch(e => { console.error('drill crashed:', e.message); fail++; })
  .finally(() => {
    if (child) try { child.kill(); } catch { /* gone */ }
    process.exit(fail === 0 ? 0 : 1);
  });
