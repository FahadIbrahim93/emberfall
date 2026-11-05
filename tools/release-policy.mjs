#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usesToken = env => Object.entries(env || {}).some(([key, value]) =>
  key === 'VERCEL_TOKEN' || /secrets\s*(?:\.\s*VERCEL_TOKEN|\[\s*['"]VERCEL_TOKEN['"]\s*\])/.test(String(value)));

// Structural isolation checks, not a substitute for reviewing shell/dependency code.
export function checkReleasePolicy(source) {
  const doc = parseDocument(source, { uniqueKeys: true });
  if (doc.errors.length) return doc.errors.map(error => error.message);
  const workflow = doc.toJS({ maxAliasCount: 100 });
  const problems = [];
  if (usesToken(workflow.env)) problems.push('VERCEL_TOKEN must not be workflow-scoped');
  for (const [name, job] of Object.entries(workflow.jobs || {})) {
    if (usesToken(job.env)) problems.push(`${name}: VERCEL_TOKEN must not be job-scoped`);
    for (const step of job.steps || []) {
      const where = `${name}/${step.id || step.name || 'step'}`;
      const run = String(step.run || '');
      const authenticates = /\bvercel\s+(?:deploy|promote)\b/.test(run) || /^node tools\/promote-release\.mjs\s*$/.test(run);
      const hasToken = usesToken(step.env);
      if (/--token(?:[=\s]|$)/.test(run)) problems.push(`${where}: command-line tokens are forbidden`);
      if (/\$\{\{\s*secrets\b/.test(run)) problems.push(`${where}: secrets must be passed through step environment`);
      if (hasToken && (!authenticates || step.uses)) problems.push(`${where}: credentials belong only to authenticated CLI steps`);
      if (hasToken && /\b(?:npm|npx|pnpm|yarn)\b/.test(run)) problems.push(`${where}: install or execute packages before exposing credentials`);
      if (authenticates && !step.env?.VERCEL_TOKEN) problems.push(`${where}: authenticated CLI requires a step-scoped VERCEL_TOKEN`);
      if (/\bvercel\s+deploy\b/.test(run) && !run.includes('--meta githubCommitSha="$RELEASE_SHA"')) problems.push(`${where}: deployment Git identity must match the approved artifact`);
      if (/\bvercel\s+promote\b/.test(run)) problems.push(`${where}: use the scoped identity-checking promotion adapter`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const problems = checkReleasePolicy(fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8'));
    if (problems.length) throw new Error(problems.join('\n'));
    console.log('RELEASE: credentials isolated from package installation and command arguments');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
