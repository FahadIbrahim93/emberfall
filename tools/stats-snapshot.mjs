#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   stats-snapshot.mjs — the README's living badge, keyless.

   Reads the PUBLIC deck totals from the Supabase mirror through the
   PUBLISHABLE key (safe by design: RLS grants anon read-only) and writes
   docs/stats.json. A scheduled GitHub Action commits the file when it
   changes; shields.io's dynamic-json badge renders it on the README.

   No secrets: the URL and key below are the public ones (ADR 0001 —
   the world may read; no one may write).

     node tools/stats-snapshot.mjs            # refresh docs/stats.json
     node tools/stats-snapshot.mjs --check    # exit 1 if it would change (CI drift gate)
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'stats.json');
const URL_ = (process.env.SUPABASE_URL || 'https://bhcczyyhadornihhzpsu.supabase.co').replace(/\/$/, '');
const KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_rcBoR0FTobKUc_2-QqH2fQ_jS4mqd5O';

const res = await fetch(`${URL_}/rest/v1/deck_stats?select=pilots,runs,top_score,updated_at`, {
  headers: { apikey: KEY }
});
if (!res.ok) {
  console.error(`stats-snapshot: mirror read failed ${res.status}`);
  process.exit(1);
}
const rows = await res.json();
if (!rows.length) {
  console.error('stats-snapshot: mirror has no deck_stats row — run tools/db-sync.mjs first');
  process.exit(1);
}
const next = JSON.stringify({
  pilots: rows[0].pilots,
  runs: rows[0].runs,
  topScore: rows[0].top_score,
  asOf: rows[0].updated_at
}, null, 2) + '\n';

const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (prev === next) {
  console.log('stats-snapshot: docs/stats.json already current (' + next.replace(/\n/g, ' ').trim() + ')');
  process.exit(process.argv[2] === '--check' ? 0 : 0);
}
if (process.argv[2] === '--check') {
  console.error('stats-snapshot: docs/stats.json is stale — run tools/stats-snapshot.mjs and commit');
  process.exit(1);
}
fs.writeFileSync(OUT, next);
console.log('stats-snapshot: docs/stats.json ← ' + next.replace(/\n/g, ' ').trim());
