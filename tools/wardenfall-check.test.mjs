import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./wardenfall-check.mjs', import.meta.url));
for (const [day, verdict] of [['2026-11-05', 'not a rare Sunday'], ['2026-11-29', 'WARDENFALL IS UP'], ['2026-11-08', 'not a rare Sunday']]) {
  test(`calendar gate checks the complete Sunday/hash predicate: ${day}`, () => {
    const run = spawnSync(process.execPath, [script, day], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.ok(run.stdout.includes(verdict), run.stdout);
  });
}
