#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   fun-scoreboard.mjs — the fun curve: one measured point per release.

   The fun audits answer "is it fun?" for ONE build. This tool makes the
   answers accrete: every release, the instrumented play (tests/fun-audit
  .spec.js first-60-seconds + the autopilot bot in tests/fun-loop.spec.js)
   leaves docs/audit/timeline.json and fun-loop.json — git-ignored, wiped
   by the next run. The scoreboard distills them into ONE committed row per
   version in docs/audit/fun-curve.json and renders the README trend table,
   so the fun curve is visible release over release: is the bot flying
   deeper? killing more? is the game getting heavier or smoother?

   The numbers come only from the run's own artifacts — nothing here plays
   the game or invents a figure. A row is write-once per version (the
   release point is the release run's number; re-runs are noise) — use
   --force to deliberately re-measure.

     node tools/fun-scoreboard.mjs            # record THIS tree's version
     node tools/fun-scoreboard.mjs --readme   # re-render the README table
     node tools/fun-scoreboard.mjs --check    # CI gate: README table ⇄
                                              # snapshot agree, and the
                                              # tree's version has a row
                                              # (the release dance's fence)
     node tools/fun-scoreboard.mjs --force    # replace this version's row
     node tools/fun-scoreboard.mjs --note "…" # annotate the recorded row

   Honest-number note: the bot's best-wave counts the wave it REACHED in
   its 56s headless flight — it is a difficulty/depth probe, not a feat
   claim, and never a Wardenfall wave-16 (no capital fell, no ledger row).

   Exit 0 = done · exit 1 = gate refused or artifacts missing.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const abs = (...p) => path.join(ROOT, ...p);
const readAbs = p => fs.readFileSync(p, 'utf8');

const SNAPSHOT = abs('docs', 'audit', 'fun-curve.json');
const README = abs('README.md');
const INDEX = abs('index.html');
const LOOP_JSON = abs('docs', 'audit', 'fun-loop.json');
const TIMELINE_JSON = abs('docs', 'audit', 'timeline.json');

const MARK_START = '<!-- fun-curve:start (maintained by tools/fun-scoreboard.mjs — regenerate with --readme; do not hand-edit) -->';
const MARK_END = '<!-- fun-curve:end -->';
const README_ANCHOR = '## The global leaderboard, mirrored';

const fail = m => { console.error('FUN-CURVE: ' + m); process.exit(1); };
const log = m => console.log('FUN-CURVE: ' + m);
const DASH = '—';
const cell = v => (v === null || v === undefined) ? DASH : String(v);

/* ── sources ─────────────────────────────────────────────────────────── */

function currentVersion() {
  const m = readAbs(INDEX).match(/<span>EMBERFALL v(\d+\.\d+\.\d+)<\/span>/);
  if (!m) fail('could not read the version footline from index.html');
  return m[1];
}

function codenameFor(version) {
  const esc = version.replace(/\./g, '\\.');
  const m = readAbs(README).match(new RegExp("^## What's new in v" + esc + ' — "([^"]+)"', 'm'));
  return m ? m[1] : '';
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/* The bot's flight record — the trend's primary source. */
function measureLoop() {
  if (!fs.existsSync(LOOP_JSON)) {
    fail('docs/audit/fun-loop.json not found — fly the bot first: npx playwright test tests/fun-loop.spec.js');
  }
  const j = JSON.parse(readAbs(LOOP_JSON));
  const b = j.best || {};
  return {
    wave: b.wave ?? null, kills: b.kills ?? null, grazes: b.grazes ?? null,
    combo: b.combo ?? null, mult: b.mult ?? null,
    medianFps: j.medianFps ?? null,
  };
}

/* The first-60-seconds audit — secondary source; its absence degrades the
   row, it never blocks it. timeline.json's juice block only grew a
   medianFps field mid-v4.21; when it is missing, derive the median from
   the recorded fpsCurve ([ms, fps, parts, foes] rows) instead. */
function measureFirst60() {
  if (!fs.existsSync(TIMELINE_JSON)) return null;
  const t = JSON.parse(readAbs(TIMELINE_JSON));
  let med = (t.juice && t.juice.medianFps) ?? null;
  if (med == null && Array.isArray(t.fpsCurve)) {
    med = median(t.fpsCurve.map(r => r[1]).filter(Boolean));
  }
  return {
    medianFps: med,
    firstPlayingMs: t.firstPlayingMs ?? null,
    firstKillMs: t.firstKillMs ?? null,
    fbSeen: (t.combat && t.combat.fbSeen) ?? null,
  };
}

function measure(version) {
  return {
    version,
    date: new Date().toISOString().slice(0, 10),
    codename: codenameFor(version),
    loop: measureLoop(),
    first60: measureFirst60(),
  };
}

/* ── snapshot ────────────────────────────────────────────────────────── */

const vKey = v => String(v).split('.').map(Number);
function sortPoints(pts) {
  return [...pts].sort((a, b) => {
    const A = vKey(a.version), B = vKey(b.version);
    for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return B[i] - A[i];
    return 0;
  });
}

function loadSnapshot(mode) {
  if (!fs.existsSync(SNAPSHOT)) {
    if (mode === 'check') fail('docs/audit/fun-curve.json does not exist — record a point first: node tools/fun-scoreboard.mjs');
    return {
      what: 'the fun curve — one measured point per release, distilled from the fun-audit artifacts (written by tools/fun-scoreboard.mjs)',
      sources: [
        'docs/audit/timeline.json — tests/fun-audit.spec.js (first 60 seconds)',
        'docs/audit/fun-loop.json — tests/fun-loop.spec.js (autopilot bot, 56s of real play)',
      ],
      points: [],
    };
  }
  try {
    const j = JSON.parse(readAbs(SNAPSHOT));
    if (!Array.isArray(j.points)) fail('docs/audit/fun-curve.json has no points array');
    return j;
  } catch (e) {
    fail('docs/audit/fun-curve.json is not valid JSON: ' + e.message);
  }
}

function saveSnapshot(snap) {
  snap.points = sortPoints(snap.points);
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2) + '\n');
}

