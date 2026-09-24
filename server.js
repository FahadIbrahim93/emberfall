#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   EMBERFALL COMMAND DECK — self-hosted backend, zero dependencies.

   Node >= 22 only (uses node:http and the built-in node:sqlite).
   One process serves the game and the API from one origin, so the
   session cookie needs no CORS and the game keeps working offline:
   when the API is absent the client simply stays in local mode.

     node server.js            → http://localhost:8123
     PORT=9000 node server.js  → any port
     node server.js --port 9000

   Security posture (the boring, correct kind):
   - passwords: scrypt (N=16384) with per-user random salt, constant-time compare
   - sessions: 32 random bytes, only the SHA-256 is stored; HttpOnly,
     SameSite=Lax, Secure-in-production cookie; every mutating request must
     be same-origin JSON
   - input: every field validated and length-capped; SQL is 100% parameterized
   - rate limits: per-IP sliding windows on auth and score submission, keyed
     on the real client IP (honors TRUST_PROXY + X-Forwarded-For)
   - static files: explicit allowlist only — data/, server.js, .git/ 404
   - headers: nosniff, frame-deny, referrer policy, CSP on documents
   ══════════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 0)) || 8123;
const ROOT = __dirname;
/* server-side state lives OUTSIDE the served root by default. The DB holds
   scrypt password hashes and session-token hashes; serving it would hand the
   whole user table to anyone on the network. Override with EF_DATA_DIR
   (multi-deck isolation, containers); 'data/' still works if set explicitly. */
const DATA_DIR = process.env.EF_DATA_DIR
  ? path.resolve(process.env.EF_DATA_DIR)
  : path.join(path.dirname(ROOT), 'emberfall-data');
const DB_PATH = path.join(DATA_DIR, 'emberfall.db');
const IS_PROD = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

/* ─────────────────────────── database ─────────────────────────── */
fs.mkdirSync(DATA_DIR, { recursive: true });
/* one-time carry-over: decks predating the externalized data dir kept state
   at <repo>/data — move it so existing pilots, boards and duels survive.
   Best-effort by design: checkpoint the WAL first (no lost tail), rename when
   the volumes allow it, copy across devices, and on any failure log loudly
   and start fresh — a migration must never take the deck down. */
const LEGACY_DB = path.join(ROOT, 'data', 'emberfall.db');
if (fs.existsSync(LEGACY_DB) && !fs.existsSync(DB_PATH)) {
  try {
    const legacy = new DatabaseSync(LEGACY_DB);
    legacy.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    legacy.close();
    try { fs.renameSync(LEGACY_DB, DB_PATH); }
    catch (e) {                        /* EXDEV: state dir on another volume */
      fs.copyFileSync(LEGACY_DB, DB_PATH);
      fs.rmSync(LEGACY_DB);
    }
    for (const ext of ['-wal', '-shm']) {
      const side = LEGACY_DB + ext;
      if (fs.existsSync(side)) fs.rmSync(side);
    }
    try { fs.rmdirSync(path.join(ROOT, 'data')); } catch (e) { /* not empty — fine */ }
    console.log('[cmd-deck] migrated legacy data/emberfall.db → ' + DB_PATH);
  } catch (e) {
    console.error('[cmd-deck] legacy DB migration failed:', e.message,
      '— starting fresh at ' + DB_PATH);
  }
}
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
/* v4.9: brief write contention (a backup tool, a hung foreign writer) must
   self-heal instead of 500-ing. Proven live: an EXCLUSIVE lock held by
   another process used to surface as 'database is locked' → 500. 2s matches
   the per-user write windows; a lock held longer is a real ops incident. */
db.exec('PRAGMA busy_timeout = 2000');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  name_lower TEXT NOT NULL UNIQUE,
  salt       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  created    INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created    INTEGER NOT NULL,
  expires    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode    TEXT NOT NULL,
  score   INTEGER NOT NULL,
  wave    INTEGER NOT NULL,
  ship    TEXT NOT NULL,
  diff    INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_board ON scores(mode, score DESC);
