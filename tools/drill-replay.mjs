#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-replay.mjs — the 24h anti-cheat window, executable.

   server.js computes runHash = sha256(userId|mode|score|wave|kills|
   round(runT*10)|cps.length|cps[last][4]) (truncated 32 hex) and refuses
   a score whose hash already landed from the SAME pilot inside 24h
   (isReplay → 422 "replay of an identical run"). The drill pins the whole
   contract on ONE scratch deck (scratch EF_DATA_DIR, port 8181):

     scores lane — the same arc twice → the 2nd 422s;
                   the same arc from a DIFFERENT pilot → accepted (the
                   guard is per-pilot, never global);
                   a one-point variant → accepted (no false positive);
     the window  — the first row backdated 25h in SQLite → the identical
                   arc is accepted again and a NEW row lands (the window
                   genuinely expires, it does not just ignore);
     beats lane  — an identical beat arc re-flown on the same duel is
                   swallowed by the (challenge_id, user_id) PRIMARY KEY
                   (rows stay at 1 — no double count), while the SAME arc
                   on a second duel lands (hashes are 'duel:'+id scoped,
                   never cross-firing into scores).

   The drill mirrors runHash locally from the server's exact recipe and
   reads the pilot's numeric id from the scratch DB — submissions carry
   hashes the deck itself would compute.

   RUNS ITS OWN DECK. CI: one step after drill-retention. Local:
   node tools/drill-replay.mjs. Exit 0 = the window is honest · exit 1 =
   a replay slipped through or an honest run was refused.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.RP_PORT || 8181;
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

/* honest telemetry arc — must clear verifyRun so a 422 can only mean the
   replay guard fired (same shape drill-limiters flies) */
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

/* the server's exact recipe (server.js runHash) — userId, mode, score,
   wave, kills, round(runT*10), cps.length, round(cps[last][4]) */
function runHash(userId, mode, score, wave, kills, runT, cps) {
  const h = crypto.createHash('sha256');
  h.update(userId + '|' + mode + '|' + score + '|' + wave + '|' + kills + '|' +
    Math.round((runT || 0) * 10) + '|' + cps.length + '|' +
    (cps.length ? Math.round(cps[cps.length - 1][4]) : 0));
  return h.digest('hex').slice(0, 32);
}

/* direct SQLite helpers (a temp-file child keeps quoting sane) */
function nodeSql(dbPath, code) {
  const tmp = path.join(os.tmpdir(), 'ef-replay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.js');
  fs.writeFileSync(tmp, code.replaceAll('__DB__', JSON.stringify(dbPath)));
  try { return execFileSync(process.execPath, [tmp], { stdio: 'pipe', encoding: 'utf8' }).trim(); }
  finally { fs.rmSync(tmp, { force: true }); }
}
const userIdOf = (dbPath, name) => Number(nodeSql(dbPath, `
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(__DB__);
  process.stdout.write(String(db.prepare('SELECT id FROM users WHERE name = ?').get(${JSON.stringify(name)}).id));
`));
const scoreRowsWithHash = (dbPath, hash) => Number(nodeSql(dbPath, `
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(__DB__);
  process.stdout.write(String(db.prepare('SELECT COUNT(*) AS c FROM scores WHERE run_hash = ?').get(${JSON.stringify(hash)}).c));
`));
const beatRows = dbPath => Number(nodeSql(dbPath, `
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(__DB__);
  process.stdout.write(String(db.prepare('SELECT COUNT(*) AS c FROM beats').get().c));
`));
const backdateHash = (dbPath, hash, ms) => nodeSql(dbPath, `
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(__DB__);
  db.prepare('UPDATE scores SET created = created - ? WHERE run_hash = ?').run(${ms}, ${JSON.stringify(hash)});
  process.stdout.write('backdated');
`);

