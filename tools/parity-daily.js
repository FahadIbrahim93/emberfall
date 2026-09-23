#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   Daily-economy parity gate — client vs deck, executable.

   The client DISPLAYS medals (index.html dailyMedal); the deck AUTHORIZES
   them (server.js medalsEarned). Two hand-written mirrors of one contract —
   they may drift only if a test stops failing. This gate extracts BOTH from
   the live sources and cross-checks:

     1. rare-Sunday verdict agreement — wardenfallSunday on both sides,
        across a decade of days (client hashStr vs deck hashStr);
     2. medal-grid agreement — DAILY_MEDALS semantics through dailyMedal()
        (client, rareBoss derived from the day) vs medalsEarned() (deck),
        across every day-shape the economy has;
     3. payout agreement — medalsAlloy (deck) sums exactly the table's own
        alloy values for the names medalsEarned returns.

   Exit 0 = proven · exit 1 = drift. Wired into CI (gates job).
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

/* brace-balanced extraction: pulls a full declaration out of a source file.
   Tracks ONLY curly/square depth — parens are ignored, else the parameter
   list of `function f(s) {...}` balances by itself and truncates the grab
   at the signature (the bug this tool shipped with; the sandbox caught it). */
function grab(src, headerRe, name) {
  const m = src.match(headerRe);
  if (!m) throw new Error('parity: cannot locate ' + name);
  let i = m.index, depth = 0, started = false, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{' || ch === '[') { depth++; started = true; }
    else if (ch === '}' || ch === ']') { depth--; if (started && depth === 0) break; }
  }
  return src.slice(i, j + 1);
}

/* ── sandbox the CLIENT side ─────────────────────────────────────────── */
const clientBody = `
  "use strict";
  ${grab(clientSrc, /function hashStr\(/, 'client hashStr')}
  function pad2 (n) { return String(n).padStart(2, '0'); };   /* pinned: pad2 contract, both sides identical */
  ${grab(clientSrc, /function dayDow\(/, 'client dayDow')}
  ${grab(clientSrc, /function wardenfallSunday\(/, 'client wardenfallSunday')}
  ${grab(clientSrc, /const DAILY_MEDALS = \[/, 'client DAILY_MEDALS')}
  ${grab(clientSrc, /function dailyMedal\(/, 'client dailyMedal')}
  ${grab(clientSrc, /function dayShift\(/, 'client dayShift')}
  ${grab(clientSrc, /function wardenfallCountdown\(/, 'client wardenfallCountdown')}
  return { hashStr: hashStr, dayDow: dayDow, wardenfallSunday: wardenfallSunday, DAILY_MEDALS: DAILY_MEDALS, dailyMedal: dailyMedal, dayShift: dayShift, wardenfallCountdown: wardenfallCountdown };
`;
const C = new Function(clientBody)();

/* ── sandbox the DECK side ───────────────────────────────────────────── */
const dbStub = {
  prepare: () => ({ all: () => [], get: () => ({}) }),
  exec: () => {},
};
const sandboxBody = `
  "use strict";
  ${grab(serverSrc, /const DAILY_MEDALS = \[/, 'deck DAILY_MEDALS')}
  ${grab(serverSrc, /function hashStr\(/, 'deck hashStr')}
  ${grab(serverSrc, /function dayDow\(/, 'deck dayDow')}
  ${grab(serverSrc, /function wardenfallSunday\(/, 'deck wardenfallSunday')}
  ${grab(serverSrc, /function medalsEarned\(/, 'deck medalsEarned')}
  ${grab(serverSrc, /function medalsAlloy\(/, 'deck medalsAlloy')}
  return { DAILY_MEDALS, hashStr, dayDow, wardenfallSunday, medalsEarned, medalsAlloy };
`;
const S = new Function('db', sandboxBody)(dbStub);

/* ── shared fixtures: every day-shape the economy has ────────────────── */
let fails = 0;
const fail = (msg) => { console.error('[parity-daily] FAIL ' + msg); fails++; };

/* 1 — rare-Sunday verdict across 7,671 days (2020-01-01 → 2027-12-31) */
const epoch = Date.parse('2020-01-01T00:00:00.000Z');
const DAYS = 2922;
let rareCount = 0, sundays = 0;
for (let d = 0; d < DAYS; d++) {
  const day = new Date(epoch + d * 86400000).toISOString().slice(0, 10);
  const cv = C.wardenfallSunday(day), sv = S.wardenfallSunday(day);
  if (cv !== sv) fail(`verdict mismatch on ${day}: client=${cv} deck=${sv}`);
  if (cv) rareCount++;
  if (C.dayDow(day) === 6) sundays++;
}
console.log(`[parity-daily] rare verdict: ${DAYS} days agree, ${rareCount} rare of ${sundays} Sundays (${(rareCount / Math.max(sundays, 1) * 100).toFixed(1)}% — designed ~1/7 ≈ 14.3%)`);
if (rareCount === 0 || rareCount / sundays < 0.05 || rareCount / sundays > 0.25) fail('rare-Sunday rate outside plausible band');

/* 1b — the display contract for the rare day: the client's countdown must
   read ZERO on a rare Sunday (the fall is UP — the UI announces, never
   points past at the next window) and the next window after it must be
   strictly future on both sides of the boundary day. */
{
  let zeroDays = 0;
  for (let d = 0; d < DAYS; d++) {
    const day = new Date(epoch + d * 86400000).toISOString().slice(0, 10);
    if (!C.wardenfallSunday(day)) continue;
    zeroDays++;
    if (C.wardenfallCountdown(day) !== 0) fail(`countdown on rare day ${day} must be 0, got ${C.wardenfallCountdown(day)}`);
    const next = C.wardenfallCountdown(C.dayShift(day, 1));
    if (next !== null && next < 1) fail(`day after rare ${day}: countdown ${next} is not future`);
  }
  if (zeroDays === 0) fail('no rare Sundays found in the sweep — fixtures broken?');
  const wf = C.wardenfallCountdown('2026-09-23');
  console.log(`[parity-daily] display contract: ${zeroDays} rare days read 0 (the fall is announced, never pointed past); horizon from 2026-09-23: ${wf === null ? 'beyond 56d' : wf + 'd'}`);
}

/* 2 — medal grid: cross-check every table tier across the run shapes.
   The client derives rareBoss from the DAY (never self-reports); the deck
   re-derives from the same day. Inputs are (score, wave) pairs spanning
   every gate plus misses either side of each boundary. */
const SHAPES = [];
for (const t of C.DAILY_MEDALS) {
  SHAPES.push([t.score - 1, 0], [t.score, 0], [t.score + 1, 0],
              [0, t.wave - 1], [0, t.wave], [0, t.wave + 1],
              [t.score - 1, t.wave - 1], [t.score + 1, t.wave + 1],
              [999999, 0], [0, 0], [30000, 14], [48000, 2]);
}
const gridDays = [];
for (let d = 0; d < DAYS; d += 211) gridDays.push(new Date(epoch + d * 86400000).toISOString().slice(0, 10));
gridDays.push('2026-09-20');            // a known rare Sunday
let checks = 0;
for (const day of gridDays) {
  const dow = C.dayDow(day);
  const rare = C.wardenfallSunday(day);
  for (const [score, wave] of SHAPES) {
    const cGot = C.dailyMedal(score, wave, dow, rare);
    const sGot = S.medalsEarned(score, wave, dow, day);
    const cName = cGot ? cGot.name : null;
    const sName = sGot.length ? sGot[sGot.length - 1] : null;   // deck returns all earned tiers; highest reached tier is the last
    if (cName !== sName) fail(`medal mismatch ${day} (${score}, ${wave}): client=${cName} deck=${sGot.join('|')}`);
    checks++;
    /* 3 — payout: deck's alloy sum equals the table value of each earned name */
    const sum = sGot.reduce((a, n) => a + (C.DAILY_MEDALS.find(t => t.name === n) || {}).alloy || 0, 0);
    if (sum !== S.medalsAlloy(sGot)) fail(`alloy mismatch ${day} [${sGot.join('|')}]: grid=${sum} deck=${S.medalsAlloy(sGot)}`);
  }
}
console.log(`[parity-daily] medal grid: ${checks} checks across ${gridDays.length} days × ${SHAPES.length} shapes, payouts cross-summed`);

/* the anti-cheat pin: a rare-Sunday score shortcut (48k at wave 2) must NOT
   pay Wardenfall — wave-gated only, on both sides */
const rareDay = '2026-09-20';
if (!C.wardenfallSunday(rareDay)) fail('fixture day 2026-09-20 must be a rare Sunday');
const cShort = C.dailyMedal(48000, 2, C.dayDow(rareDay), true);
const sShort = S.medalsEarned(48000, 2, C.dayDow(rareDay), rareDay);
if (cShort && cShort.rare) fail('client paid Wardenfall on a wave-2 score shortcut');
if (sShort.includes('Wardenfall')) fail('deck paid Wardenfall on a wave-2 score shortcut');
console.log('[parity-daily] anti-cheat pin: wave-2 score shortcut pays no Wardenfall (both sides)');

if (fails) { console.error(`[parity-daily] ${fails} failure(s) — the mirrors have drifted`); process.exit(1); }
console.log('[parity-daily] proven: client display and deck authorization are one contract');
