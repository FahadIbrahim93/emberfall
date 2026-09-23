#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-limiters.mjs — the deck's self-defense, executable.

   The deck rate-limits per IP+bucket (register 10/min, login 15/min,
   challenge 12/min, beat 12/min, score 20/min). Until now those buckets
   were proven only by accident (smoke's login burst, the duels drill
   stumbling into a 429). This drill proves each bucket HONESTLY 429s when
   its budget is spent — with telemetry-backed bodies so nothing 429s for
   the wrong reason (anti-cheat fires before the limiter on /api/scores,
   so the score/beat probes fly real arcs).

   ORDER MATTERS: every pilot is registered BEFORE the register bucket is
   drained (a pilot created after its budget is spent does not exist, and
   every later probe degrades into 401s that prove nothing).

   RUNS ITS OWN DECK: boots server.js on a scratch port with a scratch
   EF_DATA_DIR, waits for /api/health, proves, tears the deck down. CI:
   one step after drill-duels. Local: node tools/drill-limiters.mjs.
   Exit 0 = every bucket honest · exit 1 = any bucket open.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.LIM_PORT || 8151;
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

/* honest telemetry arc — score/beat probes must clear the anti-cheat so a
   429 can only mean the limiter fired */
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

/* spend a bucket until it 429s. 200 = accepted, 429 = the point; ANY other
   status is a wrong-reason answer and fails the probe immediately. */
async function drain(bucketName, cap, attempt) {
  let saw429 = false, accepted = 0;
  for (let i = 0; i < cap + 3 && !saw429; i++) {
    const r = await attempt(i);
    if (r.status === 429) saw429 = true;
    else if (r.status === 200) accepted++;
    else { bad(`${bucketName}: wrong-reason answer ${r.status} (${JSON.stringify(r.json).slice(0, 120)})`); return false; }
  }
  saw429 ? good(`${bucketName}: honest 429 at its budget (${accepted} accepted first)`)
         : bad(`${bucketName}: never 429'd within ${cap + 3} attempts — the bucket is open`);
  return saw429;
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-limiters-'));
  say(`── booting a scratch deck on :${PORT} (${dataDir})`);
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir },
    stdio: 'ignore'
  });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const h = await req('GET', '/api/health'); up = !!(h.json && h.json.ok); }
    catch { await new Promise(r => setTimeout(r, 250)); }
  }
  up ? good('scratch deck healthy') : bad('deck never came up');
  if (!up) return;

  /* all pilots FIRST — the register bucket has 10; we spend 2 on named
     pilots and drain the rest on throwaway callsigns */
  say('── pilots first: registration inside the budget');
  const pilots = ['LimMain', 'LimB'];
  for (const name of pilots) {
    const r = await req('POST', '/api/register', { body: { name, password: 'limiter-pass' } });
    r.status === 200 ? good(`${name} registered`) : bad(`${name} register: ${r.status} ${JSON.stringify(r.json)}`);
  }

  /* REGISTER bucket: 2 spent + 8 accepted = 10, the 11th probe must 429 */
  say('── register bucket (10/min)');
  await drain('register', 10, i => req('POST', '/api/register', { body: { name: 'LimR' + i, password: 'limiter-pass' } }));

  /* LOGIN bucket: correct credentials every time — 15 accepted, then 429 */
  say('── login bucket (15/min)');
  await drain('login', 15, () => req('POST', '/api/login', { body: { name: 'LimMain', password: 'limiter-pass' } }));

  /* the shared per-IP window is fully spent; age it out once */
  say('  ..   draining the shared window 61s for the authenticated buckets');
  await new Promise(r => setTimeout(r, 61000));

  const login = await req('POST', '/api/login', { body: { name: 'LimMain', password: 'limiter-pass' } });
  const tok = tokenOf(login.setCookie);
  tok ? good('signed in after the drain') : bad('login after drain: ' + login.status);
  const loginB = await req('POST', '/api/login', { body: { name: 'LimB', password: 'limiter-pass' } });
  const tokB = tokenOf(loginB.setCookie);
  tokB ? good('second pilot signed in') : bad('LimB login: ' + loginB.status);
  if (!tok || !tokB) return;

  /* SCORE bucket: honest distinct daily arcs — 20 accepted, then 429 */
  say('── score bucket (20/min)');
  await drain('score', 20, i => req('POST', '/api/scores', { token: tok, body: { mode: 'daily', score: 40200 + i, wave: 16, diff: 2, ship: 'vesper', runT: 960 + i, kills: 700, cps: arc(16, 40200 + i, 960 + i, 700) } }));

  /* CHALLENGE bucket: 12 creates, then 429 */
  say('── challenge bucket (12/min)');
  const today = new Date().toISOString().slice(0, 10);
  const frames = []; for (let i = 0; i < 120; i++) frames.push([i * 16, Math.round(Math.sin(i / 6) * 120), Math.round(Math.cos(i / 9) * 90)]);
  await drain('challenge', 12, i => req('POST', '/api/challenges', { token: tok, body: { to: 'LimB', day: today, score: 5200 + i, wave: 4, ship: 'vesper', ghost: { frames }, paint: 'yard' } }));

  /* BEAT bucket: B fetches the newest challenge and beats it honestly */
  say('── beat bucket (12/min)');
  const list = await req('GET', '/api/challenges', { token: tokB });
  const cid = (list.json && list.json.list && list.json.list[0] || {}).id;
  cid ? good('challenge inbox ready for the beat drain') : bad('no challenge in inbox');
  if (cid) await drain('beat', 12, i => req('POST', '/api/challenges/beat', { token: tokB, body: { id: cid, score: 6400 + i, wave: 6, diff: 2, runT: 310 + i, kills: 220, cps: arc(6, 6400 + i, 310 + i, 220) } }));

  say(`── verdict: pass=${pass} fail=${fail}`);
  if (fail === 0) say('DRILL-LIMITERS: ALL GREEN');
  else say('DRILL-LIMITERS: FAILURES ABOVE');
}

main()
  .catch(e => { console.error('drill crashed:', e.message); fail++; })
  .finally(() => {
    if (child) try { child.kill(); } catch { /* gone */ }
    process.exit(fail === 0 ? 0 : 1);
  });