async function bootDeck(dataDir) {
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir },
    stdio: 'ignore'
  });
  for (let i = 0; i < 40; i++) {
    try { const h = await req('GET', '/api/health'); if (h.json && h.json.ok) return; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('deck never came up');
}
async function stopDeck() {
  if (child) { try { child.kill(); } catch { /* gone */ } child = null; }
  await new Promise(r => setTimeout(r, 400));   /* WAL checkpoint grace */
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-replay-'));
  const dbPath = path.join(dataDir, 'emberfall.db');
  say(`── booting a scratch deck on :${PORT} (${dataDir})`);
  await bootDeck(dataDir);
  good('scratch deck healthy');

  /* pilots: RpMain flies the arcs, RpTwin re-flies the SAME arc, RpHost
     issues the duels */
  say('── pilots');
  const pilots = ['RpMain', 'RpTwin', 'RpHost'];
  for (const name of pilots) {
    const r = await req('POST', '/api/register', { body: { name, password: 'replay-pass' } });
    r.status === 200 ? good(`${name} registered`) : bad(`${name} register: ${r.status} ${JSON.stringify(r.json)}`);
  }
  const tok = {};
  for (const name of pilots) {
    const r = await req('POST', '/api/login', { body: { name, password: 'replay-pass' } });
    const t = tokenOf(r.setCookie);
    t ? tok[name] = t : bad(`${name} login: ${r.status}`);
  }
  if (!tok.RpMain || !tok.RpTwin || !tok.RpHost) return;
  const uidMain = userIdOf(dbPath, 'RpMain');
  const uidTwin = userIdOf(dbPath, 'RpTwin');
  uidMain > 0 && uidTwin > 0 ? good(`ids read from the scratch ledger (main=${uidMain}, twin=${uidTwin})`)
                             : bad('could not read pilot ids from the scratch DB');
  if (!(uidMain > 0 && uidTwin > 0)) return;

  const MODE = 'daily', WAVE = 16, SCORE = 40200, RUNT = 960, KILLS = 700, DIFF = 2;
  const fly = (t, score) => req('POST', '/api/scores', {
    token: t,
    body: { mode: MODE, score, wave: WAVE, diff: DIFF, ship: 'vesper', runT: RUNT, kills: KILLS, cps: arc(WAVE, score, RUNT, KILLS) }
  });
  const h1 = runHash(uidMain, MODE, SCORE, WAVE, KILLS, RUNT, arc(WAVE, SCORE, RUNT, KILLS));
  const h2 = runHash(uidTwin, MODE, SCORE, WAVE, KILLS, RUNT, arc(WAVE, SCORE, RUNT, KILLS));
  h1 !== h2 ? good(`hashes are per-pilot by construction (${h1.slice(0, 8)}… vs ${h2.slice(0, 8)}…)`)
            : bad('the twin hash collided with the main hash — recipe is not per-pilot');

  say('── scores lane: the same arc twice');
  const first = await fly(tok.RpMain, SCORE);
  first.status === 200 && first.json && first.json.ok
    ? good(`first flight of the arc accepted (${h1.slice(0, 8)}… stamped)`)
    : bad('first flight refused — nothing to guard yet: ' + first.status + ' ' + JSON.stringify(first.json));
  const twin = await fly(tok.RpTwin, SCORE);
  twin.status === 200 && twin.json && twin.json.ok
    ? good('the SAME arc from a DIFFERENT pilot is accepted (guard is per-pilot)')
    : bad('twin pilot refused for an identical arc: ' + twin.status + ' ' + JSON.stringify(twin.json));
  const replay = await fly(tok.RpMain, SCORE);
  replay.status === 422 && String((replay.json || {}).error || '').includes('replay')
    ? good('the SECOND flight by the SAME pilot 422s: "replay of an identical run"')
    : bad('replay slipped through or failed for the wrong reason: ' + replay.status + ' ' + JSON.stringify(replay.json));
  const variant = await fly(tok.RpMain, SCORE + 1);
  variant.status === 200 && variant.json && variant.json.ok
    ? good('a one-point variant is accepted (the guard never over-fires)')
    : bad('honest variant refused: ' + variant.status + ' ' + JSON.stringify(variant.json));
  scoreRowsWithHash(dbPath, h1) === 1 ? good('exactly one ledger row carries the replayed hash')
                                      : bad('the ledger shows ' + scoreRowsWithHash(dbPath, h1) + ' rows for the replayed hash');

  say('── the 24h window: 25h later the same arc flies again');
  backdateHash(dbPath, h1, 25 * 3600 * 1000);
  const expired = await fly(tok.RpMain, SCORE);
  expired.status === 200 && expired.json && expired.json.ok
    ? good('after 25h the identical arc is accepted again — the window genuinely expires')
    : bad('the window did not expire: ' + expired.status + ' ' + JSON.stringify(expired.json));
  scoreRowsWithHash(dbPath, h1) === 2 ? good('the expired re-flight landed as a NEW ledger row (count=2)')
                                      : bad('expected 2 rows for the hash after expiry, found ' + scoreRowsWithHash(dbPath, h1));

  say('── beats lane: duel-scoped hashes, PK-honest dedupe');
  const today = new Date().toISOString().slice(0, 10);
  const frames = []; for (let i = 0; i < 120; i++) frames.push([i * 16, Math.round(Math.sin(i / 6) * 120), Math.round(Math.cos(i / 9) * 90)]);
  const mkDuel = async (score) => {
    const c = await req('POST', '/api/challenges', { token: tok.RpHost, body: { to: 'RpMain', day: today, score, wave: 4, ship: 'vesper', ghost: { frames }, paint: 'yard' } });
    return (c.json && c.json.id) || null;
  };
  const duel1 = await mkDuel(5200);
  const duel2 = await mkDuel(5300);
  duel1 && duel2 ? good('two duels issued to RpMain') : bad('duel creation failed: ' + JSON.stringify([duel1, duel2]));
  if (!duel1 || !duel2) return;
  const before = beatRows(dbPath);
  const beat = (cid, t) => req('POST', '/api/challenges/beat', {
    token: t,
    body: { id: cid, score: 6400, wave: 6, diff: 2, runT: 310, kills: 220, cps: arc(6, 6400, 310, 220) }
  });
  const b1 = await beat(duel1, tok.RpMain);
  b1.status === 200 && b1.json && b1.json.ok && b1.json.beaten
    ? good('duel 1 beaten honestly')
    : bad('duel 1 beat: ' + b1.status + ' ' + JSON.stringify(b1.json));
  const b1again = await beat(duel1, tok.RpMain);
  beatRows(dbPath) === before + 1 && b1again.status === 200
    ? good('re-beating duel 1 with the identical arc is swallowed by the PK — still ONE row, no double count')
    : bad(`re-beat: status ${b1again.status}, beats rows ${beatRows(dbPath)} (expected ${before + 1})`);
  const b2 = await beat(duel2, tok.RpMain);
  beatRows(dbPath) === before + 2 && b2.status === 200 && b2.json && b2.json.ok
    ? good('the SAME beat arc on duel 2 lands — hashes are duel-scoped, no false replay across duels')
    : bad(`duel 2 beat: status ${b2.status}, beats rows ${beatRows(dbPath)} (expected ${before + 2})`);
  const hashes = nodeSql(dbPath, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(__DB__);
    const rows = db.prepare('SELECT run_hash FROM beats WHERE run_hash IS NOT NULL').all();
    process.stdout.write(rows.map(r => r.run_hash).join(','));
  `).split(',').filter(Boolean);
  hashes.length === 2 && hashes.every(hh => /^[0-9a-f]{32}$/.test(hh)) && hashes[0] !== hashes[1]
    ? good('both beats carry distinct 32-hex run_hash stamps')
    : bad('beat hash stamps wrong: ' + JSON.stringify(hashes));

  say(`── verdict: pass=${pass} fail=${fail}`);
  if (fail === 0) say('DRILL-REPLAY: ALL GREEN');
  else say('DRILL-REPLAY: FAILURES ABOVE');
}

main()
  .catch(e => { console.error('drill crashed:', e.message); fail++; })
  .finally(async () => { await stopDeck(); process.exit(fail === 0 ? 0 : 1); });
