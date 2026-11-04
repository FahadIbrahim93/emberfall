import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkActions, checkWorkflow } from './check-actions.mjs';

const sha = 'a'.repeat(40);
test('accepts immutable official actions and reusable workflows', () => {
  assert.deepEqual(checkWorkflow(`jobs: {verify: {steps: [{uses: actions/checkout@${sha}}]}, reuse: {uses: owner/repo/.github/workflows/test.yml@${sha}}}`), []);
});
test('rejects mutable refs even in flow syntax and YAML aliases', () => {
  for (const uses of ['actions/checkout@v7', 'actions/checkout@main', 'actions/checkout@abc123', '${{ inputs.action }}']) {
    assert.equal(checkWorkflow(`jobs: {verify: {steps: [{uses: '${uses}'}]}}`).length, 1);
  }
  assert.equal(checkWorkflow('step: &step {uses: actions/checkout@main}\njobs: {verify: {steps: [*step]}}').length, 2);
});
test('accepts local actions and digest-pinned containers', () => {
  assert.deepEqual(checkWorkflow(`steps: [{uses: ./.github/actions/test}, {uses: docker://alpine@sha256:${'b'.repeat(64)}}]`), []);
  assert.equal(checkWorkflow('steps: [{uses: ./../external-action}]').length, 1);
  assert.equal(checkWorkflow('steps: [{uses: docker://alpine:latest}]').length, 1);
});
test('rejects duplicate keys and malformed YAML', () => {
  assert.ok(checkWorkflow('jobs: {}\njobs: {}').length);
  assert.ok(checkWorkflow('jobs: [').length);
});
test('all repository workflows satisfy the policy', () => {
  assert.deepEqual(checkActions(), []);
});