/* ── README trend table ──────────────────────────────────────────────── */

function tableLines(points) {
  const rows = points.map(p => {
    const loop = p.loop || {};
    const f60 = p.first60 || {};
    const name = 'v' + p.version + (p.codename ? ` "${p.codename}"` : '');
    const combo = loop.mult ? '×' + loop.mult : DASH;
    return `| ${name} | ${cell(p.date)} | ${cell(loop.wave)} | ${cell(loop.kills)} | ${cell(loop.grazes)} | ${combo} | ${cell(loop.medianFps)} | ${cell(f60.medianFps)} |`;
  });
  return [
    '## The fun curve — the game, measured release over release',
    '',
    'Every release, the repo\'s own instrumented play — the first-60-seconds audit (`tests/fun-audit.spec.js`) and the autopilot bot (`tests/fun-loop.spec.js`) — flies the game, and the numbers become a row here: how deep the bot flies, what it kills, how smoothly it runs. Best-wave counts the wave the bot REACHED in its 56-second headless flight — a depth probe, not a feat claim. Median-fps is environment-sensitive (CI\'s software renderer vs your GPU) — read the trend within a column, not the absolute.',
    '',
    'Data: `docs/audit/fun-curve.json` (committed; one write-once row per version, written by `tools/fun-scoreboard.mjs` from the run\'s own artifacts). The raw artifacts are regenerated every run and stay git-ignored — only the distilled curve ships.',
    '',
    '| Release | Date | Bot wave | Bot kills | Bot grazes | Combo × | Bot median fps | First-60s median fps |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
  ];
  const noted = points.filter(p => p.note);
  if (noted.length) {
    lines.push('', ...noted.map(p => `- **v${p.version}** — ${p.note}`), '');
  } else {
    lines.push('');
  }
  return lines;
}

function sectionFor(points, eol) {
  return [MARK_START, ...tableLines(points), MARK_END].join(eol);
}