CREATE TABLE IF NOT EXISTS profiles (
  user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data     TEXT NOT NULL,
  updated  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_snaps (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taken   INTEGER NOT NULL,
  data    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snaps_user ON profile_snaps(user_id, taken DESC);
CREATE TABLE IF NOT EXISTS daily_stats (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_wave  INTEGER NOT NULL DEFAULT 0,
  paid       INTEGER NOT NULL DEFAULT 0,
  streak     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
`);
/* v4.10 migration: daily_stats needs a comparable day column for week windows.
   Pure-UTC ISO strings sort lexicographically, so 'created_day' mirrors 'day'.
   Existing rows fill from 'day' — INSERT OR IGNORE keeps the backfill runnable
   on every boot until the schema is universal. */
addCol('daily_stats', 'created_day', "TEXT NOT NULL DEFAULT ''");
/* v4.13: Wardenfall honors need the RARE verdict at award time, not the
   verdict of today's clock — a run flown on a rare Sunday must be provable
   weeks later when the plaque renders. added TEXT day (ISO, mirrors day). */
addCol('daily_stats', 'wardenfall', "INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE INDEX IF NOT EXISTS idx_dstats_user_cday ON daily_stats(user_id, created_day)");
db.prepare("INSERT OR IGNORE INTO daily_stats (user_id, day, created_day, best_score, best_wave, paid, streak) " +
  "SELECT user_id, day, day, best_score, best_wave, paid, streak FROM daily_stats")
  .run();
/* v3.3 migrations — idempotent column adds */
function addCol(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}
addCol('scores', 'run_t', 'REAL');
addCol('scores', 'kills', 'INTEGER');
addCol('scores', 'telemetry', 'TEXT');
addCol('scores', 'verdict', 'TEXT DEFAULT \'accepted\'');
addCol('scores', 'run_hash', 'TEXT');
/* v4.2: opponent-visible personalization on the boards — the worn paint is
   a public fact of a run; mastery level rides along for the flex */
addCol('scores', 'paint', 'TEXT');
addCol('scores', 'mastery', 'INTEGER DEFAULT 0');
/* v4.3: duels show the challenger's paint on the entry row. Allowlist —
   ids mirror the PAINTS registry in index.html (yard is the free default). */
const PAINT_IDS = new Set(['yard', 'slate', 'verdant', 'crimson', 'violet', 'glacier', 'gold', 'night']);
db.exec(`
CREATE TABLE IF NOT EXISTS challenges (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_name  TEXT NOT NULL,
  day      TEXT NOT NULL,
  score    INTEGER NOT NULL,
  wave     INTEGER NOT NULL,
  ship     TEXT NOT NULL,
  ghost    TEXT NOT NULL,
  created  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chal_target ON challenges(to_name, day);
CREATE TABLE IF NOT EXISTS beats (
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created      INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);
`);
addCol('beats', 'score', 'INTEGER');
addCol('beats', 'run_hash', 'TEXT');
/* challenges must EXIST before it can be altered — this line lives below
   the CREATE TABLE for exactly that reason (a fresh CI database has no
   table to alter if the migration runs first) */
addCol('challenges', 'paint', 'TEXT');
/* Old "verified" rows were checked by the same client-telemetry heuristic.
   Do not silently preserve a stronger claim than the server can establish. */
db.prepare("UPDATE scores SET verdict = 'legacy' WHERE verdict IS NULL OR verdict = 'verified'").run();

/* ───────────────────── run provenance: verify before trust ─────────────────────
   The sim lives on the client, so cheating is not preventable — it is
   detectable. Runs arrive with checkpoint telemetry (one sample per wave,
   boss, and death). The server checks the aggregate arc and rejects what
   the game economy cannot produce. This is plausibility checking, not an
   authoritative replay: accepted runs may rank, review runs may not. */
const MAX_MULT = 5;
function verifyRun(mode, diff, wave, score, runT, cps) {
  const v = { verdict: 'accepted', flags: [] };
  const reject = why => { v.verdict = 'rejected'; v.flags.push(why); };
  const flag = why => { if (v.verdict === 'accepted') v.verdict = 'review'; v.flags.push(why); };

  if (!Array.isArray(cps) || !cps.length) {
    /* telemetry-less (legacy) submissions ride the coarse economy ceiling */
    if (score > Math.max(1, wave) * 400000 + 750000) reject('implausible score for wave');
    else flag('no telemetry');
    return v;
  }
  if (cps.length > 400) { reject('telemetry overflow'); return v; }

  /* shape + monotonicity: time, wave, score, kills, shots, hits, grazes
     never go backwards; mult lives in [1,5] */
  let prev = [0, 0, 0, 0, 0, 0, 0, 1];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    if (!Array.isArray(c) || c.length !== 8 || c.some(x => !Number.isFinite(x))) {
      reject('malformed checkpoint'); return v;
    }
    /* cadence applies between checkpoints; a run legitimately begins at t≈0 */
    if (i > 0 && c[0] < prev[0] + .4) { reject('checkpoint cadence'); return v; }
    for (let j = 0; j < 6; j++) if (c[j] < prev[j]) { reject('non-monotonic ' + j); return v; }
    if (c[7] < 1 || c[7] > MAX_MULT) { reject('mult out of range'); return v; }
    if (c[5] > c[4]) { reject('hits exceed shots'); return v; }
    prev = c;
  }

  const last = cps[cps.length - 1];
  const tw = last[1], ts = last[2], tk = last[3], tsh = last[4], thi = last[5];
  if (Math.abs(tw - wave) > 1) flag('final wave mismatch');
  if (Math.abs(ts - score) > Math.max(500, score * .02)) flag('final score mismatch');
  if (runT && Math.abs(runT - last[0]) > Math.max(3, last[0] * .12)) flag('runtime mismatch');

  /* economy ceilings: score mass and kills per wave of depth. Derived from
     the wave director's worst legal density, then doubled for boons. */
  const w = Math.max(1, tw);
  const scoreCap = w * 60000 + 120000;
  if (ts > scoreCap) reject('score impossible for depth');
  if (tk > tsh + w * 12 + 40) flag('kills exceed plausible hits');   // crashes earn kills too
  if (thi > 0 && tsh > 0 && thi / tsh > .98 && tsh > 80) flag('suspicious accuracy');

  /* sustained scoring velocity: elite play banks ~1-3k/s; hard cap 9k/s */
  if (last[0] > 20 && ts / last[0] > 9000) reject('scoring velocity impossible');

  /* wave time floors: clearing n waves needs at least ~4s each ( director
     releases squads over ~25s; this floor only catches instant-depth cheats) */
  if (last[0] < w * 4) reject('depth faster than possible');

  return v;
}

/* replay detection: identical aggregate arc from one pilot within 24h */
function runHash(userId, mode, score, wave, kills, runT, cps) {
  const h = crypto.createHash('sha256');
  h.update(userId + '|' + mode + '|' + score + '|' + wave + '|' + kills + '|' +
    Math.round((runT || 0) * 10) + '|' + cps.length + '|' +
    (cps.length ? Math.round(cps[cps.length - 1][4]) : 0));
  return h.digest('hex').slice(0, 32);
}
function isReplay(hash) {
  if (!hash) return false;
  const row = db.prepare('SELECT created FROM scores WHERE run_hash = ? AND created > ? LIMIT 1')
    .get(hash, now() - 86400000);
  return !!row;
}

/* ─────────── daily gauntlet: medals, payouts, streaks ───────────
   Pure functions, mirroring the client's DAILY_MEDALS/nextStreak contract
   (the client displays; the deck authorizes — one can drift only if a test
   stops failing). Waves OR score gates; highest reached tier pays. */
const DAILY_MEDALS = [
  { id: 'crest',   name: 'Crest',   wave: 5,  score: 4000,  alloy: 120 },
  { id: 'crown',   name: 'Crown',   wave: 10, score: 12000, alloy: 260 },
  { id: 'eclipse', name: 'Eclipse', wave: 15, score: 26000, alloy: 450 },
  /* v4.9: the honor guard only flies on Sundays — mirrors the client's
     dow gate and the wave director's escort spawn (payload pins parity) */
  { id: 'solar',   name: 'Solar Guard', wave: 20, score: 40000, alloy: 800, dow: 6 },
  /* v4.11: Wardenfall day — mirrors the client's AND gate: the rare boss
     must actually be up (the deck derives the same Sunday verdict from the
     day key the client's seed already trusts), be felled (wave 16+ means
     the wave-5 capital died long ago), and the run must fly deep */
  { id: 'wardenfall', name: 'Wardenfall', wave: 16, score: 48000, alloy: 1000, dow: 6, rare: true }
];
/* the rare-Sunday verdict: FNV-1a over the day string, exact client mirror
   (hashStr + wardenfallSunday in the payload). Independent derivation — the
   client never tells the deck whether Wardenfall was up. */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function dayDow(day) { return (Date.parse(day + 'T00:00:00.000Z') / 86400000 + 3) % 7; }   /* Monday = 0 */
function wardenfallSunday(day) { return dayDow(day) === 6 && hashStr('warden-' + day) % 7 === 0; }
function medalsEarned(score, wave, dow, day) {
  const out = [];
  for (const t of DAILY_MEDALS) {
    if (t.dow !== undefined && t.dow !== dow) continue;
    if (t.rare && !(day && wardenfallSunday(day))) continue;
    /* the rare honor is wave-gated only — wave 16 on a daily implies the
       wave-5 capital fell, so the kill is server-provable. A score shortcut
       would pay an un-felled fall (the probe caught exactly that). */
    if (wave >= t.wave || (!t.rare && score >= t.score)) out.push(t.name);
  }
  return out;
}
function medalsAlloy(names) {
  let sum = 0;
  for (const t of DAILY_MEDALS) if (names.includes(t.name)) sum += t.alloy;
  return sum;
}
/* streak = consecutive UTC days with an accepted run, walked from today;
   a same-day resubmission is idempotent, a missed day resets to 1. */
function dailyStreak(userId, today) {
  const rows = db.prepare('SELECT day FROM daily_stats WHERE user_id = ? ORDER BY day DESC').all(userId);
  const have = new Set(rows.map(r => r.day));
  if (have.has(today)) {
    let n = 1;
    while (have.has(dayOffset(today, -n))) n++;
    return n;
  }
  let n = 0;
  while (have.has(dayOffset(today, -(n + 1)))) n++;
  return n + 1;
}
function dayOffset(day, delta) {
  return new Date(Date.parse(day + 'T00:00:00.000Z') + delta * 86400000).toISOString().slice(0, 10);
}

/* ───────────────────── weekly gauntlet: seasons ───────────────────── */
function weekStart(ts) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;           // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/* ── the rehearsal clock (v4.15) ─────────────────────────────────────
   EF_DECK_DAY="YYYY-MM-DD" pins the deck's DAY (and nothing else) for
   live-fire drills: the daily gauntlet day, the medal window and the
   Wardenfall rare-Sunday verdict can be rehearsed on any calendar day,
   before the real one arrives. Deliberately narrow: sessions, rate
   limits, replay windows and board seasons stay on the honest wall
   clock, so an override can never widen a trust boundary or resurrect
   a paid day outside a drill. Unset (the default) = the real clock,
   and the boot log says so loudly either way. */
const DECK_DAY_OVERRIDE = (() => {
  const v = process.env.EF_DECK_DAY;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
})();
const deckDayOf = ts => {
  if (DECK_DAY_OVERRIDE) return DECK_DAY_OVERRIDE;
  const d = new Date(ts);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
};

/* ISO Monday-UTC for created_day windows. The window MUST be bound as a
   day string: binding the epoch-ms number instead silently matches every
   TEXT day (SQLite sorts INTEGER < TEXT) and counts the pilot's lifetime
   — found by live-fire week simulation, kept honest by this comment. */
function weekStartDay(ts) {
  const d = new Date(weekStart(ts));
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}
function seasonKey(ts) {
  const d = new Date(ts);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.floor((weekStart(ts) - jan1) / 604800000) + 1;
  return d.getUTCFullYear() + '-W' + pad2(week);
}
function seasonBoard(ts, userId) {
  const start = weekStart(ts);
  const ranked = db.prepare(`
    WITH weekly AS (
      SELECT s.user_id, s.score,
        ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.score DESC) AS rn
      FROM scores s WHERE s.mode = 'main' AND s.created >= ?
        AND s.verdict = 'accepted'
    )
    SELECT u.name AS n, SUM(w.score) AS pts, COUNT(*) AS runs, MAX(w.score) AS best
    FROM weekly w JOIN users u ON u.id = w.user_id
    WHERE w.rn <= 5
    GROUP BY w.user_id ORDER BY pts DESC LIMIT 10`).all(start);
  let me = null;
  if (userId) {
    const row = db.prepare(`
      WITH weekly AS (
        SELECT s.user_id, s.score,
          ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.score DESC) AS rn
        FROM scores s WHERE s.mode = 'main' AND s.created >= ? AND s.user_id = ?
          AND s.verdict = 'accepted'
      )
      SELECT SUM(score) AS pts, COUNT(*) AS runs, MAX(score) AS best FROM weekly WHERE rn <= 5`).get(start, userId);
    if (row && row.runs > 0) {
      const better = db.prepare(`
        WITH weekly AS (
          SELECT s.user_id, s.score,
            ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.score DESC) AS rn
          FROM scores s WHERE s.mode = 'main' AND s.created >= ?
            AND s.verdict = 'accepted'
        )
        SELECT user_id, SUM(score) AS pts FROM weekly WHERE rn <= 5 GROUP BY user_id
        HAVING pts > ?`).all(start, row.pts || 0);
      me = { pts: row.pts, runs: row.runs, best: row.best, rank: better.length + 1 };
    }
  }
  return { top: ranked, me };
}

/* ─────────────────────────── small helpers ─────────────────────────── */
const now = () => Date.now();
const pad2 = n => String(n).padStart(2, '0');
const SESSION_DAYS = 30;
const COOKIE = 'EF_SESSION';

function isSecureRequest(req) {
  return !!req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
}
function requireSecure(req, res) {
  if (IS_PROD && !isSecureRequest(req)) {
    bad(res, 'HTTPS required', 426);
    return false;
  }
  return true;
}

/* scrypt runs on libuv's threadpool (crypto.scrypt), NOT the event loop —
   N=16384 costs ~50ms of CPU and used to stall every other request while a
   login hashed. Callers await these. */
function scryptAsync(password, salt, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N: 16384, r: 8, p: 1, maxmem: 96 * 1024 * 1024 },
      (err, key) => err ? reject(err) : resolve(key));
  });
}
async function hashPassword(password, salt) {
  return (await scryptAsync(password, salt, 64)).toString('base64');
}
async function verifyPassword(password, salt, expected) {
  const got = await hashPassword(password, salt);
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function newSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const exp = now() + SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)')
    .run(crypto.createHash('sha256').update(token).digest('hex'), userId, now(), exp);
  const secure = IS_PROD || isSecureRequest(req);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure ? ' Secure;' : ''} Max-Age=${SESSION_DAYS * 86400}`);
}
function clearSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?')
    .run(crypto.createHash('sha256').update(token).digest('hex'));
  /* Secure matches newSession: a logout must be able to clear the very
     cookie a login set, and a Secure login cookie can only be overwritten
     by a Secure logout cookie. */
  const secure = IS_PROD || isSecureRequest(req);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax;${secure ? ' Secure;' : ''} Max-Age=0`);
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
function sessionUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.name, s.expires FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).get(crypto.createHash('sha256').update(token).digest('hex'));
  if (!row) return null;
  if (row.expires < now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .run(crypto.createHash('sha256').update(token).digest('hex'));
    return null;
  }
  return { id: row.id, name: row.name };
}

/* sliding-window rate limiter, per ip + bucket */
const buckets = new Map();
function rateLimit(ip, bucket, max, windowMs) {
  const key = ip + '|' + bucket;
  const t = now();
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  while (arr.length && arr[0] <= t - windowMs) arr.shift();
  if (arr.length >= max) return false;
  arr.push(t);
  if (buckets.size > 5000) { // keep memory flat
    for (const [k, v] of buckets) if (!v.length) buckets.delete(k);
  }
  return true;
}

const NAME_RE = /^[A-Za-z0-9_\- ]{3,16}$/;
const MODES = new Set(['main', 'daily', 'rush']);
const SHIPS = new Set(['vesper', 'halcyon', 'atlas', 'wraith', 'seraph']);

/* ─────────────────────────── http plumbing ─────────────────────────── */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}
const bad = (res, msg, code = 400) => send(res, code, { ok: false, error: msg });

function readBody(req, cap = 16384) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > cap) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJson(req, res, cap = 16384) {
  const ct = (req.headers['content-type'] || '');
  if (!ct.includes('application/json')) { bad(res, 'expected JSON body'); return null; }
  try { return JSON.parse(await readBody(req, cap)); }
  catch (e) { bad(res, e.message === 'payload too large' ? 'payload too large' : 'bad JSON'); return null; }
}

/* the game and the API share one origin; a JSON content-type is itself a
   CSRF barrier (cross-site forms cannot send it without a preflight we
   never answer), and we additionally require the custom header. */
function sameOriginGuard(req, res) {
  const rwh = req.headers['x-emberfall'] || '';
  if (rwh !== 'command-deck') { bad(res, 'missing origin header', 403); return false; }
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
};
/* ── static allowlist ──
   The deck serves the game shell and NOTHING else. Any path not on this
   list 404s: the SQLite database, this source file, git metadata, shell
   scripts and dotfiles must never be reachable over HTTP. This closes the
   audit's P0 leak (GET /data/emberfall.db → 200) and is regression-tested
   by the static-hygiene battery in smoke.sh (T-LEAK). */
const STATIC_OK = new Set([
  '/index.html', '/sw.js', '/manifest.webmanifest',
  '/js/art.js', '/js/input.js', '/js/audio.js', '/js/sky.js', '/js/net.js',
  '/fonts/michroma-400.woff2', '/fonts/chakra-petch-400.woff2',
  '/fonts/chakra-petch-500.woff2', '/fonts/chakra-petch-600.woff2',
  '/fonts/chakra-petch-700.woff2'
]);
function staticAllowed(p) {
  if (STATIC_OK.has(p)) return true;
  if (p.startsWith('/fonts/')) {
    const name = p.slice('/fonts/'.length);
    return /^[\w.-]+\.woff2$/.test(name);   // font files only, no traversal
  }
  if (p.startsWith('/icons/')) {
    const name = p.slice('/icons/'.length);
    return /^[\w.-]+\.png$/.test(name);   // flat icon files only, no traversal
  }
  return false;
}
function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  if (!staticAllowed(p)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    };
    if (ext === '.html') {
      headers['Content-Security-Policy'] =
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'";
      headers['Cache-Control'] = 'no-cache';
    } else if (file.endsWith('sw.js')) {
      headers['Cache-Control'] = 'no-cache';
    } else {
      /* ETag revalidation, not TTL caching: 'no-cache' forces a conditional
         request every time, the hash decides 304 vs 200 — unchanged files
         cost bytes, changed files ALWAYS arrive fresh. A max-age TTL here
         once pinned stale modules for an hour and even re-poisoned the
         service worker's background refresh with the same stale copy. */
      const etag = 'W/"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"';
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag });
        res.end();
        return;
      }
      headers['Cache-Control'] = 'no-cache';
      headers['ETag'] = etag;
    }
    res.writeHead(200, headers);
    res.end(buf);
  });
}

/* ─────────────────────────── api handlers ─────────────────────────── */
function publicProfile(userId) {
  const row = db.prepare('SELECT data, updated FROM profiles WHERE user_id = ?').get(userId);
  if (!row) return null;
  try { return { data: JSON.parse(row.data), updated: row.updated }; }
  catch (e) { return null; }
}

/* ---- the vault: rolling hourly profile snapshots (read-only backup) ----
   Why: the live profile row is one bad write away from ruin — a client
   bug, a bad merge, or a debugging probe (this actually happened on
   2026-09-21). A signed-in pilot's earned progress must survive any of
   it. Every profile write with real distance from the last snapshot
   (>= 3600s by clock, or >= 512 bytes of changed content) lands a copy
   in profile_snaps; the six newest per user are kept. Read-only for the
   client: restoring is done locally by replacing META/CFG from a picked
   snapshot and pushing the result as a normal profile write. */
const SNAP_MAX = 6;
function maybeSnapshot(userId) {
  try {
    const last = db.prepare('SELECT taken FROM profile_snaps WHERE user_id = ? ORDER BY taken DESC LIMIT 1').get(userId);
    const cur = db.prepare('SELECT data FROM profiles WHERE user_id = ?').get(userId);
    if (!cur) return;
    if (last && Date.now() - last.taken < 3600000 &&
        last.dataLen != null && Math.abs(cur.data.length - last.dataLen) < 512) return;
    db.prepare('INSERT INTO profile_snaps (user_id, taken, data) VALUES (?, ?, ?)').run(userId, Date.now(), cur.data);
    db.prepare(`DELETE FROM profile_snaps WHERE user_id = ? AND id NOT IN (
      SELECT id FROM profile_snaps WHERE user_id = ? ORDER BY taken DESC LIMIT ${SNAP_MAX})`).run(userId, userId);
  } catch (e) { /* a failed snapshot must never fail the profile write */ }
}
function listSnaps(userId) {
  return db.prepare('SELECT taken, LENGTH(data) AS bytes FROM profile_snaps WHERE user_id = ? ORDER BY taken DESC').all(userId);
}
function readSnap(userId, taken) {
  const row = db.prepare('SELECT data FROM profile_snaps WHERE user_id = ? AND taken = ?').get(userId, taken);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch (e) { return null; }
}

async function handleApi(req, res, pathname, ip) { /* ip is proxy-aware, see clientIp */
  /* ---- public ---- */
  if (req.method === 'GET' && pathname === '/api/health') {
    return send(res, 200, { ok: true, service: 'emberfall-command-deck', t: now() });
  }

  /* LAN play helper — the on-the-go story for phones before a public deploy.
     The deck already binds 0.0.0.0, so any device on the same Wi-Fi can play
     against this server; this endpoint just answers the one hard part
     ("what do I type on my phone?"). Internal ranges only; no host header
     echo — the client substitutes its own. */
  if (req.method === 'GET' && pathname === '/api/lan') {
    const candidates = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const ni of list || []) {
        if (ni.family !== 'IPv4' || ni.internal) continue;
        if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ni.address)) {
          candidates.push(ni.address);
        }
      }
    }
    return send(res, 200, { ok: true, port: PORT, addresses: candidates });
  }

  if (req.method === 'POST' && pathname === '/api/register') {
    if (!rateLimit(ip, 'register', 10, 60000)) return bad(res, 'slow down', 429);
    if (!sameOriginGuard(req, res)) return;
    const body = await readJson(req, res); if (!body) return;
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    if (!NAME_RE.test(name)) return bad(res, 'callsign: 3-16 letters, digits, _ - or space');
    if (password.length < 6 || password.length > 128) return bad(res, 'password: 6-128 characters');
    if (db.prepare('SELECT id FROM users WHERE name_lower = ?').get(name.toLowerCase())) {
      return bad(res, 'callsign already registered', 409);
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await hashPassword(password, salt);
    const info = db.prepare('INSERT INTO users (name, name_lower, salt, hash, created, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, name.toLowerCase(), salt, hash, now(), now());
    newSession(req, res, Number(info.lastInsertRowid));
    return send(res, 200, { ok: true, user: { name }, profile: null });
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    if (!rateLimit(ip, 'login', 15, 60000)) return bad(res, 'slow down', 429);
    if (!sameOriginGuard(req, res)) return;
    const body = await readJson(req, res); if (!body) return;
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    const row = db.prepare('SELECT id, name, salt, hash FROM users WHERE name_lower = ?').get(name.toLowerCase());
    /* constant-ish shape: always run a hash so timing does not reveal existence */
    const okPw = await (row
      ? verifyPassword(password, row.salt, row.hash)
      : verifyPassword(password, 'deaddbeefdeadbeefdeadbeefdeadbeef',
          await hashPassword('x', 'deaddbeefdeadbeefdeadbeefdeadbeef')));
    if (!row || !okPw) return bad(res, 'wrong callsign or password', 401);
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), row.id);
    newSession(req, res, row.id);
    return send(res, 200, { ok: true, user: { name: row.name }, profile: publicProfile(row.id) });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    if (!sameOriginGuard(req, res)) return;
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    const user = sessionUser(req);
    if (!user) return send(res, 200, { ok: true, user: null });
    const today = deckDayOf(now());
    const ds = db.prepare('SELECT streak, paid, best_score, best_wave FROM daily_stats WHERE user_id = ? AND day = ?').get(user.id, today);
    const total = db.prepare('SELECT COALESCE(SUM(paid), 0) AS t FROM daily_stats WHERE user_id = ?').get(user.id).t;
    /* v4.10 weekly recap: flew days in the running Monday-UTC week */
    const ws = weekStartDay(now());
    const wdRow = db.prepare('SELECT COUNT(DISTINCT created_day) AS n FROM daily_stats WHERE user_id = ? AND created_day >= ?')
      .get(user.id, ws);
    /* v4.11 season-end honors: the running week's flew days (same window the
       POST counter uses) + the lifetime count of Monday-weeks with all seven
       days flown. SQLite's %G-%W groups Monday-based weeks like the POST
       counter does; a week straddling New Year splits across both counters —
       an accepted, documented edge, not a silent divergence. */
    const psRow = db.prepare(`SELECT COUNT(*) AS c FROM (
      SELECT 1 FROM daily_stats WHERE user_id = ?
      GROUP BY strftime('%G-%W', created_day || 'T00:00:00Z')
      HAVING COUNT(DISTINCT created_day) >= 7)`).get(user.id);
    /* v4.13 Wardenfall honors: lifetime count of rare Sundays this pilot
       felled the fall — deck-recorded at award time, so a plaque renders
       from the ledger even years later, whatever today's seed says. */
    const wfRow = db.prepare('SELECT COUNT(*) AS c FROM daily_stats WHERE user_id = ? AND wardenfall = 1').get(user.id);
    return send(res, 200, {
      ok: true, user,
      profile: publicProfile(user.id),
      daily: ds ? { day: today, streak: ds.streak, paid: ds.paid, bestScore: ds.best_score, bestWave: ds.best_wave, total: Number(total) }
                 : { day: today, streak: 0, paid: 0, bestScore: 0, bestWave: 0, total: Number(total) },
      weekDays: wdRow ? wdRow.n : 0,
      seasonDays: wdRow ? wdRow.n : 0,
      perfectSeasons: psRow ? psRow.c : 0,
      wardenfalls: wfRow ? wfRow.c : 0
    });
  }

  /* ---- authenticated ---- */
  const user = sessionUser(req);

  if (req.method === 'PUT' && pathname === '/api/profile') {
    if (!user) return bad(res, 'sign in first', 401);
    if (!rateLimit(ip, 'profile:' + user.id, 30, 60000)) return bad(res, 'slow down', 429);
    if (!sameOriginGuard(req, res)) return;
    const body = await readJson(req, res); if (!body) return;
    const updated = Number(body.updated) || now();
    const existing = db.prepare('SELECT updated FROM profiles WHERE user_id = ?').get(user.id);
    if (existing && existing.updated > updated) {
      /* server is newer — hand it back so the client converges instead of clobbering */
      return send(res, 200, { ok: true, conflicted: true, profile: publicProfile(user.id) });
    }
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const cfg = body.cfg && typeof body.cfg === 'object' ? body.cfg : {};
    const payload = JSON.stringify({ meta, cfg });
    if (payload.length > 12288) return bad(res, 'profile too large');
    db.prepare(`INSERT INTO profiles (user_id, data, updated) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated = excluded.updated`)
      .run(user.id, payload, updated);
    maybeSnapshot(user.id);
    return send(res, 200, { ok: true });
  }

  /* the vault: list and read this pilot's rolling profile snapshots.
     Restores are deliberately client-side — the server never overwrites
     the live profile on behalf of a snapshot. */
  if (req.method === 'GET' && pathname === '/api/profile/snaps') {
    if (!user) return bad(res, 'sign in first', 401);
    return send(res, 200, { ok: true, snaps: listSnaps(user.id) });
  }
  const snapRead = req.method === 'GET' && pathname.startsWith('/api/profile/snaps/') ? Number(pathname.slice('/api/profile/snaps/'.length)) : null;
  if (snapRead) {
    if (!user) return bad(res, 'sign in first', 401);
    const data = readSnap(user.id, snapRead);
    if (!data) return bad(res, 'no such snapshot', 404);
    return send(res, 200, { ok: true, taken: snapRead, data });
  }

  if (req.method === 'POST' && pathname === '/api/scores') {
    if (!user) return bad(res, 'sign in first', 401);
    if (!rateLimit(ip, 'score:' + user.id, 20, 60000)) return bad(res, 'slow down', 429);
    if (!sameOriginGuard(req, res)) return;
    const body = await readJson(req, res); if (!body) return;
    const mode = String(body.mode || 'main');
    const score = Math.floor(Number(body.score) || 0);
    const wave = Math.floor(Number(body.wave) || 0);
    const diff = Math.floor(Number(body.diff) || 0);
    const ship = String(body.ship || 'vesper');
    const paint = body.paint ? String(body.paint).slice(0, 24) : null;
    const mastery = Math.min(5, Math.max(0, Math.floor(Number(body.mastery) || 0)));
    const runT = Number(body.runT) || 0;
    const kills = Math.floor(Number(body.kills) || 0);
    const cps = Array.isArray(body.cps) ? body.cps : [];
    if (!MODES.has(mode)) return bad(res, 'bad mode');
    if (!SHIPS.has(ship)) return bad(res, 'bad ship');
    if (!Number.isFinite(score) || score < 0 || score > 50000000) return bad(res, 'bad score');
    if (wave < 0 || wave > 999) return bad(res, 'bad wave');
    if (diff < 0 || diff > 4) return bad(res, 'bad diff');

    /* provenance: verify the arc, catch replays, then store with a verdict */
    const v = verifyRun(mode, diff, wave, score, runT, cps);
    if (v.verdict === 'rejected') {
      console.log(`[anti-cheat] reject user=${user.id} mode=${mode} score=${score} wave=${wave} flags=${v.flags.join(',')}`);
      return send(res, 422, { ok: false, error: 'run rejected: ' + v.flags.join(', ') });
    }
    const hash = runHash(user.id, mode, score, wave, kills, runT, cps);
    if (isReplay(hash)) return send(res, 422, { ok: false, error: 'run rejected: replay of an identical run' });

    db.prepare(`INSERT INTO scores (user_id, mode, score, wave, ship, diff, created, run_t, kills, telemetry, verdict, run_hash, paint, mastery)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(user.id, mode, score, wave, ship, diff, now(), runT, kills,
        JSON.stringify(cps).slice(0, 20000), v.verdict, hash, paint, mastery);

    const better = db.prepare(`SELECT COUNT(DISTINCT s.user_id) AS n FROM scores s
      WHERE s.mode = ? AND s.score > ? AND s.verdict = 'accepted'`).get(mode, score);
    const rank = Number(better.n) + 1;
    const top = db.prepare(`
      SELECT u.name AS n, MAX(s.score) AS s, s.wave AS w, s.ship, s.diff, MIN(s.created) AS d,
        MAX(s.paint) AS p, MAX(s.mastery) AS m
      FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.mode = ? AND s.verdict = 'accepted'
      GROUP BY s.user_id ORDER BY s DESC LIMIT 10`).all(mode);
    const sb = seasonBoard(now(), user.id);
    let daily = null;
    if (mode === 'daily' && v.verdict === 'accepted') {
      /* the day is decided by the deck's UTC clock, not the client's — same
         clock the boards use, so a board row and its medal never disagree
         (EF_DECK_DAY rehearses the day for drills; see deckDayOf) */
      const today = deckDayOf(now());
      const dow = (Date.parse(today + 'T00:00:00.000Z') / 86400000 + 3) % 7;   /* Monday = 0 */
      const earned = medalsEarned(score, wave, dow, today);
      const row = db.prepare('SELECT paid, wardenfall FROM daily_stats WHERE user_id = ? AND day = ?').get(user.id, today);
      const wf = earned.includes('Wardenfall');
      const already = row ? row.paid : 0;
      const full = medalsAlloy(earned);
      const unpaid = Math.max(0, full - already);
      const streak = dailyStreak(user.id, today);
      db.prepare(`INSERT INTO daily_stats (user_id, day, created_day, best_score, best_wave, paid, streak, wardenfall)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(user_id, day) DO UPDATE SET
                    best_score = MAX(best_score, excluded.best_score),
                    best_wave = MAX(best_wave, excluded.best_wave),
                    paid = MAX(paid, excluded.paid),
                    streak = excluded.streak,
                    wardenfall = MAX(wardenfall, excluded.wardenfall)`)
        .run(user.id, today, today, score, wave, already + unpaid, streak, wf ? 1 : 0);
      /* the payout ledger lives in daily_stats.paid alone: currency balances
         belong to the client profile, and SUM(paid) is the deck's total —
         the client adopts it as a watermark and banks the delta itself */
      const total = db.prepare('SELECT COALESCE(SUM(paid), 0) AS t FROM daily_stats WHERE user_id = ?').get(user.id).t;
      /* v4.13.1: the response carries the deck's LIFETIME fall count next to
         the per-run flag — adoption on any device self-heals the same day a
         second rare Sunday lands, instead of waiting for an /api/me pass. */
      const wfCount = db.prepare('SELECT COUNT(*) AS c FROM daily_stats WHERE user_id = ? AND wardenfall = 1').get(user.id).c;
      /* v4.11 season-end honors: did this accepted run land in a week whose
         every day was flown? Count DISTINCT flew days against the week's
         seven — a live season still shows the honest running count. */
      const ws0 = weekStartDay(now());
      const sd = db.prepare('SELECT COUNT(DISTINCT created_day) AS n FROM daily_stats WHERE user_id = ? AND created_day >= ?')
        .get(user.id, ws0).n;
      const perfect = sd >= 7 ? 1 : 0;
      daily = { medals: earned, paid: unpaid, streak, day: today, total: Number(total), seasonDays: sd, perfect, wardenfall: wf ? 1 : 0, wardenfalls: wfCount };
    }
    return send(res, 200, { ok: true, rank, top, verdict: v.verdict, season: seasonKey(now()), seasonMe: sb.me, daily });
  }

  if (req.method === 'GET' && pathname === '/api/scores') {
    const url = new URL(req.url, 'http://x');
    const mode = url.searchParams.get('mode') || 'main';
    if (!MODES.has(mode)) return bad(res, 'bad mode');
    /* day window: ?day=YYYY-MM-DD scopes the board to that UTC day's runs —
       the shared Daily Gauntlet board. The day string is the seed contract
       itself (the same key the game derives its daily RNG from), so a board
       can never disagree with a run about what "today" was. Self-contained
       regex: DAY_RE below is still in its temporal dead zone up here. */
    let day = null, win = '', winArgs = [];
    const dayParam = url.searchParams.get('day');
    if (dayParam != null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayParam)) return bad(res, 'bad day');
      day = dayParam;
      const lo = Date.parse(dayParam + 'T00:00:00.000Z');
      const hi = Date.parse(dayParam + 'T23:59:59.999Z');
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return bad(res, 'bad day');
      win = ' AND s.created >= ? AND s.created <= ?';
      winArgs = [lo, hi];
    }
    const topN = db.prepare(`
      SELECT u.name AS n, MAX(s.score) AS s, s.wave AS w, s.ship, s.diff, MIN(s.created) AS d,
        MAX(s.paint) AS p, MAX(s.mastery) AS m
      FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.mode = ? AND s.verdict = 'accepted'${win}
      GROUP BY s.user_id ORDER BY s DESC LIMIT 10`).all(mode, ...winArgs);
    /* v4.10: medal pips — a pilot's daily_stats bests are the ledger of what
       they EARNED today (two runs pool their tiers), so the day board renders
       the ledger, not one run's gates. Keyed by callsign; me-row uses it too. */
    let md = {};
    if (mode === 'daily' && day) {
      const dow = (Date.parse(day + 'T00:00:00.000Z') / 86400000 + 3) % 7;
      const names = topN.map(r => r.n);
      if (user) names.push(user.name);
      if (names.length) {
        const ph = names.map(() => '?').join(',');
        const mdRows = db.prepare(`SELECT u.name AS n, ds.best_score AS bs, ds.best_wave AS bw
          FROM daily_stats ds JOIN users u ON u.id = ds.user_id
          WHERE ds.day = ? AND u.name IN (${ph})`).all(day, ...names);
        for (const r of mdRows) {
          const earned = medalsEarned(r.bs, r.bw, dow, day);   /* day passed: rare-tier pips honor the rare verdict */
          if (earned.length) md[r.n] = earned;
        }
      }
    }
    let me = null;
    if (user) {
      /* ranked like every board query: accepted runs only — a review/rejected
         run must not hand the pilot a rank they do not have */
      const best = db.prepare(`SELECT score AS s, wave AS w, ship FROM scores s WHERE s.mode = ? AND s.user_id = ? AND s.verdict = 'accepted'${win} ORDER BY score DESC LIMIT 1`).get(mode, user.id, ...winArgs);   /* (mode, user_id, lo, hi) */
      if (best && best.s != null) {
        const better = db.prepare(`
          SELECT COUNT(DISTINCT s.user_id) AS n FROM scores s WHERE s.mode = ? AND s.verdict = 'accepted'${win} AND
            s.score > (SELECT MAX(score) FROM scores s WHERE s.mode = ? AND s.user_id = ? AND s.verdict = 'accepted'${win})`)
          .get(mode, ...winArgs, mode, user.id, ...winArgs);   /* sub binds (mode, user_id, lo, hi) */
        me = { name: user.name, s: Number(best.s), w: best.w, ship: best.ship, rank: Number(better.n) + 1, day,
               mds: md[user.name] || [] };
      }
    }
    return send(res, 200, { ok: true, day, top: topN, me, md });
  }

  if (req.method === 'GET' && pathname === '/api/season') {
    const board = seasonBoard(now(), user ? user.id : null);
    return send(res, 200, {
      ok: true, season: seasonKey(now()), ends: weekStart(now()) + 604800000,
      top: board.top, me: board.me
    });
  }

  /* ── duels: same-day daily ghost, challenged pilot races it ── */
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function utcToday() {
    /* v4.15.1: duels read the same day-clock as the gauntlet — the
       rehearsal override pins duels too, so create, inbox and retention
       stay coherent on a pinned deck (the drill caught the drift). */
    return deckDayOf(now());
  }

  if (req.method === 'POST' && pathname === '/api/challenges') {
    if (!user) return bad(res, 'sign in first', 401);
    if (!rateLimit(ip, 'chal:' + user.id, 12, 60000)) return bad(res, 'slow down', 429);
    if (!sameOriginGuard(req, res)) return;
    const body = await readJson(req, res, 262144); if (!body) return;
    const to = String(body.to || '').trim();
    const day = String(body.day || '');
    const score = Math.floor(Number(body.score) || 0);
    const wave = Math.floor(Number(body.wave) || 1);
    const ship = String(body.ship || 'vesper');
    const ghost = body.ghost;
    const paint = body.paint == null ? 'yard'
      : (PAINT_IDS.has(String(body.paint)) ? String(body.paint) : null);
    if (paint == null) return bad(res, 'bad paint');
    if (!NAME_RE.test(to)) return bad(res, 'challenge a valid callsign');
    if (to.toLowerCase() === user.name.toLowerCase()) return bad(res, 'you cannot duel yourself');
    if (!DAY_RE.test(day) || day !== utcToday()) return bad(res, 'duels are for today\'s run only');
    if (!SHIPS.has(ship)) return bad(res, 'bad ship');
    if (score <= 0 || score > 50000000) return bad(res, 'bad score');
    if (!ghost || !Array.isArray(ghost.frames) || !ghost.frames.length) return bad(res, 'ghost required');
    if (ghost.frames.length > 11000) return bad(res, 'ghost too long');
    const gjson = JSON.stringify({ score, ship, frames: ghost.frames, paint: ghost.paint || 'yard' });
    if (gjson.length > 220000) return bad(res, 'ghost too large');
    const target = db.prepare('SELECT id FROM users WHERE name_lower = ?').get(to.toLowerCase());
    if (!target) return bad(res, 'no such pilot on this deck', 404);
    const info = db.prepare('INSERT INTO challenges (from_id, to_name, day, score, wave, ship, ghost, paint, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(user.id, to.toLowerCase(), day, score, wave, ship, gjson, paint, now());
    return send(res, 200, { ok: true, id: Number(info.lastInsertRowid) });
  }

  if (req.method === 'GET' && pathname === '/api/challenges') {
    if (!user) return bad(res, 'sign in first', 401);
    const today = utcToday();
    const rows = db.prepare(`
      SELECT c.id, c.day, c.score, c.wave, c.ship, c.paint, c.created, u.name AS from_name,
        (SELECT COUNT(*) FROM beats b WHERE b.challenge_id = c.id AND b.user_id = ?) AS beaten
      FROM challenges c JOIN users u ON u.id = c.from_id
      WHERE c.to_name = ? AND c.day = ? ORDER BY c.created DESC LIMIT 12`).all(user.id, user.name.toLowerCase(), today);
    return send(res, 200, { ok: true, day: today, list: rows });
  }

  if (req.method === 'GET' && pathname === '/api/challenges/ghost') {
    if (!user) return bad(res, 'sign in first', 401);
    const url = new URL(req.url, 'http://x');
    const id = Math.floor(Number(url.searchParams.get('id')) || 0);
    const row = db.prepare('SELECT id, to_name, ghost FROM challenges WHERE id = ?').get(id);
    if (!row || row.to_name !== user.name.toLowerCase()) return bad(res, 'no such duel', 404);
    try { return send(res, 200, { ok: true, ghost: JSON.parse(row.ghost) }); }
    catch (e) { return bad(res, 'duel ghost corrupted'); }
  }

  if (req.method === 'POST' && pathname === '/api/challenges/beat') {
    if (!user) return bad(res, 'sign in first', 401);
    if (!rateLimit(ip, 'beat:' + user.id, 12, 60000)) return bad(res, 'slow down', 429);
    if (!sameOriginGuard(req, res)) return;
    const body = await readJson(req, res); if (!body) return;
    const id = Math.floor(Number(body.id) || 0);
    const score = Math.floor(Number(body.score) || 0);
    const wave = Math.floor(Number(body.wave) || 0);
    const diff = Math.floor(Number(body.diff) || 0);
    const runT = Number(body.runT) || 0;
    const kills = Math.floor(Number(body.kills) || 0);
    const cps = Array.isArray(body.cps) ? body.cps : [];
    const row = db.prepare('SELECT id, to_name, score FROM challenges WHERE id = ?').get(id);
    if (!row || row.to_name !== user.name.toLowerCase()) return bad(res, 'no such duel', 404);
    if (score < row.score) return bad(res, 'score did not beat the challenge', 422);
    if (wave < 1 || wave > 999 || diff < 0 || diff > 4 || !Number.isFinite(score) || score > 50000000) return bad(res, 'bad run');
    const verdict = verifyRun('daily', diff, wave, score, runT, cps);
    if (verdict.verdict !== 'accepted') return bad(res, 'run failed plausibility checks', 422);
    const hash = runHash(user.id, 'duel:' + id, score, wave, kills, runT, cps);
    if (isReplay(hash)) return bad(res, 'run replayed', 422);
    db.prepare('INSERT OR IGNORE INTO beats (challenge_id, user_id, created, score, run_hash) VALUES (?, ?, ?, ?, ?)')
      .run(id, user.id, now(), score, hash);
    const n = db.prepare('SELECT COUNT(*) AS n FROM beats WHERE challenge_id = ?').get(id);
    return send(res, 200, { ok: true, beaten: Number(n.n) > 0, score });
  }

  return bad(res, 'no such endpoint', 404);
}

