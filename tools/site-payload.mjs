#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = 'release-manifest.json';
export const MIME = Object.freeze({
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.gif': 'image/gif', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css'
});
const FIXED = ['index.html', 'stats.html', 'pilot.html', 'sw.js', 'manifest.webmanifest',
  'LICENSE', 'js/vendor/supabase.js', 'js/vendor/SUPABASE-LICENSE',
  'docs/press-kit.html', 'docs/press/hero.png', 'docs/press/emberfall-wave1.gif'];
const MODULES = ['audio', 'sky', 'mirror-public', 'cloud', 'net', 'art', 'input'].map(name => `js/${name}.js`);
const REQUIRED = [...FIXED, ...MODULES];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const safePath = value => typeof value === 'string' && value.length > 0 &&
  !value.includes('\\') && !value.startsWith('/') && !value.split('/').some(part => part === '..' || part === '.' || !part);
const mediaType = name => MIME[path.extname(name)] || (name.endsWith('LICENSE') ? 'application/octet-stream' : null);

export function currentCommit(root = ROOT) {
  const sha = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('release commit must be a full Git SHA');
  return sha;
}

function walk(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`symlinks are not release assets: ${prefix}${entry.name}`);
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return walk(path.join(directory, entry.name), `${relative}/`);
    if (!entry.isFile()) throw new Error(`unsupported release asset: ${relative}`);
    return [relative];
  });
}

function versionOf(html) {
  const match = html.match(/<span>EMBERFALL v(\d+\.\d+\.\d+)<\/span>/);
  if (!match) throw new Error('index.html has no release version');
  return match[1];
}

function assertInside(root, filename) {
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(filename));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('asset escapes release root');
}

export function readManifest(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, MANIFEST), 'utf8'));
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.commitSha) ||
      !/^[a-f0-9]{64}$/.test(manifest.deploymentConfigSha256) ||
      !/^\d+\.\d+\.\d+$/.test(manifest.gameVersion) || !Array.isArray(manifest.assets)) {
    throw new Error('invalid release manifest');
  }
  const names = new Set();
  for (const asset of manifest.assets) {
    if (!safePath(asset.path) || names.has(asset.path) || asset.path === MANIFEST ||
        asset.mime !== mediaType(asset.path) || !asset.mime ||
        !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0) {
      throw new Error(`invalid or duplicate manifest asset: ${asset.path}`);
    }
    names.add(asset.path);
  }
  for (const name of REQUIRED) if (!names.has(name)) throw new Error(`required release asset missing: ${name}`);
  return manifest;
}

function checkReferences(directory, names) {
  const check = (from, reference) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference)) return;
    const parsed = new URL(reference, `https://payload.invalid/${from}`);
    const name = decodeURIComponent(parsed.pathname).replace(/^\//, '') || 'index.html';
    if (!names.has(name)) throw new Error(`${from} references an unpackaged asset: ${reference}`);
  };
  for (const name of [...names].filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(directory, name), 'utf8');
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => match.replace(/>[\s\S]*<\/script>/i, '></script>'));
    for (const match of markup.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) check(name, match[1]);
    for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      for (const match of style[1].matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/g)) check(name, match[1] ?? match[2] ?? match[3]);
    }
  }
  const webmanifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.webmanifest'), 'utf8'));
  for (const icon of webmanifest.icons || []) check('manifest.webmanifest', icon.src);
  if (webmanifest.start_url) check('manifest.webmanifest', webmanifest.start_url);
  const sw = fs.readFileSync(path.join(directory, 'sw.js'), 'utf8');
  const core = sw.match(/const CORE = \[([\s\S]*?)\];/);
  if (!core) throw new Error('service worker precache list is missing');
  for (const match of core[1].matchAll(/['"]([^'"]+)['"]/g)) check('sw.js', match[1]);
}

