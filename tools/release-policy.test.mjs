import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse, stringify } from 'yaml';
import { checkReleasePolicy } from './release-policy.mjs';

const source = fs.readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
function changed(edit) { const workflow = parse(source); edit(workflow); return checkReleasePolicy(stringify(workflow)); }
const token = '${{ secrets.VERCEL_TOKEN }}';

test('the production release workflow isolates authentication', () => {
  assert.deepEqual(checkReleasePolicy(source), []);
});
test('rejects inherited workflow and job credentials', () => {
  assert.ok(changed(w => { w.env = { VERCEL_TOKEN: token }; }).some(p => p.includes('workflow-scoped')));
  assert.ok(changed(w => { w.jobs.vercel.env.VERCEL_TOKEN = token; }).some(p => p.includes('job-scoped')));
  assert.ok(changed(w => { w.jobs.vercel.env.AUTH = token; }).some(p => p.includes('job-scoped')));
});
test('rejects command-line tokens and direct secret interpolation', () => {
  assert.ok(changed(w => { w.jobs.vercel.steps.find(s => s.id === 'stage').run += '\nvercel deploy --token "$VERCEL_TOKEN"'; }).some(p => p.includes('command-line')));
  assert.ok(changed(w => { w.jobs.vercel.steps.find(s => s.id === 'stage').run += '\necho '+token; }).some(p => p.includes('step environment')));
});
test('rejects package execution while credentials are available', () => {
  assert.ok(changed(w => { w.jobs.vercel.steps.find(s => s.id === 'stage').run += '\nnpm exec --package=vercel@65.11.0 -- vercel deploy'; }).some(p => p.includes('before exposing')));
});
test('rejects credentials on non-authentication steps', () => {
  assert.ok(changed(w => { w.jobs.vercel.steps.push({ name: 'install', run: 'npm install', env: { VERCEL_TOKEN: token } }); }).some(p => p.includes('only to authenticated')));
});
test('rejects missing step authentication instead of relying on ambient credentials', () => {
  assert.ok(changed(w => { delete w.jobs.vercel.steps.find(s => s.id === 'stage').env; }).some(p => p.includes('requires a step-scoped')));
});
test('rejects ambiguous or malformed YAML', () => {
  assert.ok(checkReleasePolicy('jobs: {}\njobs: {}').length);
  assert.ok(checkReleasePolicy('jobs: [').length);
});
