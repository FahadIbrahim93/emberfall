#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   db-sync.mjs — the public mirror pump (ADR 0001).

   The deck's SQLite is the ONLY authoritative store. This tool replicates
   PUBLIC facts — callsigns, accepted scores, gauntlet day aggregates,
   lifetime totals — into the Supabase mirror, where RLS allows the world
   to read and no one to write. Gameplay never touches Supabase; the deck
   process never holds a Supabase key.

   Three transports, all zero-dependency (node:sqlite + fetch):

     1. REST push (operator machine / scheduled runner):
          SUPABASE_URL=https://<ref>.supabase.co \
          SUPABASE_SERVICE_KEY=<service-role key> \
          node tools/db-sync.mjs
        Upserts pilots, scores, gauntlet days, deck_stats, and — once
        tools/mirror-schema.sql has been applied — per-mode board rows,
        season history and public pilot cards. Prefer: resolution=merge-duplicates.

     2. Keyless staging (--print-sql):
          node tools/db-sync.mjs --print-sql > mirror.sql
        Emits one idempotent SQL script (upserts + deletes for rows that
        left the authoritative store). Run it through any SQL path — the
        Supabase console, the MCP execute_sql connector, psql. This is how
        a maintainer seeds the mirror without ever copying a service key.

     3. Verify (--verify):
          node tools/db-sync.mjs --verify
        Reads the mirror back through the PUBLISHABLE (anon) key — the
        same credential the public /stats page uses — and checks the
        totals against the local authoritative store. Exit 1 on drift.

   Privacy contract: the mirror receives callsigns, scores, wave/mode/ship,
   an allowlisted paint id, gauntlet aggregates and season totals. It never
   receives password hashes, session tokens, checkpoint telemetry, profile
   JSON or the save vault. weekStart/seasonKey below match server.js — the
   mirror's season is the deck's season.

   WHAT COUNTS: accepted runs only (verdict = 'accepted'); review and
   legacy rows stay on the deck. Tombstoned pilots are deleted from the
   mirror by the same sync — deletion follows the pilot out.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/* the authoritative store: same resolution as server.js (env wins, then the
   externalized default) — the sync reads the deck the operator actually runs */
const DATA_DIR = process.env.EF_DATA_DIR
  ? path.resolve(process.env.EF_DATA_DIR)
  : path.join(path.dirname(ROOT), 'emberfall-data');
const DB_PATH = process.env.EF_DB_PATH || path.join(DATA_DIR, 'emberfall.db');
if (!fs.existsSync(DB_PATH)) {
  console.error(`db-sync: no deck database at ${DB_PATH} — set EF_DATA_DIR or run the deck once`);
  process.exit(1);
}
const db = new DatabaseSync(DB_PATH, { readOnly: true });

/* wardrobe allowlist — the same ids server.js accepts on a score write */
const PAINT_IDS = new Set(['yard', 'slate', 'verdant', 'crimson', 'violet', 'glacier', 'gold', 'night']);
const paintOk = p => (p && PAINT_IDS.has(p) ? p : null);

/* Monday-UTC week and season key. Copied from server.js on purpose: the
   mirror must name the same week the deck's /api/season names. */
function weekStart(ts) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function seasonKey(ts) {
  const d = new Date(ts);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.floor((weekStart(ts) - jan1) / 604800000) + 1;
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}
/* cmp orders the board. tied() is the competition-rank key: equal bests
   share a rank even when an earlier flight is listed first. */
function competitionRank(list, cmp, tied) {
  const sorted = [...list].sort(cmp);
  let lastRank = 0;
  return sorted.map((item, i) => {
    const rank = i > 0 && tied(sorted[i - 1], item) ? lastRank : i + 1;
    lastRank = rank;
    return { ...item, rank };
  });
}

