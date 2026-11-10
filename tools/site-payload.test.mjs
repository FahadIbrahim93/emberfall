import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, MANIFEST, buildSite, verifySite, verifyLive, verifyLiveWithRetry, isTransientLiveError, prepareVercel } from './site-payload.mjs';
import { createStaticServer } from './serve-static.mjs';

const sha = 'a'.repeat(40);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberfall-payload-'));
  // The fixture owns this absolute temporary directory, including its build output.
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['index.html', 'stats.html', 'pilot.html', 'sw.js', 'manifest.webmanifest', 'LICENSE', 'vercel.json', 'js', 'icons', 'fonts']) {
    fs.cpSync(path.join(ROOT, name), path.join(root, name), { recursive: true });
  }
  for (const name of ['press-kit.html', 'press', 'screenshots']) {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'docs', name), path.join(root, 'docs', name), { recursive: true });
  }
  return { root, ...buildSite(root, sha) };
}

test('packages vendor auth code, references and exact release provenance, excluding tooling', t => {
  const { directory, manifest } = fixture(t);
  assert.ok(manifest.assets.some(asset => asset.path === 'js/vendor/supabase.js'));
  assert.ok(manifest.assets.every(asset => !/^(?:tools|tests|packages|supabase|node_modules)\//.test(asset.path)));
  assert.equal(verifySite(directory, sha).commitSha, sha);
  assert.throws(() => verifySite(directory, 'b'.repeat(40)), /commit/);
});
test('missing vendor assets and changed bytes fail verification', t => {
  const { directory } = fixture(t);
  const vendor = path.join(directory, 'js/vendor/supabase.js');
  fs.appendFileSync(vendor, '\nchanged');
  assert.throws(() => verifySite(directory), /changed/);
  fs.unlinkSync(vendor);
  assert.throws(() => verifySite(directory), /ENOENT/);
});
test('new references to unpackaged assets prevent a build', t => {
  const { root } = fixture(t);
  fs.appendFileSync(path.join(root, 'index.html'), '<script src="js/missing.js"></script>');
  assert.throws(() => buildSite(root, sha), /unpackaged asset/);
});
test('manifest icon references must exist in the packaged release', t => {
  const { root } = fixture(t);
  const filename = path.join(root, 'manifest.webmanifest');
  const webmanifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  webmanifest.icons.push({ src: 'icons/missing.png', sizes: '512x512', type: 'image/png' });
  fs.writeFileSync(filename, JSON.stringify(webmanifest));
  assert.throws(() => buildSite(root, sha), /unpackaged asset/);
});
test('manifest omissions, duplicate entries and traversal are rejected', t => {
  const { directory, manifest } = fixture(t);
  const filename = path.join(directory, MANIFEST);
  const write = assets => fs.writeFileSync(filename, JSON.stringify({ ...manifest, assets }));
  write(manifest.assets.filter(asset => asset.path !== 'js/vendor/supabase.js'));
  assert.throws(() => verifySite(directory), /required release asset/);
  write([...manifest.assets, manifest.assets[0]]);
  assert.throws(() => verifySite(directory), /duplicate/);
  write([...manifest.assets, { ...manifest.assets[0], path: '../secret.json' }]);
  assert.throws(() => verifySite(directory), /invalid/);
});
test('unexpected files cannot piggyback on a tested payload', t => {
  const { directory } = fixture(t);
  fs.writeFileSync(path.join(directory, 'secret.json'), '{}');
  assert.throws(() => verifySite(directory), /unmanifested/);
});
test('deployment security configuration cannot change after testing', t => {
  const { directory } = fixture(t);
  fs.writeFileSync(path.join(directory, 'vercel.json'), '{}');
  assert.throws(() => verifySite(directory), /configuration changed/);
  assert.throws(() => prepareVercel(directory, sha), /configuration changed/);
});
test('Vercel prebuilt output preserves every public byte, MIME and security header', t => {
  const { directory, manifest } = fixture(t);
  const output = prepareVercel(directory, sha);
  const config = JSON.parse(fs.readFileSync(path.join(output, 'config.json')));
  assert.equal(config.version, 3);
  assert.equal(config.routes[0].headers['X-Content-Type-Options'], 'nosniff');
  assert.match(config.routes[0].headers['Content-Security-Policy'], /supabase/);
  for (const asset of manifest.assets) {
    assert.deepEqual(fs.readFileSync(path.join(output, 'static', asset.path)), fs.readFileSync(path.join(directory, asset.path)));
    const route = config.routes.find(route => route.src && new RegExp('^' + route.src + '$').test('/' + asset.path) && route.headers?.['Content-Type']);
    assert.equal(route?.headers['Content-Type'], asset.mime);
  }
  assert.ok(!fs.existsSync(path.join(output, 'static', 'vercel.json')));
  assert.throws(() => prepareVercel(directory, sha), /unmanifested|already exists/);
});
test('the same source and commit produce byte-identical manifests', t => {
  const { root, directory } = fixture(t);
  const first = fs.readFileSync(path.join(directory, MANIFEST), 'utf8');
  buildSite(root, sha);
  assert.equal(fs.readFileSync(path.join(directory, MANIFEST), 'utf8'), first);
});
test('live smoke checks subpath URLs, MIME, bytes, provenance and missing files', async t => {
  const { directory, manifest } = fixture(t);
  const fetcher = async input => {
    const url = new URL(input);
    assert.ok(url.pathname.startsWith('/emberfall/'));
    const name = url.pathname.slice('/emberfall/'.length);
    const asset = manifest.assets.find(asset => asset.path === name);
    return new Response(fs.readFileSync(path.join(directory, name)), { headers: { 'content-type': asset?.mime || 'application/json' } });
  };
  assert.equal(await verifyLive('https://example.test/emberfall', manifest, { fetcher }), manifest.assets.length);
  for (const [message, replace] of [
    ['HTTP 404', () => new Response('', { status: 404 })],
    ['wrong MIME', () => new Response('wrong', { headers: { 'content-type': 'text/html' } })],
    ['bytes differ', () => new Response('changed', { headers: { 'content-type': 'text/javascript' } })]
  ]) {
    await assert.rejects(verifyLive('https://example.test/emberfall/', manifest, { fetcher: input =>
      new URL(input).pathname.endsWith('/js/vendor/supabase.js') ? replace() : fetcher(input) }), new RegExp(message));
  }
  await assert.rejects(verifyLive('https://example.test/', { ...manifest, commitSha: 'b'.repeat(40) }, {
    fetcher: async () => new Response(JSON.stringify(manifest))
  }), /manifest does not match/);
});

test('the release server exposes only manifest assets and rejects a damaged artifact', async t => {
  const { directory, manifest } = fixture(t);
  const server = createStaticServer({ root: directory, release: true, expectedCommit: sha });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/`;
  assert.equal(await verifyLive(base, manifest), manifest.assets.length);
  for (const name of ['package.json', '.git/config', 'tools/serve-static.mjs', 'vercel.json']) {
    assert.equal((await fetch(new URL(name, base))).status, 404);
  }
  assert.equal((await fetch(base + '%E0%A4%A')).status, 400);
  assert.equal((await fetch(base)).headers.get('x-emberfall-commit'), sha);
  fs.unlinkSync(path.join(directory, 'js/vendor/supabase.js'));
  assert.throws(() => createStaticServer({ root: directory, release: true }), /ENOENT/);
});

test('live retries treat short-lived 404s as availability failures and then pass', async t => {
  const { directory, manifest } = fixture(t);
  let hits = 0;
  const fetcher = async input => {
    const name = new URL(input).pathname.replace(/^\//, '');
    if (name === MANIFEST) {
      hits += 1;
      if (hits < 3) return new Response('', { status: 404 });
    }
    const asset = manifest.assets.find(asset => asset.path === name);
    return new Response(fs.readFileSync(path.join(directory, name)), { headers: { 'content-type': asset?.mime || 'application/json' } });
  };
  const waits = [];
  assert.equal(await verifyLiveWithRetry('https://example.test/', manifest, {
    fetcher, budgetMs: 60_000, delays: [1000, 2000], now: () => 0, sleep: async ms => { waits.push(ms); }
  }), manifest.assets.length);
  assert.equal(hits, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('live retries stop after the budget and never retry a content mismatch', async t => {
  const { manifest } = fixture(t);
  let now = 0;
  await assert.rejects(verifyLiveWithRetry('https://example.test/', manifest, {
    fetcher: async () => new Response('', { status: 404 }),
    budgetMs: 5_000, delays: [2000, 2000, 2000],
    now: () => now, sleep: async ms => { now += ms; }
  }), /release-manifest\.json: HTTP 404/);

  let calls = 0;
  await assert.rejects(verifyLiveWithRetry('https://example.test/', { ...manifest, commitSha: 'b'.repeat(40) }, {
    fetcher: async () => { calls += 1; return new Response(JSON.stringify(manifest)); },
    budgetMs: 60_000, delays: [1000], now: () => 0, sleep: async () => { throw new Error('should not sleep'); }
  }), /manifest does not match/);
  assert.equal(calls, 1);
  assert.equal(isTransientLiveError(new Error('release-manifest.json: HTTP 404')), true);
  assert.equal(isTransientLiveError(new Error('deployed manifest does not match tested artifact')), false);
});