export function verifySite(directory, expectedCommit) {
  const manifest = readManifest(directory);
  if (expectedCommit && manifest.commitSha !== expectedCommit) throw new Error('release commit does not match tested commit');
  if (digest(fs.readFileSync(path.join(directory, 'vercel.json'))) !== manifest.deploymentConfigSha256) {
    throw new Error('release deployment configuration changed');
  }
  const names = new Set(manifest.assets.map(asset => asset.path));
  for (const asset of manifest.assets) {
    const filename = path.join(directory, asset.path);
    assertInside(directory, filename);
    const bytes = fs.readFileSync(filename);
    if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error(`release asset changed: ${asset.path}`);
  }
  const extras = walk(directory).filter(name => !names.has(name) && name !== MANIFEST && name !== 'vercel.json');
  if (extras.length) throw new Error(`unmanifested release files: ${extras.join(', ')}`);
  if (versionOf(fs.readFileSync(path.join(directory, 'index.html'), 'utf8')) !== manifest.gameVersion) throw new Error('release version mismatch');
  checkReferences(directory, names);
  return manifest;
}

export function buildSite(source = ROOT, commit = currentCommit(source)) {
  source = fs.realpathSync(source);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('release commit must be a full Git SHA');
  const directory = path.resolve(source, 'dist', 'site');
  // Only this fixed build directory may be replaced; never follow a dist symlink.
  for (const name of [path.join(source, 'dist'), directory]) {
    if (fs.existsSync(name) && fs.lstatSync(name).isSymbolicLink()) throw new Error('release output must not be a symlink');
  }
  if (path.relative(source, directory) !== path.join('dist', 'site')) throw new Error('unsafe release output');
  const names = new Set(REQUIRED);
  for (const [folder, pattern] of [['js', /\.js$/], ['icons', /\.png$/], ['fonts', /\.woff2$/], ['docs/screenshots', /\.png$/]]) {
    for (const name of walk(path.join(source, folder))) if (pattern.test(name)) names.add(`${folder}/${name}`);
  }
  for (const name of names) {
    if (!safePath(name) || !mediaType(name)) throw new Error(`invalid source asset: ${name}`);
    assertInside(source, path.join(source, name));
  }
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  const assets = [...names].sort().map(name => {
    const bytes = fs.readFileSync(path.join(source, name));
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    return { path: name, mime: mediaType(name), bytes: bytes.length, sha256: digest(bytes) };
  });
  const manifest = { schemaVersion: 1, commitSha: commit,
    deploymentConfigSha256: digest(fs.readFileSync(path.join(source, 'vercel.json'))),
    gameVersion: versionOf(fs.readFileSync(path.join(source, 'index.html'), 'utf8')), assets };
  fs.writeFileSync(path.join(directory, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  // Deployment configuration is metadata, not a public asset expected from Vercel.
  fs.copyFileSync(path.join(source, 'vercel.json'), path.join(directory, 'vercel.json'));
  verifySite(directory, commit);
  return { directory, manifest };
}

// Vercel's Build Output API publishes these exact tested bytes without a build.
export function prepareVercel(directory, expectedCommit) {
  const manifest = verifySite(directory, expectedCommit);
  const output = path.join(directory, '.vercel', 'output');
  if (fs.existsSync(path.join(directory, '.vercel'))) throw new Error('Vercel output already exists; download a fresh artifact');
  const config = JSON.parse(fs.readFileSync(path.join(directory, 'vercel.json'), 'utf8'));
  if (Object.keys(config).some(key => key !== 'headers') || config.headers?.length !== 1 || config.headers[0].source !== '/(.*)') {
    throw new Error('unsupported Vercel configuration; update the adapter explicitly');
  }
  const target = path.join(output, 'static');
  fs.mkdirSync(target, { recursive: true });
  for (const name of [...manifest.assets.map(asset => asset.path), MANIFEST]) {
    const destination = path.join(target, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(directory, name), destination);
  }
  const headers = Object.fromEntries(config.headers[0].headers.map(header => [header.key, header.value]));
  const routes = [{ src: '/(.*)', headers, continue: true },
    ...[...manifest.assets, { path: MANIFEST, mime: 'application/json' }].map(asset => ({
      src: '^/' + asset.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
      headers: { 'Content-Type': asset.mime, 'X-Emberfall-Commit': manifest.commitSha }, continue: true
    })), { src: '/', dest: '/index.html' }, { handle: 'filesystem' }];
  fs.writeFileSync(path.join(output, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2) + '\n');
  return output;
}

export async function verifyLive(base, manifest, { headers = {}, fetcher = fetch } = {}) {
  const url = new URL(base);
  if (!/^https?:$/.test(url.protocol)) throw new Error('live URL must use http(s)');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.search = ''; url.hash = '';
  const get = async name => {
    const response = await fetcher(new URL(name, url), { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response;
  };
  const deployed = await (await get(MANIFEST)).json();
  if (JSON.stringify(deployed) !== JSON.stringify(manifest)) throw new Error('deployed manifest does not match tested artifact');
  for (const asset of manifest.assets) {
    const response = await get(asset.path);
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (mime !== asset.mime && !(asset.mime === 'text/javascript' && mime === 'application/javascript')) throw new Error(`${asset.path}: wrong MIME ${mime}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error(`${asset.path}: deployed bytes differ from tested artifact`);
  }
  return manifest.assets.length;
}

// Retry only transport/availability failures. Content mismatches are final.
const TRANSIENT_LIVE = /HTTP (404|408|425|429|5\d\d)|aborted|timeout|network|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i;
const LIVE_RETRY_BUDGET_MS = 60_000;
const LIVE_RETRY_DELAYS_MS = [2000, 4000, 8000, 15000, 15000, 16000];

export function isTransientLiveError(error) {
  return TRANSIENT_LIVE.test(String(error?.message || error || ''));
}

export async function verifyLiveWithRetry(base, manifest, options = {}) {
  const budgetMs = options.budgetMs ?? LIVE_RETRY_BUDGET_MS;
  const delays = options.delays ?? LIVE_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  let attempt = 0;
  for (;;) {
    try {
      return await verifyLive(base, manifest, options);
    } catch (error) {
      const remaining = budgetMs - (now() - started);
      if (!isTransientLiveError(error) || remaining <= 0) throw error;
      const delay = Math.max(0, Math.min(delays[Math.min(attempt, delays.length - 1)], remaining));
      console.warn(`PAYLOAD: live check retry ${attempt + 1} after ${error.message}; waiting ${delay}ms`);
      attempt += 1;
      if (delay > 0) await sleep(delay);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2] || 'build';
    const directory = path.join(ROOT, 'dist', 'site');
    const shaAt = process.argv.indexOf('--commit');
    const commit = shaAt === -1 ? currentCommit() : process.argv[shaAt + 1];
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('expected commit must be a full Git SHA');
    if (command === 'build') {
      const result = buildSite();
      console.log(`PAYLOAD: ${result.manifest.assets.length} assets · v${result.manifest.gameVersion} · ${result.manifest.commitSha}`);
    } else if (command === 'verify') {
      const result = verifySite(directory, commit);
      console.log(`PAYLOAD: ${result.assets.length} assets verified`);
    } else if (command === 'vercel') {
      console.log(`PAYLOAD: prepared ${prepareVercel(directory, commit)}`);
    } else if (command === 'live') {
      const manifest = readManifest(directory);
      if (manifest.commitSha !== commit) throw new Error('release commit does not match expected commit');
      const count = await verifyLiveWithRetry(process.argv[3], manifest, { headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {} });
      console.log(`LIVE: ${count} assets match tested commit ${manifest.commitSha}`);
    } else throw new Error('usage: node tools/site-payload.mjs build|verify|vercel|live <URL> [--commit <SHA>]');
  } catch (error) { console.error(`PAYLOAD: ${error.message}`); process.exitCode = 1; }
}
