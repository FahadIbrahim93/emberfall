#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-rare-sunday.mjs — the fall itself, rehearsed before it arrives.

   Boots a scratch deck with EF_DECK_DAY=2026-09-27 (the deck's next real
   rare Sunday) and proves the WHOLE honor loop on the day itself:

     1. an honest wave-16 daily run on the rare day earns the Wardenfall
        medal, the per-run flag is 1, and the day in the ledger is the
        pinned day;
     2. /api/me answers the lifetime count (wardenfalls: 1);
     3. a same-day repeat cannot inflate the count (one honor per day);
     4. a wave-15 pilot on the SAME rare day is denied — the kill is
        provable from the run, the wave gate holds even when the boss is up;
     5. the override is a rehearsal clock, not a time machine: /api/health's
        epoch stays the real wall clock (sessions, limiters, seasons did
        not move).

   Exit 0 = the honor loop is proven on the rare day · exit 1 = any gap.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RARE_DAY = process.env.RARE_DAY || '2026-09-27';
const PORT = process.env.RS_PORT || 8155;
const BASE = 'http://127.0.0.1:' + PORT;
const HDR = { 'Content-Type': 'application/json', 'x-emberfall': 'command-deck' };
let pass = 0, fail = 0, child = null;
const say  = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad  = m => { fail++; say('  FAIL-', m); };

async function req(method, p, { token, body } = {}) {
  const headers = { ...HDR };
  if (token) headers.Cookie = 'EF_SESSION=' + token;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
const tokenOf = sc => { const m = /EF_SESSION=([^;\r]+)/.exec(sc || ''); return m ? m[1] : null; };

/* honest telemetry — the arc the anti-cheat accepts; distinct per run */
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

async function pilot(tag) {
  const name = tag + Math.random().toString(36).slice(2, 8);
  const r1 = await req('POST', '/api/register', { body: { name, password: 'rare-sunday-pass' } });
  if (!(r1.json && r1.json.ok)) { bad(`${name} register: ${JSON.stringify(r1.json)}`); return null; }
  const r2 = await req('POST', '/api/login', { body: { name, password: 'rare-sunday-pass' } });
  const tok = tokenOf(r2.setCookie);
  if (!tok) { bad(`${name} login: ${r2.status}`); return null; }
  return { name, tok };
}

async function fly(tok, wave, score, runT, kills, ship) {
  return req('POST', '/api/scores', { token: tok, body: { mode: 'daily', score, wave, diff: 2, ship: ship || 'vesper', runT, kills, cps: arc(wave, score, runT, kills) } });
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-rare-'));
  say(`── booting a scratch deck on :${PORT}, the clock pinned to ${RARE_DAY}`);
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir, EF_DECK_DAY: RARE_DAY },
    stdio: 'ignore'
  });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const h = await req('GET', '/api/health'); up = !!(h.json && h.json.ok); }
    catch { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!up) { bad('deck never came up'); return; }
  good('deck healthy');

  say('── the rehearsal clock is a clock of DAYS, not of time');
  const h = await req('GET', '/api/health');
  const drift = Math.abs(h.json.t - Date.now());
  drift < 86400000 ? good(`health.t is the honest wall clock (${Math.round(drift / 1000)}s drift) — sessions/limiters/seasons unmoved`)
                   : bad('health.t moved with the override — the override is too wide');

  say(`── the honor loop, ON ${RARE_DAY}`);
  const a = await pilot('RsA');
  if (!a) return;
  let r = await fly(a.tok, 16, 50000, 960, 700);
  const d = r.json && r.json.daily;
  if (r.status === 200 && d) {
    d.day === RARE_DAY ? good(`the deck flew the pinned day (${d.day})`) : bad('day: ' + d.day);
    (d.medals || []).includes('Wardenfall') ? good('the Wardenfall medal is paid on the day itself') : bad('medals: ' + (d.medals || []).join('|'));
    d.wardenfall === 1 ? good('per-run flag honest: wardenfall:1') : bad('flag: ' + d.wardenfall);
  } else bad('run rejected: ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 160));

  r = await req('GET', '/api/me', { token: a.tok });
  r.json && r.json.wardenfalls === 1 ? good('/api/me answers the lifetime count: 1') : bad('me: ' + JSON.stringify(r.json).slice(0, 120));

  say('── one honor per day: a same-day repeat cannot inflate');
  r = await fly(a.tok, 16, 50300, 965, 705, 'wraith');
  const d2 = r.json && r.json.daily;
  d2 && d2.wardenfalls === 1 ? good('lifetime count stays 1 after a same-day re-flight') : bad('lifetime after repeat: ' + JSON.stringify(d2));

  say('── the wave gate holds on the rare day: wave 15 earns no fall');
  const c = await pilot('RsC');
  if (!c) return;
  r = await fly(c.tok, 15, 46000, 900, 640);
  const d3 = r.json && r.json.daily;
  if (d3) {
    !(d3.medals || []).includes('Wardenfall') && d3.wardenfall === 0
      ? good('wave-15 on the rare day: no medal, flag 0 — the kill must be flown')
      : bad('wave-15 was paid the honor: ' + JSON.stringify(d3));
  } else bad('wave-15 run: ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 120));
  r = await req('GET', '/api/me', { token: c.tok });
  r.json && r.json.wardenfalls === 0 ? good('the short pilot carries no fall') : bad('me C: ' + JSON.stringify(r.json).slice(0, 120));

  say(`── verdict: pass=${pass} fail=${fail}`);
  if (fail === 0) say('DRILL-RARE-SUNDAY: ALL GREEN');
  else say('DRILL-RARE-SUNDAY: FAILURES ABOVE');
}

main()
  .catch(e => { console.error('drill crashed:', e.message); fail++; })
  .finally(() => {
    if (child) try { child.kill(); } catch { /* gone */ }
    process.exit(fail === 0 ? 0 : 1);
  });
