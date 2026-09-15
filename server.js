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
   - sessions: 32 random bytes, only the SHA-256 is stored; HttpOnly cookie,
     SameSite=Lax; every mutating request must be same-origin JSON
   - input: every field validated and length-capped; SQL is 100% parameterized
   - rate limits: per-IP sliding windows on auth and score submission
   - headers: nosniff, frame-deny, referrer policy, CSP on documents
   ══════════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 0)) || 8123;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'emberfall.db');

/* ─────────────────────────── database ─────────────────────────── */
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
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
`);
/* v3.3 migrations — idempotent column adds */
function addCol(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}
addCol('scores', 'run_t', 'REAL');
addCol('scores', 'kills', 'INTEGER');
addCol('scores', 'telemetry', 'TEXT');
addCol('scores', 'verdict', 'TEXT DEFAULT \'verified\'');
addCol('scores', 'run_hash', 'TEXT');
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

/* ───────────────────── run provenance: verify before trust ─────────────────────
   The sim lives on the client, so cheating is not preventable — it is
   detectable. Runs arrive with checkpoint telemetry (one sample per wave,
   boss, and death). The server replays the aggregate arc and rejects what
   the game economy cannot produce. Two verdicts: verified, flagged. */
const MAX_MULT = 5;
function verifyRun(mode, diff, wave, score, runT, cps) {
  const v = { verdict: 'verified', flags: [] };
  const reject = why => { v.verdict = 'rejected'; v.flags.push(why); };
  const flag = why => { if (v.verdict === 'verified') v.verdict = 'flagged'; v.flags.push(why); };

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

/* ───────────────────── weekly gauntlet: seasons ───────────────────── */
function weekStart(ts) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;           // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
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
        AND (s.verdict IS NULL OR s.verdict = 'verified')
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
          AND (s.verdict IS NULL OR s.verdict = 'verified')
      )
      SELECT SUM(score) AS pts, COUNT(*) AS runs, MAX(score) AS best FROM weekly WHERE rn <= 5`).get(start, userId);
    if (row && row.runs > 0) {
      const better = db.prepare(`
        WITH weekly AS (
          SELECT s.user_id, s.score,
            ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.score DESC) AS rn
          FROM scores s WHERE s.mode = 'main' AND s.created >= ?
            AND (s.verdict IS NULL OR s.verdict = 'verified')
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

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64');
}
function verifyPassword(password, salt, expected) {
  const got = hashPassword(password, salt);
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function newSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const exp = now() + SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)')
    .run(crypto.createHash('sha256').update(token).digest('hex'), userId, now(), exp);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
function clearSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?')
    .run(crypto.createHash('sha256').update(token).digest('hex'));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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
const SHIPS = new Set(['vesper', 'halcyon', 'atlas', 'wraith']);

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
function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
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
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'";
      headers['Cache-Control'] = 'no-cache';
    } else if (file.endsWith('sw.js')) {
      headers['Cache-Control'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=3600';
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

async function handleApi(req, res, pathname, ip) {
  /* ---- public ---- */
  if (req.method === 'GET' && pathname === '/api/health') {
    return send(res, 200, { ok: true, service: 'emberfall-command-deck', t: now() });
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
    const info = db.prepare('INSERT INTO users (name, name_lower, salt, hash, created, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, name.toLowerCase(), salt, hashPassword(password, salt), now(), now());
    newSession(res, Number(info.lastInsertRowid));
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
    const okPw = row
      ? verifyPassword(password, row.salt, row.hash)
      : verifyPassword(password, 'deaddbeefdeadbeefdeadbeefdeadbeef',
          hashPassword('x', 'deaddbeefdeadbeefdeadbeefdeadbeef'));
    if (!row || !okPw) return bad(res, 'wrong callsign or password', 401);
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), row.id);
    newSession(res, row.id);
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
    return send(res, 200, { ok: true, user, profile: publicProfile(user.id) });
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
    return send(res, 200, { ok: true });
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
    const runT = Number(body.runT) || 0;
    const kills = Math.floor(Number(body.kills) || 0);
    const cps = Array.isArray(body.cps) ? body.cps : [];
    if (!MODES.has(mode)) return bad(res, 'bad mode');
    if (!SHIPS.has(ship)) return bad(res, 'bad ship');
    if (!Number.isFinite(score) || score < 0 || score > 50000000) return bad(res, 'bad score');
    if (wave < 0 || wave > 999) return bad(res, 'bad wave');
    if (diff < 0 || diff > 3) return bad(res, 'bad diff');

    /* provenance: verify the arc, catch replays, then store with a verdict */
    const v = verifyRun(mode, diff, wave, score, runT, cps);
    if (v.verdict === 'rejected') return send(res, 422, { ok: false, error: 'run rejected: ' + v.flags.join(', ') });
    const hash = runHash(user.id, mode, score, wave, kills, runT, cps);
    if (isReplay(hash)) return send(res, 422, { ok: false, error: 'run rejected: replay of an identical run' });

    db.prepare(`INSERT INTO scores (user_id, mode, score, wave, ship, diff, created, run_t, kills, telemetry, verdict, run_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(user.id, mode, score, wave, ship, diff, now(), runT, kills,
        JSON.stringify(cps).slice(0, 20000), v.verdict, hash);

    const better = db.prepare(`SELECT COUNT(DISTINCT s.user_id) AS n FROM scores s
      WHERE s.mode = ? AND s.score > ? AND (s.verdict IS NULL OR s.verdict = 'verified')`).get(mode, score);
    const rank = Number(better.n) + 1;
    const top = db.prepare(`
      SELECT u.name AS n, MAX(s.score) AS s, s.wave AS w, s.ship, s.diff, MIN(s.created) AS d
      FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.mode = ? AND (s.verdict IS NULL OR s.verdict = 'verified')
      GROUP BY s.user_id ORDER BY s DESC LIMIT 10`).all(mode);
    const sb = seasonBoard(now(), user.id);
    return send(res, 200, { ok: true, rank, top, verdict: v.verdict, season: seasonKey(now()), seasonMe: sb.me });
  }

  if (req.method === 'GET' && pathname === '/api/scores') {
    const url = new URL(req.url, 'http://x');
    const mode = url.searchParams.get('mode') || 'main';
    if (!MODES.has(mode)) return bad(res, 'bad mode');
    const topN = db.prepare(`
      SELECT u.name AS n, MAX(s.score) AS s, s.wave AS w, s.ship, s.diff, MIN(s.created) AS d
      FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.mode = ? AND (s.verdict IS NULL OR s.verdict = 'verified')
      GROUP BY s.user_id ORDER BY s DESC LIMIT 10`).all(mode);
    let me = null;
    if (user) {
      const best = db.prepare('SELECT MAX(score) AS s FROM scores WHERE mode = ? AND user_id = ?').get(mode, user.id);
      if (best && best.s != null) {
        const better = db.prepare(`
          SELECT COUNT(DISTINCT s.user_id) AS n FROM scores s WHERE s.mode = ? AND
            s.score > (SELECT MAX(score) FROM scores WHERE mode = ? AND user_id = ?)`).get(mode, mode, user.id);
        me = { name: user.name, s: Number(best.s), rank: Number(better.n) + 1 };
      }
    }
    return send(res, 200, { ok: true, top: topN, me });
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
    const d = new Date();
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
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
    if (!NAME_RE.test(to)) return bad(res, 'challenge a valid callsign');
    if (to.toLowerCase() === user.name.toLowerCase()) return bad(res, 'you cannot duel yourself');
    if (!DAY_RE.test(day) || day !== utcToday()) return bad(res, 'duels are for today\'s run only');
    if (!SHIPS.has(ship)) return bad(res, 'bad ship');
    if (score <= 0 || score > 50000000) return bad(res, 'bad score');
    if (!ghost || !Array.isArray(ghost.frames) || !ghost.frames.length) return bad(res, 'ghost required');
    if (ghost.frames.length > 11000) return bad(res, 'ghost too long');
    const gjson = JSON.stringify({ score, ship, frames: ghost.frames });
    if (gjson.length > 220000) return bad(res, 'ghost too large');
    const target = db.prepare('SELECT id FROM users WHERE name_lower = ?').get(to.toLowerCase());
    if (!target) return bad(res, 'no such pilot on this deck', 404);
    const info = db.prepare('INSERT INTO challenges (from_id, to_name, day, score, wave, ship, ghost, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(user.id, to.toLowerCase(), day, score, wave, ship, gjson, now());
    return send(res, 200, { ok: true, id: Number(info.lastInsertRowid) });
  }

  if (req.method === 'GET' && pathname === '/api/challenges') {
    if (!user) return bad(res, 'sign in first', 401);
    const today = utcToday();
    const rows = db.prepare(`
      SELECT c.id, c.day, c.score, c.wave, c.ship, c.created, u.name AS from_name,
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
    if (!sameOriginGuard(req, res)) return;
    const body = await readJson(req, res); if (!body) return;
    const id = Math.floor(Number(body.id) || 0);
    const row = db.prepare('SELECT id, to_name FROM challenges WHERE id = ?').get(id);
    if (!row || row.to_name !== user.name.toLowerCase()) return bad(res, 'no such duel', 404);
    db.prepare('INSERT OR IGNORE INTO beats (challenge_id, user_id, created) VALUES (?, ?, ?)').run(id, user.id, now());
    const n = db.prepare('SELECT COUNT(*) AS n FROM beats WHERE challenge_id = ?').get(id);
    return send(res, 200, { ok: true, beaten: Number(n.n) > 0 });
  }

  return bad(res, 'no such endpoint', 404);
}

/* ─────────────────────────── server ─────────────────────────── */
const server = http.createServer(async (req, res) => {
  const ip = (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
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

server.listen(PORT, () => {
  console.log(`[cmd-deck] EMBERFALL backend on http://localhost:${PORT}  (db: ${DB_PATH})`);
});
