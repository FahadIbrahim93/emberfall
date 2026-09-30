#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   mirror-alarm.mjs — the public mirror's smoke detector (keyless).

   Reads ONLY public data (the publishable key every visitor already
   holds) and fails loudly when the mirror is lying to the world:

     1. UNREACHABLE — the stats page and the deckless Global tab both
                      degrade; the world loses its leaderboard.
     2. STALE       — deck_stats.updated_at older than STALE_HOURS (24)
                      means the sync pump died silently and the world is
                      reading yesterday's board as today's.
     3. CONTAMINATED — pilots whose callsign matches the machine patterns
                      this project's batteries generate (Pilot-Ace-Trav-
                      Drill-Rival-TestPilot-Dbg families): the 2026-09-26
                      incident class (battery rows seeded into production,
                      purged from the deck but left on the mirror — found
                      and purged 2026-09-30). The fence extends to the
                      mirror: if machine pilots appear on the public
                      board, this alarm goes off.

   Exit 0 = mirror honest · exit 1 = alarm (page the operator).
   Keys: none. Never touches the deck, never holds a service key.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const URL_ = 'https://bhcczyyhadornihhzpsu.supabase.co/rest/v1';
const KEY = 'sb_publishable_rcBoR0FTobKUc_2-QqH2fQ_jS4mqd5O';
const STALE_HOURS = Number(process.env.MIRROR_STALE_HOURS || 24);
/* the battery/drill callsign generators: server.js (Pilot/Ace + Math.random),
   drills (Drillmy*pA.., Trav<7>, Rival<3>), spec/test helpers (TestPilot,
   Dbg + digits). A HUMAN callsign matching these is astronomically unlikely
   and, if one ever does, the alarm message says exactly what to check. */
const MACHINE = /^(Pilot\d+|Ace\d+|Drill[a-z0-9]{0,10}(p[A-C]|[A-C])?|Trav[a-z0-9]{6}|Rival\d{1,4}|TestPilot\d+|Dbg\d+)$/;

let fail = 0;
const alarm = m => { fail++; console.error('  ALARM-', m); };
const ok = m => console.log('  ok  -', m);

async function main() {
  console.log(`── the public mirror, read through the world's publishable key`);
  const get = async (table, sel) => {
    const ctl = new AbortController();
    const kill = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(`${URL_}/${table}?select=${sel}`, { headers: { apikey: KEY }, signal: ctl.signal });
      if (!r.ok) throw new Error(`${table} ${r.status}`);
      return await r.json();
    } finally { clearTimeout(kill); }
  };

  let stats, pilots;
  try {
    [stats, pilots] = await Promise.all([get('deck_stats', 'pilots,runs,top_score,updated_at'), get('pilots', 'deck_id,callsign,best_score,created_at')]);
  } catch (e) {
    alarm(`mirror UNREACHABLE (${String(e && e.message || e).slice(0, 80)}) — stats.html and the deckless Global tab are degraded`);
    process.exitCode = 1;
    return;   /* drain naturally: a forced exit after fetches crashes win libuv and lies about the code */
  }
  ok('the mirror answers');

  const s = stats && stats[0];
  if (!s) { alarm('deck_stats row missing — the sync has never run or was wiped'); }
  else {
    const ageH = (Date.now() - Date.parse(s.updated_at)) / 3600000;
    if (!Number.isFinite(ageH)) alarm(`deck_stats.updated_at unparsable: ${JSON.stringify(s.updated_at)}`);
    else if (ageH > STALE_HOURS) alarm(`mirror is STALE: updated ${ageH.toFixed(1)}h ago (> ${STALE_HOURS}h) — the sync pump died silently`);
    else ok(`freshness: updated ${ageH < 1 ? 'under an' : ageH.toFixed(0) + ''} hour${ageH < 1 ? '' : 's'} ago`);
    if (Number(s.pilots) !== pilots.length) {
      alarm(`deck_stats.pilots (${s.pilots}) ≠ pilots rows (${pilots.length}) — the mirror disagrees with itself`);
    } else ok(`self-consistent: ${pilots.length} pilot row(s)`);
  }

  const machines = pilots.filter(p => MACHINE.test(p.callsign));
  if (machines.length) {
    alarm(`${machines.length} MACHINE-PILOT callsign(s) on the PUBLIC board — the 2026-09-26 contamination class:`);
    for (const m of machines.slice(0, 8)) console.error(`    ${m.callsign} (best ${m.best_score})`);
    if (machines.length > 8) console.error(`    … and ${machines.length - 8} more`);
    console.error(`  remediation: purge via tools/db-sync.mjs --print-sql (deck is authority) and re-sync.`);
  } else {
    ok('no machine-pilot callsigns on the public board (the fence holds)');
  }

  if (fail === 0) console.log('MIRROR-ALARM: the mirror is honest');
  else console.error(`MIRROR-ALARM: ${fail} alarm(s) — the world is being misled; fix before the next pilot looks`);
  process.exitCode = fail === 0 ? 0 : 1;   /* natural drain: the exit code must be trustworthy */
}

main().catch(e => { console.error('mirror-alarm harness error:', e); process.exit(1); });