/* ─────────────────────────── server ─────────────────────────── */
/* Rate-limit keys must be the REAL client IP. Behind the documented nginx
   (TRUST_PROXY=1, one proxy hop), socket.remoteAddress is the proxy's IP —
   every pilot would share one bucket and one abuser would exhaust it for
   everyone. Trust X-Forwarded-For ONLY when TRUST_PROXY is explicitly set;
   without it the header is attacker-controlled and spoofable. */
function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) {
      const first = xff.split(',')[0].trim();
      if (first) return first.replace(/^::ffff:/, '');
    }
  }
  return (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}
const server = http.createServer(async (req, res) => {
  const ip = clientIp(req);
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      if (!requireSecure(req, res)) return;
      if (!rateLimit(ip, 'api', 240, 60000)) return bad(res, 'slow down', 429);
      return await handleApi(req, res, url.pathname, ip);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('[cmd-deck] error:', err.message);
    try { bad(res, 'internal error', 500); } catch (e) { /* socket gone */ }
  }
});

process.on('uncaughtException', err => console.error('[cmd-deck] uncaught:', err.message));
process.on('unhandledRejection', err => console.error('[cmd-deck] unhandled:', err));

/* ── duel ghost retention (v4.15.1) ─────────────────────────────────
   A duel is only flyable on its own day — "today's run only" is the
   create-time rule — so a challenge older than the retention window is
   dead weight: its ghost can never be beaten again. The sweep deletes
   challenges (and, by cascade, their beats) whose day fell out of the
   window. The cutoff derives from deckDayOf, so a rehearsal deck prunes
   on its pinned day too. Bounded batches: node:sqlite is synchronous
   and a backlog must never stall the event loop. EF_DUEL_RETENTION_DAYS
   tunes the window (default 7, floors at 1 — today always survives). */
