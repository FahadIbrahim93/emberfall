#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only successful main-push CI artifacts can be used for release or rollback.
export function validateReleaseSource(run, sha, repository = 'FahadIbrahim93/emberfall') {
  if (!/^[a-f0-9]{40}$/.test(sha) || run.head_sha !== sha ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      run.event !== 'push' || run.head_branch !== 'main' || run.path !== '.github/workflows/ci.yml' ||
      run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('release requires a successful same-repository main-push CI run at the exact requested commit');
  }
  return sha;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(validateReleaseSource(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3]));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
