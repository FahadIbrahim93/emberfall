/**
 * stubguard — "never again a stub on main".
 *
 * On 2026-09-21 a four-commit chain landed on main that replaced index.html
 * (7,901 lines) with a 14-line placeholder page. It was valid HTML with no
 * JS to parse, so lightweight gates had nothing to trip over; CI went red
 * further down the battery and the Pages deploy was (correctly) blocked.
 * This gate runs FIRST and fails FAST if the payload ever stops looking
 * like the game — with the incident story in the message so the next
 * engineer knows exactly what they are looking at.
 *
 * Wired into check.sh (CI "Syntax gate" step), so a stub dies in seconds,
 * not minutes, and with a message instead of a mystery.
 */
'use strict';
const fs = require('fs');

const INCIDENT = `
  ┌─────────────────────────────────────────────────────────────────────┐
  │  STUB GUARD TRIPPED — index.html is not the game.                   │
  │                                                                     │
  │  On 2026-09-21 a broken chain (695bf47..c381255) replaced the whole │
  │  payload with a 14-line "temporary restore" placeholder and main    │
  │  went red. Do not push this. Fix by restoring the full payload:     │
  │                                                                     │
  │    git log --oneline -20 -- index.html   # find the last good commit│
  │    git checkout <good-sha> -- index.html sw.js                      │
  │                                                                     │
  │  or, if a live deploy exists, take its payload:                     │
  │    curl -fsS https://fahadibrahim93.github.io/emberfall/ > index.html
  └─────────────────────────────────────────────────────────────────────┘
`;

const s = fs.readFileSync('index.html', 'utf8');
/* ADR 0003: the four data catalogs moved into js/catalog.js — the single-path
   runtime the client loads as a classic script. The stub floors read the same
   expressions from their new home; PAINTS/DONATIONS remain in the payload. */
let catalog = null;
try { catalog = fs.readFileSync('js/catalog.js', 'utf8'); } catch { catalog = null; }
const lines = s.split('\n').length;
const bad = [];

const blockOf = name => {
  const m = s.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\n\\];'));
  return m ? m[1] : null;
};
const rows = (txt, re) => (txt ? (txt.match(re) || []).length : 0);

// 1) size floor — the real payload is ~7,900 lines; a shell is < 100.
if (lines < 4000) bad.push(`payload is ${lines} lines — the game is ~7,900 (a stub overwrote it?)`);

// 2) version stamp — release discipline means every real payload has one.
if (!/EMBERFALL v\d+\.\d+\.\d+/.test(s)) bad.push('no version stamp (EMBERFALL vX.Y.Z) anywhere in the payload');

// 3) the load contract — classic scripts before the inline core.
for (const mod of ['audio', 'sky', 'art', 'net', 'input', 'catalog']) {
  if (!s.includes(`js/${mod}.js`)) bad.push(`load contract broken: no reference to js/${mod}.js`);
}
if (catalog === null) bad.push('js/catalog.js unreadable — the single-path content catalog runtime is missing');

// 4) the data catalogs — the game IS these tables; a stub has none. Since the
// ADR 0003 single-path migration the four combat/tour tables live in
// js/catalog.js (block() reads them there); PAINTS/DONATIONS stay inline.
// Row patterns are calibrated to each declaration's real format (FOES is an
// object literal; WEAPONS tier rows have no id at all — read, don't guess).
const block = (head, tail) => {
  const src = head.startsWith('const FOES') || head.startsWith('const WEAPONS') ||
    head.startsWith('const BOSSES') || head.startsWith('const STAGES') ? catalog : s;
  if (!src) return null;
  const a = src.indexOf(head);
  if (a < 0) return null;
  const b = src.indexOf(tail, a);
  return b < 0 ? null : src.slice(a, b);
};
const blocks = {
  FOES: block('const FOES = {', '\n};'),
  WEAPONS: block('const WEAPONS = [', '\n];'),
  BOSSES: block('const BOSSES = [', '\n];'),
  STAGES: block('const STAGES = [', '\n];'),
  PAINTS: block('const PAINTS = [', '\n];'),
  DONATIONS: block('const DONATIONS = [', '\n];'),
};
const floors = [
  /* patterns avoid $ anchors: the working tree mixes LF/CRLF, and both are
     legal — the guard must count rows, not line endings */
  ['FOES', 20, /\n  [a-z]+: \{/g],      // 'drone: {', 'striker: {', …
  ['WEAPONS', 6, /\n  \{ lanes/g],      // tier rows carry lanes, not ids
  ['BOSSES', 4, /id: '/g],              // dreadnought, matriarch, tyrant, gatewarden
  ['STAGES', 8, /id: '/g],              // the eight Tour worlds
  ['PAINTS', 8, /id: '/g],
  ['DONATIONS', 3, /\n  \{ at:/g],      // Patron / Shipwright / Yardmaster
];
for (const [name, min, re] of floors) {
  const n = blocks[name] ? (blocks[name].match(re) || []).length : 0;
  if (n < min) bad.push(`catalog ${name}: ${n} rows (floor ${min}) — missing or truncated`);
}

// 5) the selftest suite — the in-game battery ships inside the payload.
const tCount = rows(s, /\bT\('/g);
if (tCount < 50) bad.push(`selftest suite: ${tCount} T('…') cases (floor 50) — suite missing?`);

if (bad.length) {
  console.error(INCIDENT);
  for (const b of bad) console.error('  ✗ ' + b);
  process.exit(1);
}
console.log(`stubguard: payload looks like the game (${lines} lines, 6 catalogs, ${tCount} selftest cases, load contract intact)`);