const RETENTION_DAYS = Math.max(1, Math.floor(Number(process.env.EF_DUEL_RETENTION_DAYS) || 7));
function retentionCutoff() {
  return new Date(Date.parse(deckDayOf(now()) + 'T00:00:00.000Z') - RETENTION_DAYS * 86400000)
    .toISOString().slice(0, 10);
}
function pruneDuels() {
  try {
    const info = db.prepare('DELETE FROM challenges WHERE id IN (SELECT id FROM challenges WHERE day < ? LIMIT 500)').run(retentionCutoff());
    if (info.changes > 0) console.log(`[cmd-deck] ghost retention: pruned ${info.changes} stale duels (window ${RETENTION_DAYS}d)`);
  } catch (e) { console.error('[cmd-deck] ghost retention failed:', e.message); }
}
setInterval(pruneDuels, 6 * 3600000).unref();
pruneDuels();   /* boot-time sweep: a restarted deck sheds its dead ghosts immediately */

server.listen(PORT, () => {
  console.log(`[cmd-deck] EMBERFALL backend on http://localhost:${PORT}  (db: ${DB_PATH})`);
  if (DECK_DAY_OVERRIDE) console.log(`[cmd-deck] REHEARSAL CLOCK: EF_DECK_DAY=${DECK_DAY_OVERRIDE} — days are pinned; sessions, limiters and seasons are NOT`);
});
