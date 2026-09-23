#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-duels.mjs — the full duels week, executable (promoted from the
   v4.12 scratch drill). Runs against a DECK ALREADY UP (BASE env, default
   127.0.0.1:8123) and proves the challenge loop end to end:

     register ×3 → login (session cookies) → create → inbox → ghost
     ownership → beat with honest telemetry → idempotence (unique row,
     never double-counts) → ownership refusals → self-duel / unknown
     pilot / stale-day / bad-paint refusals.

   Limiter budget (per IP, shared window): register ≤10/min, login ≤15/min.
   This drill spends 3 registers + 3 logins — inside budget on a cold deck.
   In CI it runs directly after smoke, whose 20-concurrent-login burst fills
   the same per-IP login window; that 429 is the limiter being honest, so
   the drill drain-waits one 61s window and retries once instead of failing.
   Idempotent on rerun: existing callsigns log in instead of registering.

   Exit 0 = all green · exit 1 = any failure. Wired into CI (smoke job).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8123';
const HDR = { 'Content-Type': 'application/json', 'x-emberfall': 'command-deck' };
let pass = 0, fail = 0;
const say  = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad  = m => { fail++; say('  FAIL-', m); };

async function req(method, path, { token, body } = {}) {
  const headers = { ...HDR };
  if (token) headers.Cookie = 'EF_SESSION=' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
const tokenOf = setCookie => { const m = /EF_SESSION=([^;\r]+)/.exec(setCookie || ''); return m ? m[1] : null; };

/* honest telemetry: 8-wide monotonic checkpoints — the shape verifyRun
   demands (the deck rejected the first drill's fake arc, rightly) */
function arc(wave, score, runT, kills) {
  const cps = []; const N = 16;
  for (let i = 1; i <= N; i++) {
    cps.push([
      Math.round(runT * i / N * 10) / 10,
      Math.min(wave, Math.ceil(wave * i / N)),
      Math.round(score * i / N),
      Math.round(kills * i / N),
      Math.round(700 * i / N),
      Math.round(390 * i / N),
      Math.round(40 * i / N),
      1
    ]);
  }
  return cps;
}

async function main() {
  say(`── drill-duels vs ${BASE}`);
  const uniq = 'Drill' + Math.random().toString(36).slice(2, 7);
  const pilots = [
    [uniq + 'A', 'drillpass1'],
    [uniq + 'B', 'drillpass2'],
    [uniq + 'C', 'drillpass3'],
  ];
  const T = {};
  for (const [name, pw] of pilots) {
    const reg = await req('POST', '/api/register', { body: { name, password: pw } });
    if (reg.json && reg.json.ok) good(`${name} registered`);
    else bad(`${name} register: ${reg.status} ${JSON.stringify(reg.json)}`);
    /* the limiter is honest, not hostile: this drill runs right after smoke
       on the same deck, and smoke's 20-concurrent-login burst shares the
       same per-IP window. A 429 here is the deck defending itself, not the
       drill failing — so drain-wait one 61s window (a 60s sliding budget
       fully ages out), then retry once. No sleeps on the happy path. */
    let tok = null, wasLimited = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const login = await req('POST', '/api/login', { body: { name, password: pw } });
      tok = tokenOf(login.setCookie);
      if (tok) { T[name] = tok; good(`${name} signed in`); break; }
      if (login.status !== 429) { bad(`${name} login: ${login.status} ${JSON.stringify(login.json)}`); break; }
      wasLimited = true;
      if (attempt === 0) { say(`  ..   ${name} met the login limiter (smoke's burst shares the window) — draining 61s`); await new Promise(r => setTimeout(r, 61000)); }
    }
    if (!tok && wasLimited) bad(`${name} still limited after one drain — window busier than smoke's burst can explain`);
  }
  if (fail) { say('drill: cannot continue without sessions'); process.exit(1); }

  say('── guard rails: the refusals');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const mkBody = (to, day, paint) => ({ to, day, score: 1000, wave: 3, ship: 'vesper', ghost: { frames: [[0, 0, 0]] }, paint });
  let r = await req('POST', '/api/challenges', { token: T[pilots[0][0]], body: mkBody(pilots[0][0], today, 'yard') });
  /you cannot duel yourself/.test(r.json?.error) ? good('self-duel refused') : bad('self-duel: ' + JSON.stringify(r.json));
  r = await req('POST', '/api/challenges', { token: T[pilots[0][0]], body: mkBody('Ghost' + uniq, today, 'yard') });
  /no such pilot/.test(r.json?.error) ? good('unknown pilot 404') : bad('unknown pilot: ' + JSON.stringify(r.json));
  r = await req('POST', '/api/challenges', { token: T[pilots[0][0]], body: mkBody(pilots[1][0], yesterday, 'yard') });
  /today's run only/.test(r.json?.error) ? good("yesterday's duel refused") : bad('yesterday: ' + JSON.stringify(r.json));
  r = await req('POST', '/api/challenges', { token: T[pilots[0][0]], body: mkBody(pilots[1][0], today, 'notacolor') });
  /bad paint/.test(r.json?.error) ? good('unknown paint refused') : bad('paint: ' + JSON.stringify(r.json));

  say('── the duel: A challenges B with a real 120-frame ghost');
  const frames = [];
  for (let i = 0; i < 120; i++) frames.push([i * 16, Math.round(Math.sin(i / 6) * 120), Math.round(Math.cos(i / 9) * 90)]);
  r = await req('POST', '/api/challenges', { token: T[pilots[0][0]], body: { to: pilots[1][0], day: today, score: 5200, wave: 4, ship: 'vesper', ghost: { frames }, paint: 'verdant' } });
  const cid = r.json?.id;
  cid ? good(`duel created id=${cid}`) : bad('create: ' + JSON.stringify(r.json));

  r = await req('GET', '/api/challenges', { token: T[pilots[1][0]] });
  const mine = (r.json?.list || []).find(c => c.id === cid);
  mine ? good('B inbox holds the new duel') : bad('inbox: ' + JSON.stringify(r.json));
  mine?.from_name === pilots[0][0] ? good('inbox names the challenger') : bad('from: ' + JSON.stringify(mine));
  mine?.paint === 'verdant' ? good("inbox carries the challenger's paint") : bad('paint: ' + JSON.stringify(mine));
  mine?.beaten === 0 ? good('inbox starts un-beaten') : bad('beaten flag: ' + JSON.stringify(mine));

  r = await req('GET', '/api/challenges/ghost?id=' + cid, { token: T[pilots[1][0]] });
  r.json?.ghost?.frames?.length === 120 ? good('B fetches the ghost (120 frames)') : bad('ghost: ' + JSON.stringify(r.json));
  r = await req('GET', '/api/challenges/ghost?id=' + cid, { token: T[pilots[2][0]] });
  /no such duel/.test(r.json?.error) ? good("C cannot fetch B's duel") : bad('steal: ' + JSON.stringify(r.json));

  say('── the beat: B flies A\u2019s line and wins');
  const beatBody = { id: cid, score: 6400, wave: 6, diff: 2, runT: 310, kills: 220, cps: arc(6, 6400, 310, 220) };
  r = await req('POST', '/api/challenges/beat', { token: T[pilots[1][0]], body: beatBody });
  r.json?.beaten === true ? good('beat accepted') : bad('beat: ' + JSON.stringify(r.json));
  r = await req('POST', '/api/challenges/beat', { token: T[pilots[1][0]], body: beatBody });
  /* idempotent BY DESIGN: the unique (challenge, pilot) row absorbs
     identical resubmits silently — beaten stays true, count stays 1 */
  r.json?.beaten === true ? good('identical resubmit acknowledged without double-count') : bad('resubmit: ' + JSON.stringify(r.json));
  r = await req('POST', '/api/challenges/beat', { token: T[pilots[1][0]], body: { ...beatBody, score: 1000, wave: 1, runT: 40, kills: 30, cps: arc(1, 1000, 40, 30) } });
  /did not beat/.test(r.json?.error) ? good('lower score refused') : bad('weak: ' + JSON.stringify(r.json));
  r = await req('POST', '/api/challenges/beat', { token: T[pilots[2][0]], body: beatBody });
  /no such duel/.test(r.json?.error) ? good("C cannot beat B's duel") : bad('C beat: ' + JSON.stringify(r.json));
  r = await req('POST', '/api/challenges/beat', { token: T[pilots[1][0]], body: { ...beatBody, score: 7100, runT: 305, kills: 230, cps: arc(6, 7100, 305, 230) } });
  r.json?.beaten === true ? good('second distinct win acknowledged (idempotent)') : bad('again: ' + JSON.stringify(r.json));
  r = await req('GET', '/api/challenges', { token: T[pilots[1][0]] });
  r.json?.list?.find(c => c.id === cid)?.beaten === 1 ? good('inbox shows the duel beaten exactly once') : bad('beaten flag after: ' + JSON.stringify(r.json?.list));

  say('── verdict');
  say(`  pass=${pass} fail=${fail}`);
  if (fail === 0) say('DRILL-DUELS: ALL GREEN');
  else { say('DRILL-DUELS: FAILURES ABOVE'); process.exit(1); }
}
main().catch(e => { console.error('drill crashed:', e.message); process.exit(1); });
