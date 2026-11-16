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
const VERSION = 'v4.31.0';
const ALLOW = [];   // extra allowed patterns only for HISTORICAL release notes

const FILES = [
  'README.md', 'ARCHITECTURE.md', 'docs/economy-audit.md', 'docs/performance.md',
  'index.html', 'sw.js', 'manifest.webmanifest',
  'js/art.js', 'js/input.js', 'js/audio.js', 'js/sky.js', 'js/net.js', 'js/hangar.js'
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

/* 4. numeric smoke/drill badge counts are BANNED, not checked: the battery
   grows every release (loop-generated checks make static counting wrong by
   construction — two counting attempts both lied), so any badge of the shape
   tests-<N> smoke ... drill is drift waiting to ship. The truthful badge is
   non-numeric; the ONLY numeric test count allowed is the selftest baseline,
   which copyguard genuinely verifies above. */
for (const [ln, text] of collect('README.md')) {
  if (/tests-[0-9]+%20smoke/.test(text)) {
    complain('README.md', ln, text, 'numeric smoke/drill badge counts are unverifiable by construction — use the non-numeric battery badge');
  }
}

/* 5. documentation claims derived from the repository itself (2026-11-14).
   Each check reads the fact from the file that owns it, so the claim and the
   code cannot disagree again without a red build:
     - module/script count  <- the <script src="js/…"> tags in index.html
     - build scripts        <- package.json "scripts" (build:*)
     - auth providers       <- js/cloud.js OAuth calls + email paths
     - licence status       <- LICENSE's first line, THIRD_PARTY_NOTICES.md,
                               package.json "license", the README badge
   Each has been shown to fail on a deliberate contradiction and pass after
   reverting it. */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const moduleCount = [...html.matchAll(/<script src="js\//g)].length;
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/* the fact each claim is checked against comes from the file that owns it */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const pkgScripts = pkg.scripts || {};
const buildScripts = Object.keys(pkgScripts).filter(k => /^build:/.test(k));
const readmeText = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

/* module count: the script tags in index.html ARE the shipment. The phrase
   can wrap Markdown emphasis ("Eight modules load **before** the inline
   core"), so the match tolerates `**` and a little wording between the
   number and "inline core" — the previous pattern silently skipped the
   real sentence, which is how "five modules" survived in ARCHITECTURE. */
for (const f of ['README.md', 'ARCHITECTURE.md']) {
  if (!fs.existsSync(path.join(ROOT, f))) continue;
  for (const [ln, text] of collect(f)) {
    const m = /\b([A-Za-z]+)\s+(?:plain JavaScript\s+)?modules?\b[^.]{0,40}?\bbefore\b[^.]{0,20}?\binline core\b/i.exec(text);
    if (!m) continue;
    const stated = NUM[m[1].toLowerCase()];
    if (stated == null) continue;        /* "a handful of modules" is not a count */
    if (stated !== moduleCount) {
      complain(f, ln, text, `claims ${m[1]} modules before the inline core; index.html loads ${moduleCount}`);
    }
  }
}

/* "no build step" is true for playing and false for the repo: package.json
   owns the build scripts, and the README must name them rather than imply
   the repo has none. */
if (buildScripts.length) {
  for (const [ln, text] of collect('README.md')) {
    if (/\bno build step\b/i.test(text) && !/to play|does not build the game/i.test(text)) {
      complain('README.md', ln, text, `unqualified "no build step": ${buildScripts.join(', ')} exist`);
    }
  }
  for (const s of buildScripts) {
    if (!readmeText.includes('npm run ' + s)) {
      complain('README.md', 0, '', `package.json defines ${s}; the README never mentions it (release packaging is not "no build")`);
    }
  }
}

/* auth providers: js/cloud.js is the shipped client, so its OAuth calls and
   its email paths are the provider set. The README must name every one of
   them, and must not name one that is not shipped (a negated "not in the
   product" note is allowed — that is honest copy). */
const cloud = fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8');
const oauth = [...cloud.matchAll(/provider:\s*'([a-z]+)'/g)].map(m => m[1]);
const hasEmail = /signInWithPassword/.test(cloud) && /signUp\b/.test(cloud);
const shippedProviders = new Set([...oauth, ...(hasEmail ? ['email'] : [])]);
for (const p of shippedProviders) {
  /* the provider has to be named in an auth context — a bare word match is
     satisfied by `fonts.google.com`, which is not a sign-in provider */
  const authNear = new RegExp(
    `(?:sign[- ]?in|signin|account)[^.]{0,120}?\\b${p}\\b|\\b${p}\\b[^.]{0,40}?sign[- ]?in`,
    'i',
  );
  const named = p === 'email' ? /\bemail\b/i.test(readmeText) : authNear.test(readmeText);
  if (!named) {
    complain('README.md', 0, '', `js/cloud.js ships ${p} sign-in; the README does not mention it`);
  }
}
for (const [ln, text] of collect('README.md')) {
  const negated = /\bnot (?:in|shipped|supported|available)\b|is not in the product/i.test(text);
  /* the `i` flag matters: the README capitalises "Sign in with …", and
     without it this check matched nothing at all */
  for (const m of text.matchAll(/\bsign(?:ing)? in with ([A-Za-z][A-Za-z0-9]+)/gi)) {
    const name = m[1].toLowerCase();
    if (!negated && name !== 'email' && !shippedProviders.has(name)) {
      complain('README.md', ln, text, `claims "${m[0]}"; js/cloud.js ships only ${[...shippedProviders].join(', ')}`);
    }
  }
  if (/email accounts and guest play are\b/i.test(text) && shippedProviders.size > 1) {
    complain('README.md', ln, text, `claims email is the only account path; js/cloud.js ships ${[...shippedProviders].join(', ')}`);
  }
}

/* licence status: the LICENSE file decides it. GitHub reports NOASSERTION
   when the file cannot be classified (e.g. third-party terms appended), so
   the file must stay recognisably MIT, the manifest must not contradict it,
   and the README must say MIT. */
const lic = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
if (!/^\s*MIT License\b/.test(lic)) {
  complain('LICENSE', 1, lic.split('\n')[0] || '', 'LICENSE is not recognisably MIT (GitHub reports NOASSERTION when it cannot classify the file)');
}
if (/third-party|SIL Open Font/i.test(lic)) {
  complain('LICENSE', 0, '', 'third-party notices belong in THIRD_PARTY_NOTICES.md (GitHub reads the appended block as NOASSERTION)');
}
if (!fs.existsSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'))) {
  complain('THIRD_PARTY_NOTICES.md', 0, '', 'missing — third-party terms have nowhere to live');
}
if (pkg.license && !/^MIT$/i.test(pkg.license)) {
  complain('package.json', 0, '', `declares licence "${pkg.license}"; LICENSE is MIT`);
}
if (!/license-MIT|\bMIT\b/.test(readmeText)) {
  complain('README.md', 0, '', 'LICENSE is MIT; the README does not say so');
}

if (fail) {
  console.error(`copyguard: ${fail} violation(s)`);
  process.exit(1);
}
console.log(`copyguard: copy claims match provenance (baseline ${baseline.total}/${baseline.total})`);