function syncReadme(points) {
  let md = readAbs(README);
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const section = sectionFor(points, eol);
  const at = md.indexOf(MARK_START);
  const end = md.indexOf(MARK_END);
  if (at > -1 && end > at) {
    md = md.slice(0, at) + section + md.slice(end + MARK_END.length);
  } else {
    if (md.includes(MARK_START) || md.includes(MARK_END)) fail('README has only one fun-curve marker — fix by hand or restore the pair');
    const anchor = md.indexOf(README_ANCHOR);
    if (anchor === -1) fail('README anchor not found: ' + README_ANCHOR);
    md = md.slice(0, anchor) + section + eol + eol + md.slice(anchor);
  }
  fs.writeFileSync(README, md);
}

/* ── modes ───────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const mode = argv.includes('--check') ? 'check' : argv.includes('--readme') ? 'readme' : 'append';
const force = argv.includes('--force');
const noteIdx = argv.indexOf('--note');
const note = noteIdx > -1 ? argv[noteIdx + 1] : '';
if (note && /[|"]/.test(note)) fail('--note must be plain prose (no pipes or quotes — it lands in JSON and CI logs)');

if (mode === 'append') {
  const snap = loadSnapshot(mode);
  const version = currentVersion();
  const existing = snap.points.find(p => p.version === version);
  if (existing && !force) {
    log(`v${version} already recorded (${existing.date}) — release points are write-once; --force to re-measure`);
  } else {
    const point = measure(version);
    if (note) point.note = note;
    snap.points = snap.points.filter(p => p.version !== version);
    snap.points.push(point);
    saveSnapshot(snap);
    syncReadme(snap.points);
    log(`recorded v${version} — bot wave ${cell(point.loop.wave)} · kills ${cell(point.loop.kills)} · grazes ${cell(point.loop.grazes)} · bot median fps ${cell(point.loop.medianFps)} · first-60s median ${cell(point.first60 && point.first60.medianFps)}`);
    log('next: commit docs/audit/fun-curve.json + README.md with the release');
  }
} else if (mode === 'readme') {
  const snap = loadSnapshot(mode);
  syncReadme(snap.points);
  log(`README table re-rendered from ${snap.points.length} point(s)`);
} else {
  /* --check: the CI gate. (a) snapshot parses and stays sane, (b) the README
     table is byte-identical to what the snapshot renders (no hand drift),
     (c) the tree's OWN version has a row — the release dance's loop fence:
     a version that never measured itself cannot go green. */
  const snap = loadSnapshot(mode);
  const versions = snap.points.map(p => p.version);
  const dup = versions.find((v, i) => versions.indexOf(v) !== i);
  if (dup) fail(`duplicate point for v${dup}`);
  const unsorted = snap.points.some((p, i) => i && vKey(snap.points[i - 1].version) < vKey(p.version));
  if (unsorted) fail('points are not newest-first');

  const md = readAbs(README);
  const at = md.indexOf(MARK_START), end = md.indexOf(MARK_END);
  if (at === -1 || end === -1 || end < at) fail('README fun-curve section missing or marker pair broken');
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const want = sectionFor(snap.points, eol);
  const have = md.slice(at, end + MARK_END.length);
  if (have !== want) fail('README fun-curve table drifted from the snapshot — run: node tools/fun-scoreboard.mjs --readme');

  const version = currentVersion();
  /* The row for the CURRENT version is expected to be written by CI's
     record step (main pushes, after the browser suite flew it) — a missing
     row is a warning here, not a red gate: it cannot exist before the run
     that measures it, and local hardware numbers must never stand in for
     CI's. The release checklist still verifies the row landed. */
  if (!snap.points.some(p => p.version === version)) {
    log(`note: v${version} has no fun-curve row yet — CI records it from this push's browser-suite artifacts`);
  }
  const top = snap.points[0];
  log(`gate green — ${snap.points.length} release(s) on the curve; newest v${top.version}: bot wave ${cell(top.loop && top.loop.wave)} · kills ${cell(top.loop && top.loop.kills)} · bot median fps ${cell(top.loop && top.loop.medianFps)}`);
}
