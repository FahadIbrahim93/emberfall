#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   monday-digest.mjs — one page the maker reads every Monday.

   Everything the signal releases (v4.24 "Signal", v4.25 "Listening Deck")
   was built to be READ here: the fun curve, the recruiting funnel, the
   pilot notes, the deck's state, the next rare Sundays. Reads only
   committed artifacts and the deck ledger (read-only) — nothing plays,
   posts or mutates. A digest is never red: missing sources degrade to
   honest dashes, not exit codes.

     node tools/monday-digest.mjs [--db <path>]

   Exit 0 always (except catastrophic unreadable args → 1).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const dbIdx = argv.indexOf('--db');

function defaultDb() {
  if (process.env.EF_DATA_DIR) return path.join(process.env.EF_DATA_DIR, 'emberfall.db');
  const live = 'G:/emberfall/.freebuff/deck-live/emberfall.db';
  if (fs.existsSync(live)) return live;
  return path.join(os.homedir(), 'emberfall-data', 'emberfall.db');
}
const dbPath = dbIdx > -1 ? argv[dbIdx + 1] : defaultDb();

const line = '────────────────────────────────────────────────';
const DASH = '—';
console.log('EMBERFALL — Monday digest · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
console.log(line);

/* ── 1. the fun curve: is the game getting better? ─────────────────────── */
try {
  const curve = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'audit', 'fun-curve.json'), 'utf8'));
  const pts = curve.points.slice(0, 3);
  console.log('THE FUN CURVE (bot-probed per release, newest first)');
  const prev = pts[1];
  for (const p of pts) {
    const l = p.loop || {};
    const delta = prev && p.version === pts[0].version && l.kills != null && (prev.loop || {}).kills != null
      ? ' (kills ' + (l.kills >= prev.loop.kills ? '+' : '') + (l.kills - prev.loop.kills) + ' vs prev release)' : '';
    console.log('  v' + p.version + ' "' + (p.codename || '') + '" — wave ' + (l.wave ?? DASH) + ' · kills ' + (l.kills ?? DASH) +
      ' · grazes ' + (l.grazes ?? DASH) + ' · ×' + (l.mult ?? 1) + ' · ' + (l.medianFps ?? DASH) + ' fps' + delta);
  }
} catch { console.log('THE FUN CURVE — no committed curve yet'); }
console.log(line);

/* ── 2. the recruiting funnel: where do they go? ───────────────────────── */
console.log('THE FUNNEL (unique devices, last 7 days)');
try {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT day, stage, COUNT(DISTINCT iph) AS d FROM funnel_events
                           WHERE day >= ? GROUP BY day, stage ORDER BY day DESC, stage`).all(since);
  if (!rows.length) console.log('  no funnel rows yet — the instruments wait in silence');
  const byDay = {};
  for (const r of rows) (byDay[r.day] = byDay[r.day] || {})[r.stage] = r.d;
  for (const [day, stages] of Object.entries(byDay)) {
    const boot = stages.boot || 0;
    const pct = n => boot ? Math.round(100 * n / boot) + '%' : DASH;
    console.log('  ' + day + '  boot ' + boot + ' → armed ' + (stages.armed || 0) + ' (' + pct(stages.armed || 0) + ')' +
      ' → first kill ' + (stages.k1 || 0) + ' (' + pct(stages.k1 || 0) + ')' +
      ' → wave 5 ' + (stages.w5 || 0) + ' (' + pct(stages.w5 || 0) + ')');
  }
  const fb7 = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE created >= ?').get(Date.now() - 7 * 86400000).n;
  const pilots = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  console.log('  pilot notes this week: ' + fb7 + ' · registered pilots all-time: ' + pilots);
  db.close();
} catch (e) {
  console.log('  ledger unreadable at ' + dbPath + ' (' + e.message.slice(0, 60) + ')');
}
console.log(line);

/* ── 3. the notes: what are they telling me? ───────────────────────────── */
console.log('PILOT NOTES (newest first)');
try {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const notes = db.prepare(`SELECT f.id, f.text, f.wave, f.ship, f.created, u.name AS pilot
                            FROM feedback f LEFT JOIN users u ON u.id = f.user_id
                            ORDER BY f.id DESC LIMIT 5`).all();
  if (!notes.length) console.log('  none yet');
  for (const x of notes) {
    const who = x.pilot ? ' [' + x.pilot + ']' : '';
    console.log('  #' + x.id + who + ' (wave ' + x.wave + ') ' + x.text.replace(/\s+/g, ' ').slice(0, 150));
  }
  db.close();
} catch { /* already reported above */ }
console.log(line);

/* ── 4. the calendar: next rare Sundays ────────────────────────────────── */
/* FNV-1a over 'warden-<day>' — the same verdict machine server.js uses. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const nextRare = [];
for (let i = 1; nextRare.length < 2 && i < 90; i++) {
  const day = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
  /* the deck's dow convention: Monday = 0 … Sunday = 6 (server.js dayDow).
     JS's getUTCDay() would call Saturday 6 — the bug this line once had,
     which named a Saturday as a rare SUNDAY. */
  const dow = (Date.parse(day + 'T00:00:00.000Z') / 86400000 + 3) % 7;
  if (dow === 6 && fnv1a('warden-' + day) % 7 === 0) nextRare.push(day);
}
console.log('THE CALENDAR');
console.log('  next Wardenfall Sundays: ' + (nextRare.join(', ') || DASH) +
  ' · the runbook: docs/runbooks/wardenfall-' + (nextRare[0] || 'next') + '.md');
console.log('  the two user-side levers still open: Fly.io deploy (docs/DEPLOYMENT.md),');
console.log('  Supabase service-key secret (the public mirror stays empty without it)');
console.log(line);
console.log('Read-only digest — nothing here played, posted or mutated.');
