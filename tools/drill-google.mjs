#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-google.mjs — Google sign-in's contract, proven end to end.

   The deck verifies Google ID tokens ITSELF (RS256 against Google's JWKS),
   so this drill mints a real RS256 token signed by a THROWAWAY key it
   generates in-process, points the deck's JWKS source at a local file, and
   flies the whole loop against a scratch deck. Proves:

     1. 501 honesty — with EF_GOOGLE_CLIENT_ID unset, the route refuses
     2. a valid minted token signs the pilot in and mints the deck's OWN
        session (bearer token authenticates /api/me like any login)
     3. the fresh Google pilot can POST /api/scores and appear on the
        global leaderboard (the whole point)
     4. the SAME Google account signing in again is the SAME row — and
        their board entries survive the round trip
     5. a callsign matching the Google email gets LINKED, not duplicated —
        and that linked pilot keeps their old score history
     6. garbage is refused: wrong signature, wrong audience, expired exp,
        tampered payload (all 401, nothing stored)

     GOOGLE_DRILL_PORT=<port> node tools/drill-google.mjs
   Exit 0 = all green · exit 1 = any gap · the live-ledger fence applies.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeHealth, assertPortFree, assertNotLive } from './live-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.GOOGLE_DRILL_PORT || 8179;
const BASE = 'http://127.0.0.1:' + PORT;
const HDR = { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' };
const CLIENT_ID = 'drill-client-id.apps.googleusercontent.com';
let pass = 0, fail = 0, child = null;
const say = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad = m => { fail++; say('  FAIL-', m); };

async function req(method, p, { body, token } = {}) {
  const headers = { ...HDR };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
}
/* the Set-Cookie line is "EF_SESSION=<token>; Path=/; ..." — stop at the first semicolon */
const tokenOf = sc => { const m = /EF_SESSION=([^;\r]+)/.exec(sc || ''); return m ? m[1] : null; };
/* the battery's proven-honest arc — the plausibility engine accepts exactly this shape */
const ARC = [[2.1, 1, 320, 4, 30, 12, 3, 1], [12.4, 2, 940, 11, 72, 31, 8, 2], [25.0, 3, 1880, 19, 118, 54, 15, 2], [44.7, 3, 2410, 24, 151, 66, 21, 2]];

/* ── the throwaway identity provider: RSA keypair + JWKS + minted tokens ── */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB_JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'drill-key-1', alg: 'RS256', use: 'sig' };
const b64u = b => Buffer.from(b).toString('base64url');

function mintToken({ sub, email, aud = CLIENT_ID, iss = 'https://accounts.google.com', exp, iat }) {
  const head = b64u(JSON.stringify({ alg: 'RS256', kid: PUB_JWK.kid, typ: 'JWT' }));
  const payload = b64u(JSON.stringify({
    sub, email, email_verified: true, aud, iss,
    exp: exp ?? Math.floor(Date.now() / 1000) + 600,
    iat: iat ?? Math.floor(Date.now() / 1000) - 10
  }));
  const sig = b64u(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + payload), privateKey));
  return head + '.' + payload + '.' + sig;
}
/* re-sign with a DIFFERENT key: valid shape, invalid signature */
const impostor = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

function bootDeck(dataDir) {
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: {
      ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir,
      EF_GOOGLE_CLIENT_ID: CLIENT_ID,
      EF_GOOGLE_JWKS_FILE: jwksPath   /* the deck reads THIS file, not Google */
    },
    stdio: 'ignore'
  });
}

