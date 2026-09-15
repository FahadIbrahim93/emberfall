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

/* ─────────────────────────── small helpers ─────────────────────────── */
const now = () => Date.now();
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
async function readJson(req, res) {
  const ct = (req.headers['content-type'] || '');
  if (!ct.includes('application/json')) { bad(res, 'expected JSON body'); return null; }
  try { return JSON.parse(await readBody(req)); }
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
    if (!MODES.has(mode)) return bad(res, 'bad mode');
    if (!SHIPS.has(ship)) return bad(res, 'bad ship');
    if (!Number.isFinite(score) || score < 0 || score > 50000000) return bad(res, 'bad score');
    if (wave < 0 || wave > 999) return bad(res, 'bad wave');
    if (diff < 0 || diff > 3) return bad(res, 'bad diff');
    /* sanity floor: scores must be plausible for the depth reached */
    if (score > wave * 400000 + 750000) return bad(res, 'implausible score for wave', 422);
    db.prepare('INSERT INTO scores (user_id, mode, score, wave, ship, diff, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(user.id, mode, score, wave, ship, diff, now());
    const better = db.prepare('SELECT COUNT(*) AS n FROM scores WHERE mode = ? AND score > ?').get(mode, score);
    const rank = Number(better.n) + 1;
    const top = db.prepare(`
      SELECT u.name AS n, s.score AS s, s.wave AS w, s.ship, s.diff, s.created AS d
      FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.mode = ? ORDER BY s.score DESC, s.created ASC LIMIT 10`).all(mode);
    return send(res, 200, { ok: true, rank, top });
  }

  if (req.method === 'GET' && pathname === '/api/scores') {
    const url = new URL(req.url, 'http://x');
    const mode = url.searchParams.get('mode') || 'main';
    if (!MODES.has(mode)) return bad(res, 'bad mode');
    const topN = db.prepare(`
      SELECT u.name AS n, MAX(s.score) AS s, s.wave AS w, s.ship, s.diff, MIN(s.created) AS d
      FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.mode = ? GROUP BY s.user_id ORDER BY s DESC LIMIT 10`).all(mode);
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
