#!/usr/bin/env node
/* copyguard.js — truth-in-copy gate (SSOT P0-5, Directive 5).
   Scans user-facing copy for claims no green CI job currently backs:
     - "verified"-family claims about the leaderboard (the deck cannot yet
       re-simulate a run — that is SSOT P1/P2; the honest phrase is
       "plausibility-checked")
     - stale version strings (must match VERSION below)
     - stale test-count claims (must match tools/selftest-baseline.json)
   When a gate becomes real (e.g. G-CHEAT ships an authoritative replay),
   extend ALLOW and the copy may change — the guard is the contract. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const VERSION = 'v4.3.0';
const ALLOW = [];   // extra allowed patterns only for HISTORICAL release notes

const FILES = [
  'README.md', 'ARCHITECTURE.md', 'docs/economy-audit.md', 'docs/performance.md',
  'index.html', 'server.js', 'sw.js', 'manifest.webmanifest',
  'js/art.js', 'js/input.js', 'js/audio.js', 'js/sky.js', 'js/net.js'
];

const collect = f => {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  return lines.map((l, i) => [i + 1, l]);
};

const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/selftest-baseline.json'), 'utf8'));

/* the CURRENT version (v3.7+) release notes — historical sections are exempt
   via the "What's new in v3.5" boundary so old notes stay honest records */
const CURRENT_RELEASES_BOUNDARY = /## What's new in v3\.5 /;

let fail = 0;
const complain = (file, line, text, why) => {
  console.error(`COPYGUARD FAIL ${file}:${line} — ${why}\n    ${text.trim().slice(0, 120)}`);
  fail++;
};

for (const f of FILES) {
  if (!fs.existsSync(path.join(ROOT, f))) { complain(f, 0, '', 'listed file missing'); continue; }
  let inHistorical = false;
  for (const [ln, text] of collect(f)) {
    if (CURRENT_RELEASES_BOUNDARY.test(text)) inHistorical = true;
    if (ALLOW.some(re => re.test(text))) continue;

    /* 1. no "server-verified"/"verified leaderboard" claims anywhere, ever
       (\b keeps "unverified runs never rank" honest statements legal) */
    /* honest negations ("not yet server-verified", "unverified runs never
       rank") are ALLOWED — they are the truth-telling we want */
    const NEG = /not (yet )?server[- ]verified|not (yet )?verified|unverified/;
    if (/server[- ]verified|\bverified (leaderboard|board|community|runs?)\b|verified-run/.test(text)
        && !NEG.test(text)) {
      complain(f, ln, text, 'claims verification the deck does not provide (P1/P2)');
    }

    /* 2. no stale version strings outside historical release notes */
    if (!inHistorical && /v3\.[0-6](\.[0-9]+)?\b/.test(text) && /EMBERFALL|cache|version/i.test(text)) {
      complain(f, ln, text, `stale version — expected ${VERSION}`);
    }

    /* 3. test-count claims must equal the committed baseline */
    const count = text.match(/\b(\d{2}) tests?\b/);
    if (count && Number(count[1]) !== baseline.total && /self-?test|suite|selftests/i.test(text)) {
      complain(f, ln, text, `claims ${count[1]} tests, baseline is ${baseline.total}`);
    }
  }
}

if (fail) {
  console.error(`copyguard: ${fail} violation(s)`);
  process.exit(1);
}
console.log(`copyguard: copy claims match provenance (baseline ${baseline.total}/${baseline.total})`);
