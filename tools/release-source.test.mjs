import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseSource } from './release-source.mjs';

const sha = 'a'.repeat(40);
const trusted = { head_sha: sha, repository: { full_name: 'FahadIbrahim93/emberfall' },
  head_repository: { full_name: 'FahadIbrahim93/emberfall' }, event: 'push', head_branch: 'main',
  path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success' };

test('accepts the exact successful main CI run, including an older rollback target', () => {
  assert.equal(validateReleaseSource(trusted, sha), sha);
});

test('refuses failed, incomplete, foreign, PR, wrong-workflow and wrong-commit artifacts', () => {
  for (const change of [{ conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'in_progress' },
    { event: 'pull_request' }, { head_branch: 'issue-66' }, { head_sha: 'b'.repeat(40) },
    { path: '.github/workflows/other.yml' }, { repository: { full_name: 'attacker/emberfall' } },
    { head_repository: { full_name: 'attacker/emberfall' } }]) {
    assert.throws(() => validateReleaseSource({ ...trusted, ...change }, sha));
  }
  assert.throws(() => validateReleaseSource(trusted, 'main'));
});
