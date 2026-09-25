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
        Upserts pilots, scores, gauntlet days and deck_stats through the
        PostgREST bulk endpoint with Prefer: resolution=merge-duplicates.

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
   gauntlet aggregates. It never receives password hashes, session tokens,
   checkpoint telemetry, profile JSON or the save vault.

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

/* ── extract: public facts only ──────────────────────────────────────── */
function extract() {
  const pilots = db.prepare(`
    SELECT u.id, u.name, u.created, u.last_seen,
      (SELECT COUNT(*) FROM scores s WHERE s.user_id = u.id AND s.verdict = 'accepted') AS runs,
      (SELECT COALESCE(MAX(s.score), 0) FROM scores s WHERE s.user_id = u.id AND s.verdict = 'accepted') AS best_score,
      (SELECT COALESCE(MAX(s.wave), 0) FROM scores s WHERE s.user_id = u.id AND s.verdict = 'accepted') AS best_wave,
      (SELECT COALESCE(SUM(d.paid), 0) FROM daily_stats d WHERE d.user_id = u.id) AS total_paid,
      (SELECT COALESCE(MAX(d.streak), 0) FROM daily_stats d WHERE d.user_id = u.id) AS best_streak,
      (SELECT COUNT(*) FROM daily_stats d WHERE d.user_id = u.id AND d.wardenfall = 1) AS wardenfalls
    FROM users u`).all();
  const scores = db.prepare(`
    SELECT s.id, s.user_id, s.mode, s.score, s.wave, s.ship, s.diff, s.created
    FROM scores s WHERE s.verdict = 'accepted'`).all();
  const days = db.prepare(`
    SELECT d.day,
      COUNT(DISTINCT d.user_id) AS pilots,
      COUNT(*) AS runs,
      MAX(d.best_score) AS top_score
    FROM daily_stats d GROUP BY d.day`).all();
  /* gauntlet day winners need names — one join, not per-day */
  const tops = db.prepare(`
    SELECT d.day, u.name FROM daily_stats d JOIN users u ON u.id = d.user_id
    WHERE d.best_score = (SELECT MAX(x.best_score) FROM daily_stats x WHERE x.day = d.day)`).all();
  const topByDay = new Map(tops.map(t => [t.day, t.name]));
  return { pilots, scores, days: days.map(d => ({ ...d, top_pilot: topByDay.get(d.day) || null })) };
}

const iso = ms => ms ? new Date(ms).toISOString() : null;

/* ── transform: mirror rows ──────────────────────────────────────────── */
function rows() {
  const { pilots, scores, days } = extract();
  return {
    pilots: pilots.map(p => ({
      deck_id: p.id, callsign: p.name, created_at: iso(p.created),
      last_seen_at: iso(p.last_seen), runs: p.runs, best_score: p.best_score,
      best_wave: p.best_wave, total_paid: p.total_paid, best_streak: p.best_streak,
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
      top_score: scores.reduce((m, s) => Math.max(m, s.score), 0)
    }]
  };
}

const q = v => v === null ? 'null' : (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

function upsertSql(table, cols, rows, conflict) {
  if (!rows.length) return '';
  const values = rows.map(r => `(${cols.map(c => q(r[c])).join(', ')})`).join(',\n  ');
  return `insert into public.${table} (${cols.join(', ')}) values\n  ${values}\non conflict (${conflict}) do update set\n  ${cols.filter(c => !conflict.includes(c)).map(c => `${c} = excluded.${c}`).join(', ')};\n`;
}

function printSql() {
  const r = rows();
  /* deletions keep the mirror honest when rows leave the authoritative store */
  const keepPilots = r.pilots.map(p => p.deck_id);
  const keepScores = r.scores.map(s => s.deck_id);
  const keepDays = r.gauntlet_days.map(d => `'${d.day}'`);
  let out = `-- EMBERFALL public mirror — generated by tools/db-sync.mjs --print-sql\n`;
  out += `-- generated_at: ${new Date().toISOString()}\n`;
  out += `-- apply with: supabase console / psql / any elevated SQL path\n\n`;
  if (keepScores.length) out += `delete from public.scores where deck_id not in (${keepScores.join(', ')});\n`;
  if (keepPilots.length) out += `delete from public.pilots where deck_id not in (${keepPilots.join(', ')});\n`;
  else out += `delete from public.pilots;\n`;
  if (keepDays.length) out += `delete from public.gauntlet_days where day not in (${keepDays.join(', ')});\n`;
  out += '\n';
  out += upsertSql('pilots', ['deck_id', 'callsign', 'created_at', 'last_seen_at', 'runs', 'best_score', 'best_wave', 'total_paid', 'best_streak', 'wardenfalls'], r.pilots, ['deck_id']);
  out += upsertSql('scores', ['deck_id', 'pilot', 'mode', 'score', 'wave', 'ship', 'diff', 'flown_at'], r.scores, ['deck_id']);
  out += upsertSql('gauntlet_days', ['day', 'pilots', 'runs', 'top_score', 'top_pilot'], r.gauntlet_days, ['day']);
  out += upsertSql('deck_stats', ['id', 'pilots', 'runs', 'top_score', 'updated_at'], r.deck_stats.map(d => ({ ...d, updated_at: new Date().toISOString() })), ['id']);
  process.stdout.write(out);
}

/* ── transport 1: REST push with the service key ─────────────────────── */
async function restPush() {
  const URL_ = process.env.SUPABASE_URL.replace(/\/$/, '');
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=representation'
  };
  const r = rows();
  let pushed = 0;
  for (const [table, data] of [['pilots', r.pilots], ['scores', r.scores], ['gauntlet_days', r.gauntlet_days], ['deck_stats', r.deck_stats]]) {
    if (!data.length) continue;
    /* PostgREST caps payload size; chunk conservatively */
    for (let i = 0; i < data.length; i += 500) {
      const chunk = data.slice(i, i + 500);
      const res = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${table === 'gauntlet_days' ? 'day' : 'deck_id'}`,
        { method: 'POST', headers, body: JSON.stringify(chunk) });
      if (!res.ok) {
        console.error(`db-sync: ${table} push failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
        process.exit(1);
      }
      pushed += chunk.length;
    }
    console.log(`db-sync: ${table} ← ${data.length} row(s)`);
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
    get('pilots', 'deck_id,callsign,runs,best_score'), get('scores', 'deck_id,pilot,score'),
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
