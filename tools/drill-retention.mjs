#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-retention.mjs — dead ghosts never pile up.

   A duel is only flyable on its own day, so stale challenge rows (with
   their embedded ghost payloads) are dead weight. This drill proves the
   v4.15.1 retention sweep on ONE shared data dir across FOUR sequential
   deck boots, asserting SURVIVAL directly in SQLite (the inbox API is
   day-scoped to today by design — it can never show stale rows):

     deck 1 (real clock)    — the 10-day-old duel is pruned at boot; the
                              2-day-old duel and a same-day API-created
                              duel survive; the inbox serves the duel it
                              created for today;
     deck 2 (pinned 09-27)  — a 09-18 duel is pruned (pinned cutoff 09-20):
                              the cutoff follows the rehearsal clock;
     deck 3 (pinned 09-25)  — the 09-18 duel SURVIVES (cutoff 09-18,
                              strictly `<`): the boundary is honest;
     deck 4 (pinned 09-27, 14d window) — it survives again: the env tunes
                              the window.

   Also proves the day-clock unification the drill itself caught: on a
   pinned deck, a duel created for the PINNED day is accepted and served
   by the inbox (create + inbox read the same deckDayOf clock).
   Exit 0 = retention proven · exit 1 = any ghost lied about.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.RT_PORT || 8161;
const BASE = 'http://127.0.0.1:' + PORT;
const HDR = { 'Content-Type': 'application/json', 'x-emberfall': 'command-deck' };
let pass = 0, fail = 0, child = null;
const say  = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad  = m => { fail++; say('  FAIL-', m); };
const dayStr = ts => new Date(ts).toISOString().slice(0, 10);