/* ── extract: public facts only ──────────────────────────────────────── */
function extract() {
  const pilots = db.prepare(`
    SELECT u.id, u.name, u.created, u.last_seen,
      (SELECT COUNT(*) FROM scores s WHERE s.user_id = u.id AND s.verdict = 'accepted') AS runs,
      (SELECT COALESCE(SUM(d.paid), 0) FROM daily_stats d WHERE d.user_id = u.id) AS total_paid,
      (SELECT COALESCE(MAX(d.streak), 0) FROM daily_stats d WHERE d.user_id = u.id) AS best_streak,
      (SELECT COUNT(*) FROM daily_stats d WHERE d.user_id = u.id AND d.wardenfall = 1) AS wardenfalls,
      (SELECT COUNT(*) FROM daily_stats d WHERE d.user_id = u.id) AS flew_days
    FROM users u`).all();
  const career = db.prepare(`
    WITH best AS (
      SELECT s.user_id, s.mode, s.score, s.wave, s.ship, s.paint, s.mastery,
             ROW_NUMBER() OVER (
               PARTITION BY s.user_id
               ORDER BY s.score DESC, s.created ASC, s.id ASC
             ) AS rn
      FROM scores s WHERE s.verdict = 'accepted'
    )
    SELECT user_id, mode, score, wave, ship, paint, mastery FROM best WHERE rn = 1`).all();
  const careerBy = new Map(career.map(c => [c.user_id, c]));
  const perMode = db.prepare(`
    WITH best AS (
      SELECT s.user_id, s.mode, s.score, s.wave, s.ship, s.paint, s.mastery, s.created,
             ROW_NUMBER() OVER (
               PARTITION BY s.user_id, s.mode
               ORDER BY s.score DESC, s.created ASC, s.id ASC
             ) AS rn
      FROM scores s WHERE s.verdict = 'accepted'
    )
    SELECT b.user_id, u.name AS callsign, b.mode, b.score, b.wave, b.ship, b.paint, b.mastery, b.created
    FROM best b JOIN users u ON u.id = b.user_id
    WHERE b.rn = 1`).all();
  const byMode = new Map();
  for (const row of perMode) {
    if (!byMode.has(row.mode)) byMode.set(row.mode, []);
    byMode.get(row.mode).push(row);
  }
  const standings = [];
  for (const list of byMode.values()) {
    const ranked = competitionRank(list,
      (a, b) => b.score - a.score || a.created - b.created || a.user_id - b.user_id,
      (a, b) => a.score === b.score);
    standings.push(...ranked);
  }
  const worn = new Map();
  for (const p of db.prepare('SELECT user_id, data FROM profiles').all()) {
    try {
      const meta = JSON.parse(p.data).meta;
      worn.set(p.user_id, paintOk(meta && meta.paint));
    } catch (e) { worn.set(p.user_id, null); }
  }
  const seasonRuns = db.prepare(`
    SELECT s.user_id, u.name AS callsign, s.score, s.created
    FROM scores s JOIN users u ON u.id = s.user_id
    WHERE s.mode = 'main' AND s.verdict = 'accepted'`).all();
  const buckets = new Map();
  for (const run of seasonRuns) {
    const key = seasonKey(run.created) + '\0' + run.user_id;
    if (!buckets.has(key)) buckets.set(key, { season: seasonKey(run.created), deck_id: run.user_id, callsign: run.callsign, scores: [] });
    buckets.get(key).scores.push(run.score);
  }
  const bySeason = new Map();
  for (const row of buckets.values()) {
    row.scores.sort((a, b) => b - a);
    const top = row.scores.slice(0, 5);
    const item = {
      season: row.season, deck_id: row.deck_id, callsign: row.callsign,
      pts: top.reduce((a, b) => a + b, 0), runs: top.length, best: top[0]
    };
    if (!bySeason.has(row.season)) bySeason.set(row.season, []);
    bySeason.get(row.season).push(item);
  }
  const seasons = [];
  for (const list of bySeason.values()) {
    seasons.push(...competitionRank(list,
      (a, b) => b.pts - a.pts || b.best - a.best || a.callsign.localeCompare(b.callsign),
      (a, b) => a.pts === b.pts));
  }
  const scores = db.prepare(`
    SELECT s.id, s.user_id, s.mode, s.score, s.wave, s.ship, s.diff, s.created
    FROM scores s WHERE s.verdict = 'accepted'`).all();
  const days = db.prepare(`
    SELECT d.day,
      COUNT(DISTINCT d.user_id) AS pilots,
      COUNT(*) AS runs,
      MAX(d.best_score) AS top_score
    FROM daily_stats d GROUP BY d.day`).all();
  const tops = db.prepare(`
    SELECT d.day, u.name FROM daily_stats d JOIN users u ON u.id = d.user_id
    WHERE d.best_score = (SELECT MAX(x.best_score) FROM daily_stats x WHERE x.day = d.day)`).all();
  const topByDay = new Map(tops.map(t => [t.day, t.name]));
  return {
    pilots: pilots.map(p => ({ ...p, career: careerBy.get(p.id) || null, worn: worn.get(p.id) || null })),
    scores, standings, seasons,
    days: days.map(d => ({ ...d, top_pilot: topByDay.get(d.day) || null }))
  };
}

