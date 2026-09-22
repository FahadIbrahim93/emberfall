#!/usr/bin/env node
/* profile-deck — seed a synthetic load into a scratch deck database, then
 * measure the board and daily_stats queries under that load.
 *
 *   node tools/profile-deck.js [--rows N] [--days N] [--users N]
 *
 * Nothing here touches a production data dir: the caller sets EF_DATA_DIR to
 * a scratch directory. The deck must NOT be running against it (we write
 * directly to the SQLite file, then time queries the way the handlers run
 * them).
 */
'use strict';
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.EF_DATA_DIR ? path.resolve(process.env.EF_DATA_DIR) : path.join(ROOT, 'state');
const src = path.join(DATA_DIR, 'emberfall.db');

let days = 120, users = 40, dbArg = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--days') days = Math.max(1, Number(argv[++i]) || days);
  else if (argv[i] === '--users') users = Math.max(1, Number(argv[++i]) || users);
  else if (argv[i] === '--db') dbArg = argv[++i];
}

/* seeded load rows are destructive to a real deck — this tool only ever
   runs against a database handed to it explicitly via --db */
if (!dbArg) {
  console.error('profile-deck: usage — node tools/profile-deck.js --db <scratch emberfall.db> [--users N] [--days N]');
  process.exit(2);
}
const db = new DatabaseSync(dbArg);
const today = new Date().toISOString().slice(0, 10);
/* idempotent seeding: a scratch db from a previous run must not collide */
db.prepare("DELETE FROM daily_stats WHERE user_id IN (SELECT id FROM users WHERE name LIKE 'load%')").run();
db.prepare("DELETE FROM users WHERE name LIKE 'load%'").run();
const dayOf = n => new Date(Date.parse(today + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);

console.log('seeding ' + users + ' users × ' + days + ' days = ' + (users * days) + ' daily_stats rows…');
db.exec('BEGIN');
for (let u = 1; u <= users; u++) {
  /* users.id is AUTOINCREMENT — the delete/reseed above means ids skip, so
     capture the real id instead of assuming it equals u */
  const uid = Number(db.prepare('INSERT INTO users (name, name_lower, salt, hash, created, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
    .run('load' + u, 'load' + u, 's', 'h', 1700000000000, 1700000000000).lastInsertRowid);
  for (let d = 0; d < days; d++) {
    db.prepare(`INSERT INTO daily_stats (user_id, day, created_day, best_score, best_wave, paid, streak)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(uid, dayOf(d), dayOf(d), 1000 + ((u * 37 + d * 13) % 90000), 3 + (d % 22), (d % 4) * 120, 1 + (d % 9));
  }
}
db.exec('COMMIT');

const iters = 200;
const timed = (label, fn) => {
  fn(); // warm
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / iters;
  console.log('  ' + label + ': ' + ms.toFixed(3) + ' ms/op');
};

console.log('\n── query timings (' + iters + ' iters each)');

console.log(' dailyStreak walk (deepest chain, day-1 user):');
timed('streak walk', () => {
  const have = new Set(db.prepare('SELECT day FROM daily_stats WHERE user_id = ? ORDER BY day DESC').all(1).map(r => r.day));
  let n = 0;
  while (have.has(dayOf(n + 1))) n++;
  return n + 1;
});

console.log(' medal ledger for the day board (md map):');
timed('md map query', () => db.prepare(`SELECT u.name AS n, ds.best_score AS bs, ds.best_wave AS bw
    FROM daily_stats ds JOIN users u ON u.id = ds.user_id
    WHERE ds.day = ? AND u.name IN (?)`).all(today, 'load1'));

console.log(' weekly flew-days count (per /api/me):');
const ws = Date.now() - 3 * 86400000;
timed('weekDays count', () =>
  db.prepare('SELECT COUNT(*) AS n FROM daily_stats WHERE user_id = ? AND created_day >= ?').get(1, ws));

console.log(' day-board top10 (windowed, scores table):');
const lo = Date.parse(today + 'T00:00:00.000Z'), hi = Date.parse(today + 'T23:59:59.999Z');
timed('top10 windowed', () => db.prepare(`SELECT u.name AS n, MAX(s.score) AS s
  FROM scores s JOIN users u ON u.id = s.user_id
  WHERE s.mode = ? AND s.verdict = 'accepted' AND s.created >= ? AND s.created <= ?
  GROUP BY s.user_id ORDER BY s DESC LIMIT 10`).all('daily', lo, hi));

console.log('\n── plan check: streak-walk query');
const plan = db.prepare('EXPLAIN QUERY PLAN SELECT day FROM daily_stats WHERE user_id = 1 ORDER BY day DESC').all();
console.log('  ' + plan.map(p => p.detail).join(' | '));

console.log('\nreport: ' + (users * days) + ' daily_stats rows, ' + users + ' users');
db.close();
