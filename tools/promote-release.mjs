#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest } from './site-payload.mjs';

export async function promoteRelease({ token, team, project, url, commit, fetcher = fetch }) {
  const target = new URL(url);
  if (!token || !/^team_[\w]+$/.test(team) || !/^prj_[\w]+$/.test(project) ||
      !/^[a-f0-9]{40}$/.test(commit) || target.protocol !== 'https:' ||
      !target.hostname.endsWith('.vercel.app') || target.pathname !== '/' ||
      target.username || target.password || target.search || target.hash) throw new Error('Invalid promotion identity');
  const request = async (endpoint, method = 'GET', body) => {
    const response = await fetcher(`https://api.vercel.com${endpoint}?teamId=${encodeURIComponent(team)}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Vercel ${method} failed: HTTP ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const deployment = await request(`/v13/deployments/${encodeURIComponent(target.hostname)}`);
  if (deployment.readyState !== 'READY' || deployment.target !== 'production' ||
      (deployment.projectId || deployment.project?.id) !== project ||
      deployment.meta?.releaseCommit !== commit || deployment.meta?.githubCommitSha !== commit ||
      !/^dpl_[\w]+$/.test(deployment.id)) throw new Error('Deployment identity conflicts with tested artifact');
  // Explicit API scope avoids the CLI's unrelated /user lookup for scoped tokens.
  const projectPath = `/v9/projects/${project}`;
  await request(projectPath, 'PATCH', { autoAssignCustomDomains: false });
  try {
    await request(`/v10/projects/${project}/promote/${deployment.id}`, 'POST', {});
  } finally {
    await request(projectPath, 'PATCH', { autoAssignCustomDomains: false });
  }
  return deployment.id;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const manifest = readManifest(path.join(root, 'dist/site'));
    if (manifest.commitSha !== process.env.RELEASE_SHA) throw new Error('Artifact does not match approved release');
    const id = await promoteRelease({ token: process.env.VERCEL_TOKEN, team: process.env.VERCEL_ORG_ID,
      project: process.env.VERCEL_PROJECT_ID, url: process.env.DEPLOYMENT_URL, commit: manifest.commitSha });
    console.log(`PROMOTION: accepted ${id} for ${manifest.commitSha}; public HTTP verification follows`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