const iso = ms => ms ? new Date(ms).toISOString() : null;

/* ── transform: mirror rows ──────────────────────────────────────────── */
function rows() {
  const { pilots, scores, days, standings, seasons } = extract();
  const nowKey = seasonKey(Date.now());
  const seasonByPilot = new Map(seasons.filter(s => s.season === nowKey).map(s => [s.deck_id, s]));
  const modesByPilot = new Map();
  for (const row of standings) {
    if (!modesByPilot.has(row.user_id)) modesByPilot.set(row.user_id, {});
    modesByPilot.get(row.user_id)[row.mode] = row;
  }
  const modeCols = (bag, mode) => {
    const r = bag && bag[mode];
    return {
      [mode + '_score']: r ? r.score : null,
      [mode + '_wave']: r ? r.wave : null,
      [mode + '_ship']: r ? r.ship : null,
      [mode + '_paint']: r ? paintOk(r.paint) : null,
      [mode + '_mastery']: r ? (r.mastery || 0) : null,
      [mode + '_rank']: r ? r.rank : null
    };
  };
  return {
    pilots: pilots.map(p => ({
      deck_id: p.id, callsign: p.name, created_at: iso(p.created),
      last_seen_at: iso(p.last_seen), runs: p.runs,
      best_score: p.career ? p.career.score : 0,
      best_wave: p.career ? p.career.wave : 0,
      total_paid: p.total_paid, best_streak: p.best_streak,
      wardenfalls: p.wardenfalls
    })),
    scores: scores.map(s => ({
      deck_id: s.id, pilot: s.user_id, mode: s.mode, score: s.score,
      wave: s.wave, ship: s.ship, diff: s.diff, flown_at: iso(s.created)
    })),
    gauntlet_days: days.map(d => ({
      day: d.day, pilots: d.pilots, runs: d.runs, top_score: d.top_score, top_pilot: d.top_pilot
    })),
    deck_stats: [{
      id: 1,
      pilots: pilots.length,
      runs: scores.length,
      top_score: scores.reduce((m, s) => Math.max(m, s.score), 0),
      updated_at: new Date().toISOString()
    }],
    board_standings: standings.map(s => ({
      mode: s.mode, deck_id: s.user_id, callsign: s.callsign, score: s.score,
      wave: s.wave, ship: s.ship, paint: paintOk(s.paint), mastery: s.mastery || 0,
      rank: s.rank, flown_at: iso(s.created)
    })),
    seasons: seasons.map(s => ({
      season: s.season, deck_id: s.deck_id, callsign: s.callsign,
      pts: s.pts, runs: s.runs, best: s.best, rank: s.rank
    })),
    pilot_cards: pilots.map(p => {
      const bag = modesByPilot.get(p.id) || {};
      const season = seasonByPilot.get(p.id) || null;
      return {
        deck_id: p.id, callsign: p.name, since: iso(p.created), paint: p.worn,
        wardenfalls: p.wardenfalls, flew_days: p.flew_days, alloy_paid: p.total_paid,
        ...modeCols(bag, 'main'), ...modeCols(bag, 'daily'), ...modeCols(bag, 'rush'),
        season_key: season ? season.season : null,
        season_pts: season ? season.pts : null,
        season_runs: season ? season.runs : null,
        season_best: season ? season.best : null,
        season_rank: season ? season.rank : null
      };
    })
  };
}

