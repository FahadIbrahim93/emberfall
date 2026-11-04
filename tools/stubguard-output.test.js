#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const guard = path.join(__dirname, 'stubguard.js');
const tempRoot = fs.realpathSync(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(tempRoot, 'emberfall-stubguard-'));

function runGuard(filename) {
  const result = spawnSync(process.execPath, [filename], {
    cwd: fixture, encoding: 'utf8', timeout: 10000, windowsHide: true
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1, 'a truncated game must trip the real guard');
  return result.stdout + '\n' + result.stderr;
}
function assertSafeDiagnostic(output) {
  const forbidden = [
    /\b(?:git|gh|npm|npx|node|curl|wget|bash|sh|powershell|pwsh|Invoke-WebRequest|Remove-Item)\s+[-\w./<>'"$]/i,
    /https?:\/\//i,
    /[|;&]\s*(?:git|gh|npm|node|curl|wget|bash|sh)\b/i
  ];
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(output), `stubguard emitted executable-looking content or a URL: ${pattern}`);
  }
  assert.ok(output.includes('STUB GUARD TRIPPED'), 'the failure must be the guard diagnostic');
  assert.ok(output.includes('reviewed, known-good revision'), 'keep useful recovery guidance');
}

try {
  fs.writeFileSync(path.join(fixture, 'index.html'), '<html>truncated game</html>\n');
  // Exercise the production failure path, rather than parsing a template's source.
  assertSafeDiagnostic(runGuard(guard));
  const source = fs.readFileSync(guard, 'utf8');
  for (const eol of ['\n', '\r\n']) {
    const copy = path.join(fixture, eol === '\n' ? 'guard-lf.js' : 'guard-crlf.js');
    fs.writeFileSync(copy, source.replace(/\r?\n/g, eol));
    assertSafeDiagnostic(runGuard(copy));
  }
  // A disposable mutation proves the check detects unsafe emitted guidance.
  const unsafe = path.join(fixture, 'guard-unsafe.js');
  const mutated = source.replace('reviewed, known-good revision.',
    'reviewed, known-good revision. curl https://recovery.invalid/game');
  assert.notEqual(mutated, source, 'mutation must change the diagnostic');
  fs.writeFileSync(unsafe, mutated);
  assert.throws(() => assertSafeDiagnostic(runGuard(unsafe)), /executable-looking content or a URL/);
  console.log('stubguard-output: emitted guidance safe; LF/CRLF pass; unsafe mutation rejected');
} finally {
  // Delete only the newly-created, owned fixture directly under the named temp root.
  const relative = path.relative(tempRoot, fs.realpathSync(fixture));
  assert.match(relative, /^emberfall-stubguard-[^\\/]+$/);
  fs.rmSync(fixture, { recursive: true, force: true });
}
