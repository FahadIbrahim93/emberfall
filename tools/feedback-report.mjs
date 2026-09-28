#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   feedback-report.mjs — read the pilot notes the game collected.

   READ-ONLY over the deck's SQLite ledger (same access rules as
   testpilot-report). Prints volume, crude theme buckets (keyword matches,
   honest about being crude), and the newest notes with their flight shape.
   A pilot name appears only when the author was signed in — that was their
   choice; there is nothing else in the table to leak.

     node tools/feedback-report.mjs [--db <path>] [--n 20]

   Exit 0 = report printed (even when empty — "no notes yet" is a fact,
   not an error) · exit 1 = db missing/unreadable.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const argv = process.argv.slice(2);
const dbIdx = argv.indexOf('--db');
const nIdx = argv.indexOf('--n');
const SHOWN = nIdx > -1 ? Math.max(1, Number(argv[nIdx + 1]) || 20) : 20;

function defaultDb() {
  if (process.env.EF_DATA_DIR) return path.join(process.env.EF_DATA_DIR, 'emberfall.db');
  const live = 'G:/emberfall/.freebuff/deck-live/emberfall.db';
  if (fs.existsSync(live)) return live;
  return path.join(os.homedir(), 'emberfall-data', 'emberfall.db');
}
const dbPath = dbIdx > -1 ? argv[dbIdx + 1] : defaultDb();
if (!fs.existsSync(dbPath)) {
  console.error('feedback-report: no ledger at ' + dbPath + ' (pass --db <path>)');
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const total = db.prepare('SELECT COUNT(*) AS n FROM feedback').get().n;
const week = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE created >= ?').get(Date.now() - 7 * 86400000).n;
const signedIn = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id IS NOT NULL').get().n;

console.log('── pilot notes (' + dbPath + ')');
console.log('   total: ' + total + ' · last 7d: ' + week + ' · signed-in authors: ' + signedIn);

/* theme buckets: crude keyword grouping, labeled as such. A note can land
   in several; unmatched notes are shown raw, never squeezed into a box. */
const THEMES = [
  ['difficulty / unfair', /unfair|hard|difficult|impossible|cheap|frustrat|cornered|spawncamp|no chance/i],
  ['performance', /lag|fps|stutter|slow|jank|freeze|performance/i],
  ['controls / input', /control|touch|button|aim|keyboard|gamepad|steer|clumsy/i],
  ['confusion / teaching', /confus|no idea|what does|unclear|teach|tutorial|where is|how do/i],
  ['crash / bug', /crash|bug|broken|error|freeze.*game|kick/i],
  ['love', /love|fun|great|awesome|amazing|addict|nice|beautiful|chef|gorgeous/i],
];
const notes = db.prepare('SELECT f.id, f.text, f.ship, f.wave, f.mode, f.created, u.name AS pilot FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT ?').all(200);
if (notes.length) {
  console.log('\n── themes (keyword buckets, crude on purpose)');
  for (const [name, re] of THEMES) {
    const hit = notes.filter(x => re.test(x.text));
    if (hit.length) console.log('   ' + name + ': ' + hit.length);
  }
  const unmatched = notes.filter(x => !THEMES.some(([, re]) => re.test(x.text)));
  if (unmatched.length) console.log('   (unmatched, shown raw below): ' + unmatched.length);

  console.log('\n── newest ' + Math.min(SHOWN, notes.length) + ' notes');
  for (const x of notes.slice(0, SHOWN)) {
    const when = new Date(x.created).toISOString().slice(0, 16).replace('T', ' ');
    const flight = [x.ship, 'wave ' + x.wave, x.mode].filter(Boolean).join(' · ');
    const who = x.pilot ? ' [' + x.pilot + ']' : '';
    console.log('   #' + x.id + ' ' + when + who + ' (' + flight + ')');
    console.log('     ' + x.text.replace(/\s+/g, ' ').slice(0, 240));
  }
} else {
  console.log('\n   no notes yet — the widget on the game-over screen collects them');
}
db.close();
