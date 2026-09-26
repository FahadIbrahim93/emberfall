#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   testpilot-report.mjs — the real ledger, read-only.

   A census of the production deck's ledger for ops (block reports,
   pre-event checks, mirror verification). Opens the SQLite file
   READ-ONLY (node:sqlite readOnly) — this tool can never write a row,
   not even by accident, and never touches a running deck's API.

   Ledger location mirrors server.js: EF_DATA_DIR env, else the
   repo-sibling emberfall-data directory; override with --data <dir>.
   Note: live WAL data the deck has not checkpointed yet may lag a few
   seconds — run between flights or accept the tiny lag.

     node tools/testpilot-report.mjs

   Exit 0 = census printed · exit 1 = no ledger found at the location.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const argIdx = process.argv.indexOf('--data');
const dataDir = argIdx > -1 && process.argv[argIdx + 1]
  ? path.resolve(process.argv[argIdx + 1])
  : (process.env.EF_DATA_DIR ? path.resolve(process.env.EF_DATA_DIR) : path.join(ROOT, '..', 'emberfall-data'));
const dbPath = path.join(dataDir, 'emberfall.db');

if (!fs.existsSync(dbPath)) {
  console.error(`no ledger at ${dbPath} — pass --data <dir> or set EF_DATA_DIR`);
  process.exit(1);
}

/* node:sqlite opens the file READ-ONLY: no journal file, no write,
   no lock contention with a live deck */
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });

const one = q => Number(db.prepare(q).get().c);
const dayStr = ts => new Date(ts).toISOString().slice(0, 10);
const now = Date.now();

console.log(`── EMBERFALL ledger census — ${dbPath}`);
console.log(`   generated ${new Date().toISOString()}`);

const pilots = one('SELECT COUNT(*) AS c FROM users');
const sessions = one('SELECT COUNT(*) AS c FROM sessions');
const accepted = one(`SELECT COUNT(*) AS c FROM scores WHERE verdict = 'accepted'`);
const rejected = one(`SELECT COUNT(*) AS c FROM scores WHERE verdict <> 'accepted'`);
const duels = one('SELECT COUNT(*) AS c FROM challenges');
const beats = one('SELECT COUNT(*) AS c FROM beats');
const dailyRows = one('SELECT COUNT(*) AS c FROM daily_stats');
const wardenfallers = one('SELECT COUNT(DISTINCT user_id) AS c FROM daily_stats WHERE wardenfall = 1');
const wardenfallDays = one('SELECT COUNT(DISTINCT day) AS c FROM daily_stats WHERE wardenfall = 1');

console.log(`── pilots: ${pilots} registered · ${sessions} live sessions`);
console.log(`── runs:   ${accepted} accepted · ${rejected} rejected by anti-cheat`);
console.log(`── duels:  ${duels} issued · ${beats} beaten`);
console.log(`── dailies: ${dailyRows} pilot-days on record`);

const week = one('SELECT COUNT(DISTINCT user_id) AS c FROM scores WHERE created > ' + (now - 7 * 86400000));
const day = one('SELECT COUNT(DISTINCT user_id) AS c FROM scores WHERE created > ' + (now - 86400000));
console.log(`── active: ${day} pilots in 24h · ${week} in 7d`);

const span = db.prepare('SELECT MIN(created) AS lo, MAX(created) AS hi FROM scores').get();
if (span.lo) console.log(`── span:   ${dayStr(span.lo)} → ${dayStr(span.hi)}`);

const top = db.prepare(`SELECT u.name AS n, MAX(s.score) AS s FROM scores s
  JOIN users u ON u.id = s.user_id WHERE s.verdict = 'accepted'
  GROUP BY s.user_id ORDER BY s DESC LIMIT 5`).all();
if (top.length) {
  console.log('── top 5 (all modes):');
  for (const r of top) console.log(`   ${String(r.s).padStart(9)}  ${r.n}`);
}

const newest = db.prepare('SELECT name FROM users ORDER BY id DESC LIMIT 1').get();
if (newest) console.log(`── newest pilot: ${newest.name}`);

if (wardenfallers > 0) {
  console.log(`── Wardenfall: ${wardenfallers} pilot(s) hold the honor across ${wardenfallDays} rare day(s)`);
} else {
  console.log('── Wardenfall: no honor paid yet (next rare Sunday: see tools/wardenfall-check.mjs)');
}

const orphanScores = one(`SELECT COUNT(*) AS c FROM scores s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL`);
orphanScores === 0 ? console.log('── integrity: no orphan rows') : console.log(`── integrity: WARNING ${orphanScores} orphan score rows`);

/* the fun curve: how the game's own measured play trends release over
   release (same snapshot the README table renders) — best-effort, census
   must never fail for it */
try {
  const { readFileSync } = await import('node:fs');
  const curvePath = path.join(__dirname, '..', 'docs', 'audit', 'fun-curve.json');
  const curve = JSON.parse(readFileSync(curvePath, 'utf8'));
  const pts = (curve.points || []).slice(0, 3);
  if (pts.length) {
    console.log('── fun curve (56s bot probe, newest first):');
    for (const p of pts) {
      const l = p.loop || {};
      console.log(`   v${p.version}: wave ${l.wave ?? '—'} · kills ${l.kills ?? '—'} · grazes ${l.grazes ?? '—'} · median fps ${l.medianFps ?? '—'}`);
    }
  }
} catch { /* no snapshot yet — fine */ }

console.log('TESTPILOT-REPORT: READ-ONLY CENSUS OK');
db.close();
