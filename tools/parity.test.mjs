/* parity.test.mjs — the shipped simulation's regression gate.
 *
 * The game and the tests run ONE simulation (packages/sim is a facade over the
 * inline core this file loads). This test is the independent node gate: it
 * loads the real index.html inline core in a stubbed browser
 * (packages/sim/host/env.mjs), flies the shared scenario and compares both the
 * final digest and the per-tick hash chain against committed values. A change
 * to shipped gameplay that is not accompanied by a deliberate
 * `node tools/parity/digest.mjs --write` fails here, and the failure names the
 * first tick that diverged.
 *
 * Runs with plain node — no dependencies, no browser, ~1 s. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runShipped, shippedPrimitives, BASELINE } from './parity/digest.mjs';

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

/** the first tick whose running hash differs from the baseline, or -1 */
function firstDivergence(run) {
  const now = String(run.tickChain || '').split(' ');
  const want = String(baseline.tickChain || '').split(' ');
  const n = Math.min(now.length, want.length);
  for (let i = 0; i < n; i++) if (now[i] !== want[i]) return i;
  return now.length === want.length ? -1 : n;
}

test('shipped: the inline core loads headlessly', () => {
  const p = shippedPrimitives();
  assert.equal(typeof p.hash, 'number', 'shipped primitives did not load');
  assert.equal(p.draws.length, 200);
});

test('shipped: the 900-tick scenario matches its committed digest', () => {
  const run = runShipped();
  assert.equal(
    run.digest, baseline.digest,
    `shipped simulation drifted.\\n  expected ${baseline.digest}\\n  actual   ${run.digest}\\n` +
      `If this change is intended, re-record with: node tools/parity/digest.mjs --write\\n` +
      `and include the baseline in the same commit as the gameplay change.`,
  );
});

test('shipped: per-tick hash chain matches (divergence at the first tick it happens)', () => {
  const run = runShipped();
  const at = firstDivergence(run);
  assert.equal(
    at, -1,
    at >= 0
      ? `shipped per-tick state diverged at tick ${at} (${(at * 1000 / 120).toFixed(1)} ms of play)`
      : 'the recorded tick chain has a different length',
  );
  assert.equal(run.chain, baseline.chain, 'shipped per-tick state drifted');
  assert.equal(run.tick0, baseline.tick0, 'the first tick already differs');
});

test('shipped: the scenario never leaves play', () => {
  const run = runShipped();
  assert.equal(run.state, 'playing', 'the reference scenario ended early — check lives/deaths in the digest');
});
