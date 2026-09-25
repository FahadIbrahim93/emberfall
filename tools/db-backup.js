#!/usr/bin/env node
/**
 * db-backup — online, consistent backups of the command deck's SQLite store.
 *
 *   node tools/db-backup.js [--out DIR] [--keep N] [--verify]
 *
 * Reads the same data dir as server.js (EF_DATA_DIR, default the repo-
 * sibling emberfall-data) and writes timestamped, WAL-consistent snapshots
 * via node:sqlite's backup API — safe against a LIVE deck, no stop
 * required. Default out dir is <repo>/backups/ and it is GIT-IGNORED on
 * purpose: a snapshot is the user table (scrypt password hashes, session-
 * token hashes, every run) — committing one once leaked the real ledger
 * to the repo (caught 2026-09-26, v4.19.0 follow-up). For machine-loss
 * durability point --out at a directory OUTSIDE the repo that you back up
 * by other means. Old snapshots beyond --keep (default 14) are pruned.
 *
 *   --verify   open the fresh snapshot read-only and prove it is a real
 *              database with the expected tables — a backup that was never
 *              validated is not a backup.
 *
 * Ops: run daily (cron/Task Scheduler) with --verify; commit a snapshot
 * when it matters. Restore = stop deck, copy the wanted backup over
 * emberfall.db (drop -wal/-shm), start deck.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
/* mirror server.js's resolution exactly — the two must never disagree */
const DATA_DIR = process.env.EF_DATA_DIR
  ? path.resolve(process.env.EF_DATA_DIR)
  : path.join(path.dirname(ROOT), 'emberfall-data');   /* same default as server.js — 'state' never existed and the mismatch once made this tool back up NOTHING while claiming success (caught live, 2026-09-25) */
const src = path.join(DATA_DIR, 'emberfall.db');

let out = path.join(ROOT, 'backups');
let keep = 14;
let verify = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = path.resolve(argv[++i]);
  else if (argv[i] === '--keep') keep = Math.max(1, Math.floor(Number(argv[++i]) || 14));
  else if (argv[i] === '--verify') verify = true;
  else { console.error('db-backup: unknown argument ' + argv[i]); process.exit(2); }
}
if (!fs.existsSync(src)) {
  console.error('db-backup: no database at ' + src);
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dst = path.join(out, 'emberfall-' + stamp + '.db');

/* node:sqlite backup: live-consistent snapshot, WAL-aware, no deck stop.
   Signature is backup(sourceDbHandle, destinationPath) — a path is rejected.
   The source handle is READ-ONLY (minimal privilege) and that is proven safe:
   against a live WAL-mode deck a readonly connection reads the -wal sidecar
   and the snapshot carries every committed row (tested: register a pilot on
   a running deck, back up through a readonly handle, query the snapshot). */
let srcDb;
try { srcDb = new DatabaseSync(src, { readOnly: true }); }
catch (e) { console.error('db-backup: cannot open source: ' + e.message); process.exit(1); }
backup(srcDb, dst).then(() => {
  const bytes = fs.statSync(dst).size;
  const olds = fs.readdirSync(out).filter(f => /^emberfall-\d{4}-.*\.db$/.test(f)).sort();
  const doomed = olds.slice(0, Math.max(0, olds.length - keep));
  for (const f of doomed) fs.rmSync(path.join(out, f));
  console.log('db-backup: ' + dst + ' (' + bytes + ' bytes, kept ' + (olds.length - doomed.length) + ')');
  try { srcDb.close(); } catch (e2) { /* best effort */ }
  if (!verify) { for (const ext of ['-wal', '-shm']) { try { fs.rmSync(dst + ext); } catch (e3) { /* absent */ } } return; }
  const db = new DatabaseSync(dst, { readOnly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  db.close();
  /* the verify open runs WAL itself and drops sidecars — sweep them last */
  for (const ext of ['-wal', '-shm']) { try { fs.rmSync(dst + ext); } catch (e3) { /* absent */ } }
  const want = ['scores', 'users'];
  const missing = want.filter(t => !tables.includes(t));
  if (missing.length) {
    console.error('db-backup --verify FAILED: snapshot missing tables: ' + missing.join(', '));
    process.exit(1);
  }
  console.log('db-backup --verify: OK (' + tables.length + ' tables: ' + tables.join(', ') + ')');
}).catch(e => {
  try { srcDb.close(); } catch (e2) { /* best effort */ }
  console.error('db-backup failed: ' + e.message);
  try { fs.rmSync(dst); } catch (e2) { /* best effort */ }
  process.exit(1);
});