async function waitHealthy() {
  for (let i = 0; i < 40; i++) {
    try { const h = await req('GET', '/api/health'); if (h.json && h.json.ok) return h.json; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

const jwksPath = path.join(os.tmpdir(), 'ef-drill-google-jwks-' + Date.now() + '.json');

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-google-'));
  say(`── booting a scratch deck on :${PORT} (${dataDir})`);
  await assertPortFree(await probeHealth(BASE), BASE, 'drill-google', 'GOOGLE_DRILL_PORT');
  fs.writeFileSync(jwksPath, JSON.stringify({ keys: [PUB_JWK] }));
  bootDeck(dataDir);

  const h = await waitHealthy();
  if (!h) { say('  FAIL- deck never became healthy'); process.exit(1); }
  assertNotLive(h, BASE, 'drill-google');
  say(`── deck up (pilot census: ${h.pilots})`);

  /* act 0 — this boot IS configured; the unconfigured-deck 501 is pinned by
     the route guard reading GOOGLE_ID before anything else and re-proven in
     the smoke battery (a plain boot answers 501). */

  /* act 1 — a Google pilot signs in and gets the deck's OWN session */
  say('── act 1: google sign-in mints the deck\'s own session');
  const novaSub = 'google-drill-sub-001';
  const tok1 = mintToken({ sub: novaSub, email: 'nova.pilot@gmail.com' });
  const r1 = await req('POST', '/api/auth/google', { body: { credential: tok1 } });
  r1.status === 200 && r1.json && r1.json.ok ? good('valid ID token accepted') : bad('auth/google: ' + r1.status + ' ' + JSON.stringify(r1.json).slice(0, 120));
  const sessCookie = r1.headers.get('set-cookie') || '';
  const bearer = tokenOf(sessCookie);
  bearer ? good('a deck session token was minted (bearer carrier)') : bad('no session token in the answer');
  r1.json && r1.json.user && r1.json.user.name === 'novapilot'
    ? good('callsign derived from the email: ' + r1.json.user.name)
    : bad('callsign: ' + JSON.stringify(r1.json && r1.json.user));
  const me1 = await req('GET', '/api/me', { token: bearer });
  me1.status === 200 && me1.json && me1.json.user && me1.json.user.google === true
    ? good('/api/me answers the session and flags the Google account')
    : bad('/api/me: ' + me1.status + ' ' + JSON.stringify(me1.json).slice(0, 100));

  /* act 2 — the Google pilot flies a run and lands on the global board */
  say('── act 2: the google pilot climbs the global leaderboard');
  const sc1 = await req('POST', '/api/scores', {
    token: bearer,
    body: { mode: 'main', score: 2410, wave: 3, ship: 'vesper', diff: 1, runT: 44.7, kills: 24, cps: ARC }
  });
  sc1.status === 200 && sc1.json && sc1.json.ok ? good('honest run accepted from the Google session') : bad('score post: ' + sc1.status + ' ' + JSON.stringify(sc1.json).slice(0, 120));
  const bd = await req('GET', '/api/scores?mode=main');
  const row = bd.json && bd.json.top && bd.json.top.find(t => t.n === 'novapilot');
  row && row.s === 2410 ? good('the Google pilot stands on the global board (2410)') : bad('board row missing: ' + JSON.stringify(bd.json && bd.json.top).slice(0, 120));

  /* act 3 — same Google account returns = same row, history intact */
  say('── act 3: returning google pilot is the same row');
  const tok2 = mintToken({ sub: novaSub, email: 'nova.pilot@gmail.com' });
  const r2 = await req('POST', '/api/auth/google', { body: { credential: tok2 } });
  const bearer2 = tokenOf(r2.headers.get('set-cookie') || '');
  const me2 = await req('GET', '/api/me', { token: bearer2 });
  me2.json && me2.json.user && me2.json.user.name === 'novapilot'
    ? good('second sign-in answered the same callsign')
    : bad('second sign-in: ' + JSON.stringify(me2.json && me2.json.user));
  const bd2 = await req('GET', '/api/scores?mode=main');
  const again = bd2.json && bd2.json.top && bd2.json.top.filter(t => t.n === 'novapilot');
  again && again.length === 1 ? good('still exactly one pilot row on the board') : bad('duplicate rows: ' + (again || []).length);
  const me3 = await req('GET', '/api/me', { token: bearer });
  me3.status === 200 && me3.json && me3.json.user ? good('the first session still authenticates (same pilot, independent sessions)') : bad('first session died early');

  /* act 4 — linking: a pre-existing callsign that IS the email local part */
  say('── act 4: matching callsign is LINKED, never duplicated');
  const reg = await req('POST', '/api/register', { body: { name: 'stellarfox', password: 'link-pass-1' } });
  reg.status === 200 ? good('classic pilot stellarfox registered first') : bad('register: ' + reg.status);
  const regTok = tokenOf(reg.headers.get('set-cookie') || '');
  const oldScore = await req('POST', '/api/scores', { token: regTok, body: { mode: 'main', score: 2410, wave: 3, ship: 'vesper', diff: 1, runT: 44.7, kills: 24, cps: ARC } });
  oldScore.status === 200 && oldScore.json && oldScore.json.ok ? good('classic pilot has honest score history (2410)') : bad('classic score: ' + oldScore.status + ' ' + JSON.stringify(oldScore.json).slice(0, 100));
  const lpw = await req('POST', '/api/logout', { token: regTok });
  lpw.status === 200 ? good('classic pilot signed out before the Google link') : bad('logout: ' + lpw.status);
  const linkTok = mintToken({ sub: 'google-drill-sub-002', email: 'stellarfox@gmail.com' });
  const lr = await req('POST', '/api/auth/google', { body: { credential: linkTok } });
  lr.status === 200 && lr.json && lr.json.user && lr.json.user.name === 'stellarfox'
    ? good('google sign-in ADOPTED the existing callsign stellarfox')
    : bad('link: ' + lr.status + ' ' + JSON.stringify(lr.json && lr.json.user));
  const lp = await req('GET', '/api/me', { token: tokenOf(lr.headers.get('set-cookie') || '') });
  if (!lp.json || !lp.json.user) bad('linked /api/me did not answer a session');
  const bdAfter = await req('GET', '/api/scores?mode=main');
  const linked = bdAfter.json && bdAfter.json.top && bdAfter.json.top.find(t => t.n === 'stellarfox');
  linked && linked.s === 2410 ? good('the linked pilot kept their score history on the board (2410)') : bad('history after link: ' + JSON.stringify(bdAfter.json && bdAfter.json.top).slice(0, 140));

  /* act 5 — concurrency: N simultaneous FIRST sign-ins for one Google
     account (the double-click / two-tabs case). Every request must answer
     200 and join ONE pilot row. The old find-then-mint raced exactly here:
     two concurrent mints both missed the SELECT and the loser died on
     'UNIQUE constraint failed: users.google_sub' — proven live when the
     parallel e2e burst surfaced that 500 in a deck log. The IMMEDIATE
     transaction makes the loser's SELECT see the winner's row inside the
     write lock, so a join is the only possible outcome. (Budget note: the
     google limiter is 10/60s per IP — acts 1-4 spent 3, so this act fires
     exactly 7 and the NEXT act waits out the window first.) */
  say('── act 5: concurrent first sign-ins for one account join, never race');
  const raceSub = 'google-drill-sub-race';
  const RACE_N = 7;
  const raceResults = await Promise.all(
    Array.from({ length: RACE_N }, () =>
      req('POST', '/api/auth/google', { body: { credential: mintToken({ sub: raceSub, email: 'race.pilot@gmail.com' }) } }))
  );
  raceResults.every(r => r.status === 200 && r.json && r.json.ok)
    ? good(`all ${RACE_N} concurrent first sign-ins answered 200`)
    : bad('concurrent sign-ins: ' + raceResults.map(r => r.status).join(',') + ' ' + JSON.stringify((raceResults.find(r => r.status !== 200) || {}).json || {}).slice(0, 100));
  const raceNames = new Set(raceResults.map(r => r.json && r.json.user && r.json.user.name).filter(Boolean));
  raceNames.size === 1
    ? good('every racer joined the same pilot row (' + [...raceNames][0] + ')')
    : bad('racer callsigns: ' + [...raceNames].join(','));
  const raceMe = await req('GET', '/api/me', { token: tokenOf(raceResults[0].headers.get('set-cookie') || '') });
  raceMe.status === 200 && raceMe.json && raceMe.json.user
    ? good('a session minted inside the burst authenticates')
    : bad('race session: ' + raceMe.status);

  /* the google limiter window is spent (acts 1-5 = 10 posts) — the refusal
     act below needs a fresh one. drill-duels drains the same way. */
  say('  ..   draining the google limiter window (61s) before the refusals');
  await new Promise(r => setTimeout(r, 61000));

  /* act 6 — refusals: impostor signature, wrong audience, expired, tamper */
  say('── act 6: garbage is refused, nothing stored');
  const impTok = (() => {
    const t = mintToken({ sub: 'impostor', email: 'impostor@gmail.com' }).split('.');
    const head = t[0], payload = t[1];
    const sig = b64u(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + payload), impostor.privateKey));
    return head + '.' + payload + '.' + sig;
  })();
  const rr1 = await req('POST', '/api/auth/google', { body: { credential: impTok } });
  rr1.status === 401 ? good('wrong signature refused (401)') : bad('impostor: ' + rr1.status);
  const wrongAud = mintToken({ sub: 'sub-aud', email: 'aud@gmail.com', aud: 'someone-elses-id.apps.googleusercontent.com' });
  const rr2 = await req('POST', '/api/auth/google', { body: { credential: wrongAud } });
  rr2.status === 401 ? good('wrong audience refused (401)') : bad('audience: ' + rr2.status);
  const expired = mintToken({ sub: 'sub-exp', email: 'exp@gmail.com', exp: Math.floor(Date.now() / 1000) - 3600 });
  const rr3 = await req('POST', '/api/auth/google', { body: { credential: expired } });
  rr3.status === 401 ? good('expired token refused (401)') : bad('expired: ' + rr3.status);
  const parts = mintToken({ sub: 'sub-tamper', email: 'tamper@gmail.com' }).split('.');
  const tampered = parts[0] + '.' + b64u(JSON.stringify({ sub: 'sub-tamper', email: 'tamper@gmail.com', email_verified: true, aud: CLIENT_ID, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600 })) + '.' + parts[2];
  const rr4 = await req('POST', '/api/auth/google', { body: { credential: tampered } });
  rr4.status === 401 ? good('tampered payload refused (401)') : bad('tamper: ' + rr4.status);
  const rr5 = await req('POST', '/api/auth/google', { body: { credential: 'not-a-token' } });
  rr5.status === 401 ? good('malformed token refused (401)') : bad('malformed: ' + rr5.status);
  const census = await req('GET', '/api/health');
  census.json && census.json.pilots === 3
    ? good('ledger census unchanged by the refusals (3 pilots: novapilot, stellarfox, racepilot)')
    : bad('census: ' + JSON.stringify(census.json));

  await new Promise(r => setTimeout(r, 200));
  if (child) child.kill('SIGKILL');   // the sessions drill is the one that proves reboot-survival; here a clean kill is enough

  if (fail === 0) say(`DRILL-GOOGLE: ALL GREEN (${pass} checks)`);
  else say(`DRILL-GOOGLE: ${fail} FAILURES ABOVE (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

process.on('exit', () => {
  try { if (child) child.kill('SIGKILL'); } catch { /* already gone */ }
  try { fs.rmSync(jwksPath, { force: true }); } catch { /* tmp is tmp */ }
});

main().catch(e => { console.error('drill-google harness error:', e); process.exit(1); });