const q = v => v === null ? 'null' : (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

function upsertSql(table, cols, rows, conflict) {
  if (!rows.length) return '';
  const keys = new Set(conflict.split(',').map(c => c.trim()));
  const values = rows.map(r => `(${cols.map(c => q(r[c])).join(', ')})`).join(',\n  ');
  const sets = cols.filter(c => !keys.has(c)).map(c => `${c} = excluded.${c}`).join(', ');
  return `insert into public.${table} (${cols.join(', ')}) values\n  ${values}\non conflict (${conflict}) do update set\n  ${sets};\n`;
}

function printSql() {
  const r = rows();
  /* deletions keep the mirror honest when rows leave the authoritative store */
  const keepPilots = r.pilots.map(p => p.deck_id);
  const keepScores = r.scores.map(s => s.deck_id);
  const keepDays = r.gauntlet_days.map(d => `'${d.day}'`);
  const sqlLit = v => String(v).replace(/'/g, "''");
  const keepStand = r.board_standings.map(s => `('${sqlLit(s.mode)}', ${s.deck_id})`);
  const keepSeasons = r.seasons.map(s => `('${sqlLit(s.season)}', ${s.deck_id})`);
  let out = `-- EMBERFALL public mirror — generated by tools/db-sync.mjs --print-sql\n`;
  out += `-- generated_at: ${new Date().toISOString()}\n`;
  out += `-- apply tools/mirror-schema.sql first, then this script\n\n`;
  if (keepScores.length) out += `delete from public.scores where deck_id not in (${keepScores.join(', ')});\n`;
  else out += `delete from public.scores;\n`;
  if (keepPilots.length) out += `delete from public.pilots where deck_id not in (${keepPilots.join(', ')});\n`;
  else out += `delete from public.pilots;\n`;
  if (keepDays.length) out += `delete from public.gauntlet_days where day not in (${keepDays.join(', ')});\n`;
  else out += `delete from public.gauntlet_days;\n`;
  if (keepStand.length) out += `delete from public.board_standings where (mode, deck_id) not in (${keepStand.join(', ')});\n`;
  else out += `delete from public.board_standings;\n`;
  if (keepSeasons.length) out += `delete from public.seasons where (season, deck_id) not in (${keepSeasons.join(', ')});\n`;
  else out += `delete from public.seasons;\n`;
  if (keepPilots.length) out += `delete from public.pilot_cards where deck_id not in (${keepPilots.join(', ')});\n`;
  else out += `delete from public.pilot_cards;\n`;
  out += '\n';
  out += upsertSql('pilots', ['deck_id', 'callsign', 'created_at', 'last_seen_at', 'runs', 'best_score', 'best_wave', 'total_paid', 'best_streak', 'wardenfalls'], r.pilots, 'deck_id');
  out += upsertSql('scores', ['deck_id', 'pilot', 'mode', 'score', 'wave', 'ship', 'diff', 'flown_at'], r.scores, 'deck_id');
  out += upsertSql('gauntlet_days', ['day', 'pilots', 'runs', 'top_score', 'top_pilot'], r.gauntlet_days, 'day');
  out += upsertSql('deck_stats', ['id', 'pilots', 'runs', 'top_score', 'updated_at'], r.deck_stats, 'id');
  out += upsertSql('board_standings', ['mode', 'deck_id', 'callsign', 'score', 'wave', 'ship', 'paint', 'mastery', 'rank', 'flown_at'], r.board_standings, 'mode, deck_id');
  out += upsertSql('seasons', ['season', 'deck_id', 'callsign', 'pts', 'runs', 'best', 'rank'], r.seasons, 'season, deck_id');
  out += upsertSql('pilot_cards', ['deck_id', 'callsign', 'since', 'paint', 'wardenfalls', 'flew_days', 'alloy_paid', 'main_score', 'main_wave', 'main_ship', 'main_paint', 'main_mastery', 'main_rank', 'daily_score', 'daily_wave', 'daily_ship', 'daily_paint', 'daily_mastery', 'daily_rank', 'rush_score', 'rush_wave', 'rush_ship', 'rush_paint', 'rush_mastery', 'rush_rank', 'season_key', 'season_pts', 'season_runs', 'season_best', 'season_rank'], r.pilot_cards, 'deck_id');
  process.stdout.write(out);
}

const CONFLICT = {
  pilots: 'deck_id',
  scores: 'deck_id',
  gauntlet_days: 'day',
  deck_stats: 'id',
  board_standings: 'mode,deck_id',
  seasons: 'season,deck_id',
  pilot_cards: 'deck_id'
};

async function restTableExists(base, headers, table) {
  const res = await fetch(`${base}/rest/v1/${table}?select=*&limit=0`, { headers });
  return res.ok;
}

async function restUpsert(base, headers, table, data) {
  if (!data.length) return 0;
  let pushed = 0;
  for (let i = 0; i < data.length; i += 500) {
    const chunk = data.slice(i, i + 500);
    const res = await fetch(`${base}/rest/v1/${table}?on_conflict=${CONFLICT[table]}`,
      { method: 'POST', headers, body: JSON.stringify(chunk) });
    if (!res.ok) {
      console.error(`db-sync: ${table} push failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    pushed += chunk.length;
  }
  console.log(`db-sync: ${table} ← ${data.length} row(s)`);
  return pushed;
}

/* Drop mirror rows the deck no longer has. Lists first, then deletes, so a
   failed list never turns into a wipe. */
async function restDeleteAbsent(base, headers, table, column, keep, quote) {
  const keepSet = new Set(keep.map(v => String(v)));
  const present = [];
  let from = 0;
  for (;;) {
    const res = await fetch(`${base}/rest/v1/${table}?select=${column}&limit=1000&offset=${from}`, { headers });
    if (!res.ok) {
      console.error(`db-sync: list ${table} failed ${res.status}`);
      process.exit(1);
    }
    const page = await res.json();
    for (const row of page) present.push(row[column]);
    if (page.length < 1000) break;
    from += 1000;
  }
  const gone = present.filter(id => !keepSet.has(String(id)));
  const lit = v => quote ? '"' + String(v).replace(/"/g, '') + '"' : encodeURIComponent(v);
  for (let i = 0; i < gone.length; i += 80) {
    const chunk = gone.slice(i, i + 80).map(lit).join(',');
    const del = await fetch(`${base}/rest/v1/${table}?${column}=in.(${chunk})`, { method: 'DELETE', headers });
    if (!del.ok) {
      console.error(`db-sync: delete ${table} failed ${del.status}: ${(await del.text()).slice(0, 200)}`);
      process.exit(1);
    }
  }
}

async function restDeletePairs(base, headers, table, keepPairs) {
  const keep = new Set(keepPairs);
  const rows = [];
  let from = 0;
  for (;;) {
    const res = await fetch(`${base}/rest/v1/${table}?select=*&limit=1000&offset=${from}`, { headers });
    if (!res.ok) {
      console.error(`db-sync: list ${table} failed ${res.status}`);
      process.exit(1);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
    from += 1000;
  }
  const keyOf = table === 'seasons'
    ? r => r.season + '\0' + r.deck_id
    : r => r.mode + '\0' + r.deck_id;
  const gone = rows.filter(r => !keep.has(keyOf(r)));
  for (const row of gone) {
    const filter = table === 'seasons'
      ? `season=eq.${encodeURIComponent(row.season)}&deck_id=eq.${row.deck_id}`
      : `mode=eq.${encodeURIComponent(row.mode)}&deck_id=eq.${row.deck_id}`;
    const del = await fetch(`${base}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers });
    if (!del.ok) {
      console.error(`db-sync: delete ${table} failed ${del.status}`);
      process.exit(1);
    }
  }
}

/* ── transport 1: REST push with the service key ─────────────────────── */
async function restPush() {
  const URL_ = process.env.SUPABASE_URL.replace(/\/$/, '');
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };
  const r = rows();
  let pushed = 0;
  for (const table of ['pilots', 'scores', 'gauntlet_days', 'deck_stats']) {
    pushed += await restUpsert(URL_, headers, table, r[table]);
  }
  await restDeleteAbsent(URL_, headers, 'scores', 'deck_id', r.scores.map(s => s.deck_id));
  await restDeleteAbsent(URL_, headers, 'pilots', 'deck_id', r.pilots.map(p => p.deck_id));
  await restDeleteAbsent(URL_, headers, 'gauntlet_days', 'day', r.gauntlet_days.map(d => d.day), true);
  const rich = await restTableExists(URL_, headers, 'board_standings');
  if (!rich) {
    console.log('db-sync: board_standings is not on the mirror yet — apply tools/mirror-schema.sql to publish per-mode boards, seasons and pilot cards');
  } else {
    for (const table of ['board_standings', 'seasons', 'pilot_cards']) {
      pushed += await restUpsert(URL_, headers, table, r[table]);
    }
    await restDeletePairs(URL_, headers, 'board_standings', r.board_standings.map(s => s.mode + '\0' + s.deck_id));
    await restDeletePairs(URL_, headers, 'seasons', r.seasons.map(s => s.season + '\0' + s.deck_id));
    await restDeleteAbsent(URL_, headers, 'pilot_cards', 'deck_id', r.pilot_cards.map(p => p.deck_id));
  }
  console.log(`db-sync: pushed ${pushed} row(s) to the mirror`);
}

/* ── transport 3: verify through the publishable key ─────────────────── */
async function verify() {
  const URL_ = process.env.SUPABASE_URL.replace(/\/$/, '');
  const KEY = process.env.SUPABASE_ANON_KEY;
  if (!KEY) { console.error('db-sync: --verify needs SUPABASE_ANON_KEY (the publishable key)'); process.exit(1); }
  const get = async (table, sel) => {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=${sel}`, { headers: { apikey: KEY } });
    if (!res.ok) { console.error(`db-sync: verify ${table} failed ${res.status}`); process.exit(1); }
    return res.json();
  };
  const r = rows();
  const [mp, ms, mg, md] = await Promise.all([
    get('pilots', 'deck_id,callsign,runs,best_score,best_wave'), get('scores', 'deck_id,pilot,score'),
    get('gauntlet_days', 'day,top_score'), get('deck_stats', 'pilots,runs,top_score')
  ]);
  let fail = 0;
  const eq = (a, b, what) => { if (a !== b) { console.error(`  MISMATCH ${what}: mirror=${a} deck=${b}`); fail++; } };
  eq(md[0]?.pilots, r.pilots.length, 'deck_stats.pilots');
  eq(md[0]?.runs, r.scores.length, 'deck_stats.runs');
  eq(mp.length, r.pilots.length, 'pilots row count');
  eq(ms.length, r.scores.length, 'scores row count');
  eq(mg.length, r.gauntlet_days.length, 'gauntlet_days row count');
  /* spot-check the top score end to end */
  const deckTop = r.deck_stats[0].top_score;
  eq(md[0]?.top_score, deckTop, 'deck_stats.top_score');
  const mirrorTop = Math.max(0, ...ms.map(s => s.score));
  eq(mirrorTop, deckTop, 'max(scores.score)');
  const standingsProbe = await fetch(`${URL_}/rest/v1/board_standings?select=mode,deck_id,score,rank&limit=1`, { headers: { apikey: KEY } });
  if (standingsProbe.status === 404) {
    console.log('db-sync: rich tables not published yet (tools/mirror-schema.sql) — classic totals still checked');
  } else if (!standingsProbe.ok) {
    console.error(`db-sync: verify board_standings failed ${standingsProbe.status}`);
    process.exit(1);
  } else {
    const [boards, seasons, cards] = await Promise.all([
      get('board_standings', 'mode,deck_id,score,rank'),
      get('seasons', 'season,deck_id,pts,rank'),
      get('pilot_cards', 'deck_id,callsign,main_score')
    ]);
    eq(boards.length, r.board_standings.length, 'board_standings row count');
    eq(seasons.length, r.seasons.length, 'seasons row count');
    eq(cards.length, r.pilot_cards.length, 'pilot_cards row count');
  }
  if (fail === 0) {
    console.log(`db-sync: mirror verified — ${mp.length} pilots, ${ms.length} scores, ${mg.length} gauntlet days, top ${deckTop}`);
  } else {
    console.error(`db-sync: ${fail} mismatch(es) — re-run the sync`);
    process.exit(1);
  }
}

const arg = process.argv[2] || '';
if (arg === '--print-sql') printSql();
else if (arg === '--verify') await verify();
else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) await restPush();
else {
  console.log('db-sync: mirror pump (ADR 0001). Nothing to do — either:');
  console.log('  SUPABASE_URL + SUPABASE_SERVICE_KEY set  → REST push');
  console.log('  node tools/db-sync.mjs --print-sql       → idempotent SQL to stdout');
  console.log('  SUPABASE_URL + SUPABASE_ANON_KEY set, --verify → verify via anon read');
  console.log(`  (deck database: ${DB_PATH})`);
}
