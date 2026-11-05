import test from 'node:test';
import assert from 'node:assert/strict';
import { promoteRelease } from './promote-release.mjs';
const commit = 'a'.repeat(40);
const candidate = { id: 'dpl_test', projectId: 'prj_test', readyState: 'READY', target: 'production',
  meta: { releaseCommit: commit, githubCommitSha: commit } };
const config = { token: 'test-only-token', team: 'team_test', project: 'prj_test',
  url: 'https://emberfall-test.vercel.app', commit };
function server(deployment = candidate, failPromotion = false) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, ...options });
    if (options.method === 'GET') return Response.json(deployment);
    return new Response('', { status: failPromotion && options.method === 'POST' ? 403 : 200 });
  } };
}
test('scoped promotion verifies identity, avoids user lookup and preserves manual assignment', async () => {
  const mock = server();
  assert.equal(await promoteRelease({ ...config, fetcher: mock.fetcher }), 'dpl_test');
  assert.deepEqual(mock.calls.map(c => c.method), ['GET','PATCH','POST','PATCH']);
  for (const call of mock.calls) {
    assert.equal(new URL(call.url).origin, 'https://api.vercel.com');
    assert.equal(new URL(call.url).searchParams.get('teamId'), 'team_test');
    assert.equal(call.headers.Authorization, 'Bearer test-only-token');
    assert.equal(call.redirect, 'error');
    assert.ok(!call.url.includes('/user'));
  }
  for (const call of mock.calls.filter(c => c.method === 'PATCH')) assert.deepEqual(JSON.parse(call.body), { autoAssignCustomDomains: false });
});
test('wrong artifact/Git identity, project, readiness or environment causes no mutation', async () => {
  for (const change of [{ meta: { ...candidate.meta, githubCommitSha: 'b'.repeat(40) } },
    { meta: { ...candidate.meta, releaseCommit: 'b'.repeat(40) } }, { projectId: 'prj_other' },
    { readyState: 'BUILDING' }, { target: 'preview' }]) {
    const mock = server({ ...candidate, ...change });
    await assert.rejects(promoteRelease({ ...config, fetcher: mock.fetcher }), /identity conflicts/);
    assert.equal(mock.calls.length, 1);
  }
});
test('malformed targets cannot receive credentials or trigger requests', async () => {
  for (const url of ['https://evil.example','http://x.vercel.app','https://x.vercel.app/?secret=x','https://user@x.vercel.app']) {
    const mock = server();
    await assert.rejects(promoteRelease({ ...config, url, fetcher: mock.fetcher }));
    assert.equal(mock.calls.length, 0);
  }
});
test('failed promotion restores manual assignment and never includes the token in errors', async () => {
  const mock = server(candidate, true);
  await assert.rejects(promoteRelease({ ...config, fetcher: mock.fetcher }), error =>
    /HTTP 403/.test(error.message) && !error.message.includes(config.token));
  assert.equal(mock.calls.at(-1).method, 'PATCH');
});