async function req(method, p, { token, body } = {}) {
  const headers = { ...HDR };
  if (token) headers.Cookie = 'EF_SESSION=' + token;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
const tokenOf = sc => { const m = /EF_SESSION=([^;\r]+)/.exec(sc || ''); return m ? m[1] : null; };

async function bootDeck(dataDir, pinnedDay, retentionDays) {
  const env = { ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir };
  if (pinnedDay) env.EF_DECK_DAY = pinnedDay;
  if (retentionDays) env.EF_DUEL_RETENTION_DAYS = String(retentionDays);
  child = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/..', env, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const h = await req('GET', '/api/health'); if (h.json && h.json.ok) return h.json; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('deck never came up' + (pinnedDay ? ' (pinned ' + pinnedDay + ')' : ''));
}
async function stopDeck() {
  if (child) { try { child.kill(); } catch { /* gone */ } child = null; }
  await new Promise(r => setTimeout(r, 400));   /* WAL checkpoint grace */
}

/* direct SQLite helpers (a temp-file child keeps quoting sane) */
function nodeSql(dbPath, code) {
  const tmp = path.join(os.tmpdir(), 'ef-ret-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.js');
  fs.writeFileSync(tmp, code.replaceAll('__DB__', JSON.stringify(dbPath)));
  try { return execFileSync(process.execPath, [tmp], { stdio: 'pipe', encoding: 'utf8' }).trim(); }
  finally { fs.rmSync(tmp, { force: true }); }
}
function seedDuel(dbPath, fromName, toName, day, score) {
  nodeSql(dbPath, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(__DB__);
    const f = db.prepare('SELECT id FROM users WHERE name = ?').get(${JSON.stringify(fromName)});
    if (!f) { console.error('challenger missing'); process.exit(1); }
    db.prepare('INSERT INTO challenges (from_id, to_name, day, score, wave, ship, ghost, created) VALUES (?, ?, ?, ?, 4, ?, ?, ?)')
      .run(f.id, ${JSON.stringify(toName)}, ${JSON.stringify(day)}, ${score}, 'vesper', JSON.stringify({ frames: [[0, 0, 0]] }), Date.now());
    console.log('seeded');
  `);
}
function countDuels(dbPath, day) {
  return Number(nodeSql(dbPath, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(__DB__);
    process.stdout.write(String(db.prepare('SELECT COUNT(*) AS c FROM challenges WHERE day = ?').get(${JSON.stringify(day)}).c));
  `));
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-retention-'));
  const dbPath = path.join(dataDir, 'emberfall.db');
  const today = dayStr(Date.now());
  const ancient = dayStr(Date.now() - 10 * 86400000);
  const recent = dayStr(Date.now() - 2 * 86400000);
  const mid = '2026-09-18';   /* between the real and pinned cutoffs */

  say('── pilots on deck 1 (real clock)');
  const A = 'RtA' + Math.random().toString(36).slice(2, 7);
  const B = 'RtB' + Math.random().toString(36).slice(2, 7);
  await bootDeck(dataDir, null);
  for (const [name, pw] of [[A, 'retention-pass'], [B, 'retention-pass']]) {
    const r = await req('POST', '/api/register', { body: { name, password: pw } });
    if (!(r.json && r.json.ok)) { bad(name + ' register: ' + JSON.stringify(r.json)); return; }
  }
  const login = await req('POST', '/api/login', { body: { name: B, password: 'retention-pass' } });
  const tokB = tokenOf(login.setCookie);
  if (!tokB) { bad('B login failed'); return; }
  const loginA = await req('POST', '/api/login', { body: { name: A, password: 'retention-pass' } });
  const tokA = tokenOf(loginA.setCookie);
  if (!tokA) { bad('A login failed'); return; }
  const created = await req('POST', '/api/challenges', { token: tokB, body: { to: A, day: today, score: 5200, wave: 4, ship: 'vesper', ghost: { frames: [[0, 0, 0]] }, paint: 'yard' } });
  created.json && created.json.id ? good('today duel created via the real API') : bad('create: ' + JSON.stringify(created.json));
  const inboxA = await req('GET', '/api/challenges', { token: tokA });
  (inboxA.json && inboxA.json.list || []).some(c => c.day === today)
    ? good('the inbox serves the duel it created for today')
    : bad('inbox: ' + JSON.stringify(inboxA.json));
  await stopDeck();

  say('── deck 1 (real clock): the boot sweep sheds the ancient ghost');
  seedDuel(dbPath, B, A, ancient, 5100);
  seedDuel(dbPath, B, A, recent, 5300);
  await bootDeck(dataDir, null);
  countDuels(dbPath, ancient) === 0 ? good(`the ${ancient} duel was pruned at boot`) : bad('the ancient duel survived: retention is a lie');
  countDuels(dbPath, recent) === 1 ? good(`the ${recent} duel survives inside the window`) : bad('the in-window duel was pruned');
  countDuels(dbPath, today) === 1 ? good("today's duel survives") : bad("today's duel was pruned");
  await stopDeck();

  say('── deck 2 (EF_DECK_DAY=2026-09-27): the cutoff follows the rehearsal clock');
  seedDuel(dbPath, B, A, mid, 5400);
  await bootDeck(dataDir, '2026-09-27');
  countDuels(dbPath, mid) === 0 ? good(`a ${mid} duel is past the PINNED window (cutoff 09-20) — pruned`) : bad('the pinned deck kept a pre-window duel');
  await stopDeck();

  say('── deck 3 (EF_DECK_DAY=2026-09-25): the boundary is strictly `<`');
  seedDuel(dbPath, B, A, mid, 5400);
  await bootDeck(dataDir, '2026-09-25');
  countDuels(dbPath, mid) === 1 ? good(`the ${mid} duel survives when the pinned cutoff IS ${mid}`) : bad('the boundary pruned an on-cutoff duel');
  await stopDeck();

  say('── deck 4 (EF_DECK_DAY=2026-09-27, 14-day window): the env tunes the window');
  seedDuel(dbPath, B, A, mid, 5400);   /* deck 3's survivor is still there — two rows expected */
  await bootDeck(dataDir, '2026-09-27', 14);
  countDuels(dbPath, mid) === 2 ? good('a 14-day window keeps both duels the 7-day window pruned') : bad('the env window was ignored');
  await stopDeck();

  say('── the day-clock unification (caught by this drill): a pinned deck flies duels on the pinned day');
  await bootDeck(dataDir, '2026-09-27');
  const lp = await req('POST', '/api/login', { body: { name: B, password: 'retention-pass' } });
  const tokB2 = tokenOf(lp.setCookie);
  if (!tokB2) bad('B login on pinned deck failed');
  else {
    const created2 = await req('POST', '/api/challenges', { token: tokB2, body: { to: A, day: '2026-09-27', score: 5600, wave: 4, ship: 'vesper', ghost: { frames: [[0, 0, 0]] }, paint: 'yard' } });
    created2.json && created2.json.id ? good('a duel for the PINNED day is accepted on a pinned deck') : bad('pinned create: ' + JSON.stringify(created2.json));
    const lp2 = await req('POST', '/api/login', { body: { name: A, password: 'retention-pass' } });
    const tokA2 = tokenOf(lp2.setCookie);
    const inbox2 = await req('GET', '/api/challenges', { token: tokA2 });
    (inbox2.json && inbox2.json.list || []).some(c => c.day === '2026-09-27')
      ? good('the pinned inbox serves the pinned day — create, inbox and retention are one clock')
      : bad('pinned inbox: ' + JSON.stringify(inbox2.json));
  }
  await stopDeck();

  say(`── verdict: pass=${pass} fail=${fail}`);
  if (fail === 0) say('DRILL-RETENTION: ALL GREEN');
  else say('DRILL-RETENTION: FAILURES ABOVE');
}

main()
  .catch(e => { console.error('drill crashed:', e.message); fail++; })
  .finally(async () => { await stopDeck(); process.exit(fail === 0 ? 0 : 1); });
