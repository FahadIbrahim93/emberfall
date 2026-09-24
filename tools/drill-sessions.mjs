#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-sessions.mjs — the deck's memory, proven across death.

   Sessions are SQLite-backed (SHA-256 token hash, HttpOnly cookie), so a
   pilot's login survives restarts — and even hard crashes — by
   construction. This drill proves the whole contract in four acts:

     1. SURVIVAL: register + login on a scratch deck, then SIGKILL the
        deck (the harshest death a process can die — no cleanup, no
        checkpoint) and boot it again on the same data dir. The same
        cookie must still authenticate /api/me, and the pilot's profile
        data must have survived with them.
     2. HYGIENE: seed an EXPIRED session row directly into SQLite, boot
        the deck — the v4.15.2 boot sweep must delete it (a pilot who
        never returns still leaves; no zombie rows).
     3. LIVE-ROW SAFETY: the sweep must not touch valid sessions — the
        surviving pilot's session row count stays 1 after the sweep.
     4. LOGOUT: the explicit end must still delete the row; after logout
        the cookie authenticates nothing.

   Exit 0 = the deck remembers who you are (and forgets who you were)
   · exit 1 = any gap.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.SESS_PORT || 8165;
const BASE = 'http://127.0.0.1:' + PORT;
const HDR = { 'Content-Type': 'application/json', 'x-emberfall': 'command-deck' };
let pass = 0, fail = 0, child = null;
const say  = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad  = m => { fail++; say('  FAIL-', m); };

async function req(method, p, { token, body, cookie } = {}) {
  const headers = { ...HDR };
  if (token) headers.Cookie = 'EF_SESSION=' + token;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
const tokenOf = sc => { const m = /EF_SESSION=([^;\r]+)/.exec(sc || ''); return m ? m[1] : null; };

function bootDeck(dataDir) {
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir },
    stdio: 'ignore'
  });
}
async function waitHealthy() {
  for (let i = 0; i < 40; i++) {
    try { const h = await req('GET', '/api/health'); if (h.json && h.json.ok) return true; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}
const stopDeck = () => { if (child) { try { child.kill('SIGKILL'); } catch { /* gone */ } child = null; } };

function nodeSql(dbPath, code) {
  const tmp = path.join(os.tmpdir(), 'ef-sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.js');
  fs.writeFileSync(tmp, code.replaceAll('__DB__', JSON.stringify(dbPath)));
  try { return execFileSync(process.execPath, [tmp], { stdio: 'pipe', encoding: 'utf8' }).trim(); }
  finally { fs.rmSync(tmp, { force: true }); }
}
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-sessions-'));
  const dbPath = path.join(dataDir, 'emberfall.db');
  const name = 'Mem' + Math.random().toString(36).slice(2, 8);
  const pw = 'memory-pass-1';

  say('── act 1: the deck remembers, even after SIGKILL');
  bootDeck(dataDir);
  (await waitHealthy()) ? good('deck 1 up') : bad('deck 1 never came up');
  const reg = await req('POST', '/api/register', { body: { name, password: pw } });
  if (!(reg.json && reg.json.ok)) { bad('register: ' + JSON.stringify(reg.json)); return; }
  const login = await req('POST', '/api/login', { body: { name, password: pw } });
  const token = tokenOf(login.setCookie);
  if (!token) { bad('login: ' + login.status); return; }
  good('pilot registered + logged in');
  /* a profile write so act 1 also proves DATA survives the death */
  const prof = await req('PUT', '/api/profile', { token, body: { meta: { alloy: 777 }, cfg: {}, updated: Date.now() } });
  prof.json && prof.json.ok ? good('profile saved (777 alloy)') : bad('profile put: ' + JSON.stringify(prof.json));

  stopDeck();   /* SIGKILL — no graceful shutdown, no checkpoint */
  say('  ..   deck killed (SIGKILL). rebooting on the same data dir');
  bootDeck(dataDir);
  (await waitHealthy()) ? good('deck 2 up from the same ledger') : bad('deck 2 never came up');
  const me = await req('GET', '/api/me', { token });
  me.json && me.json.user && me.json.user.name === name
    ? good(`the cookie still authenticates after a SIGKILL — ${name} is still signed in`)
    : bad('post-restart me: ' + JSON.stringify(me.json).slice(0, 140));
  const meProf = await req('GET', '/api/profile/snaps', { token });
  Array.isArray(meProf.json && meProf.json.snaps) ? good('pilot data reachable with the old session') : bad('snaps: ' + JSON.stringify(meProf.json));

  say('── act 2: hygiene — an expired session is swept, a live one untouched');
  /* count the live pilot's rows first */
  const before = Number(nodeSql(dbPath, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(__DB__);
    process.stdout.write(String(db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c));
  `));
  /* seed one EXPIRED row for a fake token */
  const deadToken = sha256('dead-token-' + Math.random());
  nodeSql(dbPath, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(__DB__);
    db.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, 1, ?, ?)')
      .run(${JSON.stringify(deadToken)}, Date.now() - 40 * 86400000, Date.now() - 10 * 86400000);
    console.log('seeded');
  `);
  const withDead = Number(nodeSql(dbPath, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(__DB__);
    process.stdout.write(String(db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c));
  `));
  withDead === before + 1 ? good('expired row seeded (no sweep yet — the deck was up when it landed)') : bad('seed failed');
  stopDeck();
  bootDeck(dataDir);
  (await waitHealthy()) ? good('deck 3 up (the boot sweep has run)') : bad('deck 3 never came up');
  const expiredAfter = Number(nodeSql(dbPath, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(__DB__);
    process.stdout.write(String(db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE expires < ?').get(Date.now()).c));
  `));
  const totalAfter = Number(nodeSql(dbPath, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(__DB__);
    process.stdout.write(String(db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c));
  `));
  expiredAfter === 0 ? good('expired rows: zero after the boot sweep') : bad(`${expiredAfter} expired row(s) survived the sweep`);
  totalAfter === withDead - 1 ? good(`total rows ${withDead} → ${totalAfter}: exactly the dead row left; live rows untouched`) : bad(`total rows ${withDead} → ${totalAfter}`);
  const meStill = await req('GET', '/api/me', { token });
  meStill.json && meStill.json.user ? good('the live session still authenticates after the sweep') : bad('live session broken by the sweep');

  say('── act 3: logout still ends the story');
  const out = await req('POST', '/api/logout', { token });
  out.json && out.json.ok ? good('logout answered ok') : bad('logout: ' + JSON.stringify(out.json));
  const meOut = await req('GET', '/api/me', { token });
  !meOut.json || !meOut.json.user ? good('the logged-out cookie authenticates nothing') : bad('cookie survived logout');

  say(`── verdict: pass=${pass} fail=${fail}`);
  if (fail === 0) say('DRILL-SESSIONS: ALL GREEN');
  else say('DRILL-SESSIONS: FAILURES ABOVE');
}

main()
  .catch(e => { console.error('drill crashed:', e.message); fail++; })
  .finally(() => { stopDeck(); process.exit(fail === 0 ? 0 : 1); });
