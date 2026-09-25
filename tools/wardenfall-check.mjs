#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   wardenfall-check.mjs — the rare-Sunday verdict, computable anywhere.

   Wardenfall flies when dayDow(day) === 6 (Sunday) AND
   hashStr('warden-' + day) % 7 === 0 — FNV-1a over the day string, the
   exact recipe server.js and the client's payload both carry. This tool
   re-derives the verdict INDEPENDENTLY (no deck, no DB, no network) so
   ops can answer "is today the day / what pays what" in one command:

     node tools/wardenfall-check.mjs                → today (UTC)
     node tools/wardenfall-check.mjs 2026-09-27     → a specific day

   Proves, for the target day:
     • the rare verdict itself (Sunday + FNV gate),
     • the payout table (wave-15 vs wave-16 on a rare day differ ONLY by
       the honor — Solar Guard is a non-rare Sunday medal whose 40,000
       score gate pays at 48k on ANY Sunday; the honor is wave-gated),
     • the alloy totals (base medals + honor),
     • the horizon census: every rare Sunday in 2026-2036 and the next
       five after the target day (matches the rehearsal drill's day).

   Exit 0 = verdict math consistent with the drill's pinned day
   · exit 1 = a verdict contradicts the rehearsal contract.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

/* ── the deck's exact recipe (server.js hashStr/dayDow/wardenfallSunday) ── */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const dayDow = day => (Date.parse(day + 'T00:00:00.000Z') / 86400000 + 3) % 7;   /* Monday = 0 */
const wardenfallSunday = day => dayDow(day) === 6 && hashStr('warden-' + day) % 7 === 0;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ── the deck's payout table (server.js DAILY_MEDALS) ── */
const DAILY_MEDALS = [
  { id: 'crest',     name: 'Crest',       wave: 5,  score: 4000,  alloy: 120 },
  { id: 'crown',     name: 'Crown',       wave: 10, score: 12000, alloy: 260 },
  { id: 'eclipse',   name: 'Eclipse',     wave: 15, score: 26000, alloy: 450 },
  { id: 'solar',     name: 'Solar Guard', wave: 20, score: 40000, alloy: 800, dow: 6 },
  { id: 'wardenfall', name: 'Wardenfall', wave: 16, score: 48000, alloy: 1000, dow: 6, rare: true }
];
function medalsEarned(score, wave, dow, day) {
  const out = [];
  for (const t of DAILY_MEDALS) {
    if (t.dow !== undefined && t.dow !== dow) continue;
    if (t.rare && !(day && wardenfallSunday(day))) continue;
    if (wave >= t.wave || (!t.rare && score >= t.score)) out.push(t.name);
  }
  return out;
}
const alloyOf = names => DAILY_MEDALS.reduce((s, t) => s + (names.includes(t.name) ? t.alloy : 0), 0);

/* ── horizon census ── */
function rareSundays(fromYear, toYear) {
  const out = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (let d = 1; d <= last; d++) {
        const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (wardenfallSunday(day)) out.push(day);
      }
    }
  }
  return out;
}

/* ── report ── */
let fail = 0;
const good = m => console.log('  ok  -', m);
const bad  = m => { fail++; console.log('  FAIL-', m); };
const say  = (...a) => console.log(...a);

function checkPayout(tag, wave, score, day, expectNames, expectAlloy) {
  const dow = dayDow(day);
  const names = medalsEarned(score, wave, dow, day);
  const alloy = alloyOf(names);
  const same = names.length === expectNames.length && expectNames.every(n => names.includes(n));
  same && alloy === expectAlloy
    ? good(`${tag}: ${names.join(' + ') || 'nothing'} = ${alloy} alloy`)
    : bad(`${tag}: got [${names.join(', ')}]=${alloy}, expected [${expectNames.join(', ')}]=${expectAlloy}`);
}

function main() {
  const arg = process.argv[2] || new Date().toISOString().slice(0, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : null;
  if (!day) { console.error('usage: node tools/wardenfall-check.mjs [YYYY-MM-DD]'); process.exit(1); }

  say(`── the verdict for ${day} (dow=${DOW[dayDow(day)]})`);
  const isSunday = dayDow(day) === 6;
  const gate = hashStr('warden-' + day) % 7 === 0;
  isSunday ? good('the day IS a Sunday (dow gate passes)') : say('       not a Sunday — the dow gate stays shut (informational, not a failure)');
  say(`       FNV-1a('warden-${day}') = 0x${hashStr('warden-' + day).toString(16)} → %7 = ${hashStr('warden-' + day) % 7}`);
  const rare = wardenfallSunday(day);
  gate === rare ? good(`the FNV gate ${gate ? 'OPENS' : 'stays shut'} — verdict: ${rare ? 'WARDENFALL IS UP' : 'an ordinary Sunday'}`)
                : bad('gate and verdict disagree — the recipe is broken');
  if (!rare && day === '2026-09-27') bad('2026-09-27 was rehearsed as rare (drill-rare-sunday) but the math says no');

  say('── payout table on this day (server-authorized, wave-gated honor)');
  checkPayout('wave-15 @ 48,000 score', 15, 48000, day, isSunday ? ['Crest', 'Crown', 'Eclipse', 'Solar Guard'] : ['Crest', 'Crown', 'Eclipse'], isSunday ? 1630 : 830);
  if (rare) {
    checkPayout('wave-15 (escort pays by score; the honor must NOT)', 15, 48000, day, ['Crest', 'Crown', 'Eclipse', 'Solar Guard'], 1630);
    checkPayout('wave-16 (the capital falls)', 16, 48000, day, ['Crest', 'Crown', 'Eclipse', 'Solar Guard', 'Wardenfall'], 2630);
    checkPayout('wave-20 (capital + escort, same five)', 20, 48000, day, ['Crest', 'Crown', 'Eclipse', 'Solar Guard', 'Wardenfall'], 2630);
  } else if (isSunday) {
    checkPayout('wave-16 (no rare boss — no honor)', 16, 48000, day, ['Crest', 'Crown', 'Eclipse', 'Solar Guard'], 1630);
    checkPayout('wave-20 (same four)', 20, 48000, day, ['Crest', 'Crown', 'Eclipse', 'Solar Guard'], 1630);
  } else {
    checkPayout('wave-15 (weekday: no Sunday gates)', 15, 48000, day, ['Crest', 'Crown', 'Eclipse'], 830);
    checkPayout('wave-20 (weekday: escort never flies)', 20, 48000, day, ['Crest', 'Crown', 'Eclipse'], 830);
  }

  say('── horizon census (2026-2036)');
  const all = rareSundays(2026, 2036);
  good(`${all.length} rare Sundays across 2026-2036 (~1 in 7 Sundays clears the FNV gate)`);
  const upcoming = all.filter(d => d >= day).slice(0, 5);
  upcoming.length ? good(`next from ${day}: ${upcoming.join(', ')}`) : bad('no rare Sundays found after ' + day);
  if (rare && !all.includes(day)) bad(`${day} reads rare but is absent from the horizon scan`);

  say(`── verdict: ${fail === 0 ? 'WARDENFALL-CHECK: ALL GREEN' : fail + ' FAILURES ABOVE'}`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
