/* copyguard.test.mjs — the gate's own test.
   A copy check that stops matching does not fail, it skips: both the module
   count and the auth providers were silently inert before 2026-11-14 while
   copyguard printed a clean pass. So each derived check is proved here by
   mutating a fixture copy of the repo and requiring a red exit that names the
   offending file. The fixture is a throwaway temp dir addressed through
   COPYGUARD_ROOT; the real tree is never written to. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(ROOT, 'tools/copyguard.js');

/* everything copyguard reads, and nothing else */
const FIXTURE_FILES = [
  'README.md',
  'ARCHITECTURE.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'package.json',
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'docs/economy-audit.md',
  'docs/performance.md',
  'js/art.js',
  'js/input.js',
  'js/audio.js',
  'js/sky.js',
  'js/net.js',
  'js/hangar.js',
  'js/cloud.js',
  'tools/selftest-baseline.json',
];

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copyguard-'));
  for (const f of FIXTURE_FILES) {
    const dest = path.join(dir, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), dest);
  }
  return dir;
}

function runCopyguard(dir) {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], {
      env: { ...process.env, COPYGUARD_ROOT: dir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status, output: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

function rewrite(dir, file, from, to) {
  const p = path.join(dir, file);
  const before = fs.readFileSync(p, 'utf8');
  assert.ok(before.includes(from), `fixture ${file} does not contain ${JSON.stringify(from)} — update this test with the copy`);
  fs.writeFileSync(p, before.replace(from, to));
}

/* insert after the title so the mutation never lands in a historical section */
function insertAfterTitle(dir, file, line) {
  const p = path.join(dir, file);
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  lines.splice(1, 0, line);
  fs.writeFileSync(p, lines.join('\n'));
}

test('the real repo passes', () => {
  const res = runCopyguard(ROOT);
  assert.equal(res.code, 0, res.output);
  assert.match(res.output, /copyguard: copy claims match provenance/);
});

test('a clean fixture passes, so the mutations below mean something', () => {
  const dir = fixture();
  const res = runCopyguard(dir);
  assert.equal(res.code, 0, res.output);
});

test('wrong module count fails and names the file', () => {
  const dir = fixture();
  rewrite(dir, 'ARCHITECTURE.md', 'Eight modules load', 'Six modules load');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /ARCHITECTURE\.md:\d+ — claims Six modules before the inline core; index\.html loads 8/);
});

test('a reworded module claim fails instead of quietly checking nothing', () => {
  const dir = fixture();
  rewrite(dir, 'ARCHITECTURE.md', 'Eight modules load **before** the inline core', 'Everything loads before the core');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /the count pattern is inert/);
});

test('an unqualified "no build step" fails', () => {
  const dir = fixture();
  insertAfterTitle(dir, 'README.md', 'The game has no build step.');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /README\.md:\d+ — unqualified "no build step": build:site, build:portal exist/);
});

test('an invented sign-in provider fails', () => {
  const dir = fixture();
  insertAfterTitle(dir, 'README.md', 'Sign in with Apple is also supported.');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /claims "Sign in with Apple"; js\/cloud\.js ships only/);
});

test('a shipped provider missing from the README fails', () => {
  const dir = fixture();
  rewrite(dir, 'README.md', 'Google sign-in', 'sign-in');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /js\/cloud\.js ships google sign-in; the README does not mention it/);
});

test('third-party terms appended to LICENSE fail', () => {
  const dir = fixture();
  fs.appendFileSync(path.join(dir, 'LICENSE'), '\nThird-party assets: SIL Open Font License 1.1.\n');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /third-party notices belong in THIRD_PARTY_NOTICES\.md/);
});

test('a manifest licence that contradicts LICENSE fails', () => {
  const dir = fixture();
  rewrite(dir, 'package.json', '"license": "MIT"', '"license": "GPL-3.0"');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /package\.json:0 — declares licence "GPL-3\.0"; LICENSE is MIT/);
});

test('a stale version string fails', () => {
  const dir = fixture();
  insertAfterTitle(dir, 'README.md', 'The cache for EMBERFALL v3.6.0 is warming.');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /stale version — expected v4\.31\.0/);
});

test('a stale test count fails', () => {
  const dir = fixture();
  insertAfterTitle(dir, 'README.md', 'The 99 test self-test suite runs headless.');
  const res = runCopyguard(dir);
  assert.equal(res.code, 1, res.output);
  assert.match(res.output, /claims 99 tests, baseline is \d+/);
});
