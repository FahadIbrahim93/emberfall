#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   release.mjs — the release stamp dance, one command.

   A release touches six hand-edited sites (three files carry the version
   twice) and one generated contract. Hand-editing them has shipped drift
   before (v4.15.1's red CI was an unstaged scanner edit); this tool makes
   the choreography atomic, audited, and boring:

     node tools/release.mjs audit
         Verify every stamp on the tree agrees — footline, header comment,
         NOTES[0].v, the selftest assertion, the sw cache number, the
         README title and its newest "What's new" section. Zero-exit only
         when the tree tells one version story. Run it anytime; CI could.

     node tools/release.mjs stamp <version> "<codename>" "<note sentence>"
         Bump everything to <version> (e.g. 4.16.0), insert the README
         release section and the in-game NOTES entry from the given
         one-sentence summary, flip the sw cache number, and update the
         selftest assertion. Print exactly what changed.

     node tools/release.mjs baseline
         Regenerate tools/selftest-baseline.json — but only through the
         gates: syntax first, then a live green run. The one-shot script
         writes on green; this wrapper refuses to run at all on red.

     node tools/release.mjs tag "<message>"
         Cut the annotated tag v<version> at HEAD — but only after the
         stamp audit passes and the committed tree is clean.

   The full battery (smoke, drills, browser, econsim) is deliberately NOT
   part of this tool — CI runs it with a laptop's worth of patience; the
   local flow is: stamp → (edit code) → check.sh → selftest-ci → baseline
   → commit → tag → push, and let CI fly the drills.

   Exit 0 = done · exit 1 = any gate refused. Nothing here pushes; tags
   and commits stay local until you push them.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => path.join(ROOT, p);
const read = p => fs.readFileSync(rel(p), 'utf8');
const write = (p, s) => fs.writeFileSync(rel(p), s);
const fail = m => { console.error('RELEASE: ' + m); process.exit(1); };
const sh = (cmd, args) => {
  /* only bash needs shell:true on Windows (no bash.exe via CreateProcess);
     everything else runs bare so args keep their quoting. A string command
     with no args array also sidesteps DEP0190. */
  const needsShell = process.platform === 'win32' && cmd === 'bash';
  const r = needsShell
    ? spawnSync([cmd, ...args].join(' '), { cwd: ROOT, encoding: 'utf8', shell: true })
    : spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

/* ── the seven version sites (footline/header/README-title share one file
      each with a second site; sw's number is cache-generation, bumped on
      every release so installs refresh) ──────────────────────────────── */
const VERSION_RE = /(\d+\.\d+\.\d+)/;

function stamps() {
  const index = read('index.html');
  const sw = read('sw.js');
  const readme = read('README.md');
  const foot = (index.match(/<span>EMBERFALL v(\d+\.\d+\.\d+)<\/span>/) || [])[1] || null;
  const head = (index.match(/EMBERFALL v(\d+\.\d+\.\d+) — zero-build orbital/) || [])[1] || null;
  const notes = (index.match(/const NOTES = \[\s*\{\s*v:\s*'(\d+\.\d+\.\d+)'/) || [])[1] || null;
  const assert = (index.match(/NOTES\[0\]\.v === '(\d+\.\d+\.\d+)'/) || [])[1] || null;
  const cache = (sw.match(/const CACHE = 'emberfall-v(\d+\.\d+)'/) || [])[1] || null;
  const title = (readme.match(/^# EMBERFALL v(\d+\.\d+\.\d+)/m) || [])[1] || null;
  const section = (readme.match(/^## What's new in v(\d+\.\d+\.\d+)[^\n]*$/m) || [])[1] || null;
  return { index, sw, readme, foot, head, notes, assert, cache, title, section };
}

/* The cache name is 'emberfall-v<MAJ>.<ERA>' and the era counter increments
   every release (v4.22 → v4.23 → v4.24 …) so installed shells refresh. */
function bumpCache(swSrc) {
  const m = swSrc.match(/const CACHE = 'emberfall-v(\d+)\.(\d+)'/);
  if (!m) throw new Error('unparseable sw cache name');
  const next = `${m[1]}.${Number(m[2]) + 1}`;
  return { src: swSrc.replace(/const CACHE = 'emberfall-v\d+\.\d+'/, `const CACHE = 'emberfall-v${next}'`), next };
}
function audit() {
  const s = stamps();
  const sites = { footline: s.foot, 'header comment': s.head, 'NOTES[0].v': s.notes, 'selftest assertion': s.assert, 'README title': s.title, 'README newest section': s.section };
  const bad = Object.entries(sites).filter(([, v]) => !v);
  if (bad.length) fail('unparseable stamp site(s): ' + bad.map(([k]) => k).join(', '));
  const versions = new Set(Object.values(sites));
  if (versions.size !== 1) {
    fail('stamps disagree: ' + Object.entries(sites).map(([k, v]) => `${k}=v${v}`).join(' · '));
  }
  if (!s.cache) fail('unparseable sw cache name');
  console.log('RELEASE: audit clean — every stamp says v' + [...versions][0] + ' (sw cache generation ' + s.cache + ')');
}

function stamp(toVersion, codename, note) {
  if (!VERSION_RE.test(toVersion + '')) fail('version must look like 4.16.0');
  if (/[<>"]/.test(note)) fail('note must be plain prose (no <, >, ")');
  const s = stamps();
  const from = s.foot;
  audit();

  let index = s.index, readme = s.readme;
  /* footline + header comment (index.html carries two) */
  index = index.replace(/<span>EMBERFALL v\d+\.\d+\.\d+<\/span>/, `<span>EMBERFALL v${toVersion}</span>`);
  index = index.replace(/EMBERFALL v\d+\.\d+\.\d+ — zero-build orbital/, `EMBERFALL v${toVersion} — zero-build orbital`);
  /* NOTES[0]: insert the new entry above the old head (CRLF-tolerant anchor,
     entry built in the file's own EOL so the diff stays clean) */
  const eol = index.includes('\r\n') ? '\r\n' : '\n';
  const notesRe = /const NOTES = \[\r?\n/;
  if (!notesRe.test(index)) fail('could not find the NOTES array anchor');
  const entry = ['  {', "    v: '" + toVersion + "',", '    items: [', "      '" + note.replace(/'/g, '&#39;') + "'", '    ]', '  },', ''].join(eol);
  index = index.replace(notesRe, m => m + entry);
  /* selftest assertion */
  index = index.replace(/NOTES\[0\]\.v === '\d+\.\d+\.\d+'/, `NOTES[0].v === '${toVersion}'`);
  /* README: title + new section above the old newest */
  readme = readme.replace(/^# EMBERFALL v\d+\.\d+\.\d+ — /m, `# EMBERFALL v${toVersion} — `);
  const sectionAnchor = "## What's new in v";
  const reol = readme.includes('\r\n') ? '\r\n' : '\n';
  const section = ['## What\'s new in v' + toVersion + (codename ? ' — "' + codename + '"' : ''), '', '- ' + note, ''].join(reol);
  const at = readme.indexOf(sectionAnchor);
  if (at === -1) fail("could not find the README What's-new anchor");
  readme = readme.slice(0, at) + section + readme.slice(at);

  const { src: swSrc, next } = bumpCache(s.sw);
  write('index.html', index);
  write('README.md', readme);
  write('sw.js', swSrc);
  console.log(`RELEASE: stamped v${from} → v${toVersion}`);
  console.log('  index.html: footline, header comment, NOTES[0], selftest assertion');
  console.log('  README.md: title, new "What\'s new" section' + (codename ? ` (${codename})` : ''));
  console.log('  sw.js: cache → emberfall-v' + next);
  console.log('RELEASE: next — edit code, pass the battery, then: node tools/release.mjs baseline && git commit -a && node tools/release.mjs tag "<message>"');
}

function baseline() {
  const check = sh('bash', ['check.sh']);
  if (check.code !== 0) fail('check.sh refused — fix syntax before regenerating the baseline\n' + check.out);
  console.log('RELEASE: check.sh green — regenerating the baseline from a live run');
  const gen = sh('node', ['tools/selftest-baseline.js']);
  if (gen.code !== 0) fail('baseline regeneration failed — the one-shot refuses to write on red\n' + gen.out);
  console.log(gen.out.trim());
  const diff = sh('git', ['diff', '--stat', '--', 'tools/selftest-baseline.json']);
  console.log(diff.out.trim() || 'baseline unchanged');
}

function tag(message) {
  if (!message) fail('tag needs a message: node tools/release.mjs tag "why this release"');
  const dirty = sh('git', ['status', '--porcelain']);
  if (dirty.out.trim()) fail('tree is dirty — commit first, then tag\n' + dirty.out);
  audit();
  const v = 'v' + stamps().foot;
  const dup = sh('git', ['rev-parse', '-q', '--verify', 'refs/tags/' + v]);
  if (dup.code === 0) fail('tag ' + v + ' already exists');
  const t = sh('git', ['tag', '-a', v, '-m', `EMBERFALL ${v} — ${message}`]);
  if (t.code !== 0) fail('git tag failed\n' + t.out);
  console.log('RELEASE: tagged ' + v + ' — push it with: git push origin ' + v);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'audit') audit();
else if (cmd === 'stamp') stamp(rest[0], rest[1] || '', rest[2] || '');
else if (cmd === 'baseline') baseline();
else if (cmd === 'tag') tag(rest.join(' '));
else {
  console.log('usage:');
  console.log('  node tools/release.mjs audit                            # verify every stamp agrees');
  console.log('  node tools/release.mjs stamp 4.16.0 "Codename" "note"   # bump all sites + sections');
  console.log('  node tools/release.mjs baseline                         # gated selftest-baseline regen');
  console.log('  node tools/release.mjs tag "message"                    # annotated tag at HEAD (clean tree only)');
  process.exit(cmd ? 1 : 0);
}
