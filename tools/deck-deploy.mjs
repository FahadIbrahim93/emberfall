#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   deck-deploy.mjs — one command from this repo to a LIVE command deck.

   The deck is one process, one origin, one SQLite file (docs/DEPLOYMENT.md).
   fly.toml + the multi-stage Dockerfile carry the whole contract: the
   image build RUNS the no-browser battery, so a red gate can never ship;
   the /data named volume keeps the ledger across deploys and restarts.

   Subcommands:
     plan     print the operator checklist (what only a human can do)
     doctor   preflight: flyctl present? authed? git tree clean? volume?
     launch   first-time: create app + volume + secrets + deploy (one shot)
     deploy   subsequent deploys (gates run in the image build)
     verify   post-deploy acceptance: health, live flag, CORS echo, page

   Auth: FLY_API_TOKEN env wins (CI-friendly); otherwise the local
   `flyctl auth login` state is used. Never commits, never pushes.

     node tools/deck-deploy.mjs plan | doctor | launch | deploy | verify
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP = 'emberfall-deck';
const ORIGIN = 'https://' + APP + '.fly.dev';
const PAGES = 'https://fahadibrahim93.github.io';
const CMD = process.platform === 'win32' ? path.join(process.env.USERPROFILE || '', '.flyctl', 'bin', 'flyctl.exe') : 'flyctl';
const say = (...a) => console.log(...a);
const die = m => { say('DECK-DEPLOY:', m); process.exit(1); };

function fly(args, { stdin } = {}) {
  const env = { ...process.env };
  if (!process.env.FLY_API_TOKEN) delete env.FLY_API_TOKEN;   /* local auth state */
  return execFileSync(CMD, args, {
    cwd: ROOT, env, stdio: ['pipe', 'pipe', 'inherit'],
    input: stdin, timeout: 15 * 60_000, encoding: 'utf8'
  });
}

function gitClean() {
  const s = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  return s.trim() === '';
}

async function main() {
  const cmd = process.argv[2] || 'plan';

  if (cmd === 'plan') {
    say(`── the operator checklist (only a human can do these)`);
    say(`1. create the Fly account + a personal token:  https://fly.io/app/user-settings/tokens`);
    say(`   (or run  ${CMD} auth login  once on this machine)`);
    say(`2. for Gmail sign-in, create an OAuth client (type: Web application):`);
    say(`   https://console.cloud.google.com/apis/credentials`);
    say(`   Authorized JavaScript origins:`);
    say(`     ${PAGES}`);
    say(`     ${ORIGIN}`);
    say(`   No redirect URI is needed — the deck verifies tokens itself.`);
    say(`3. either export FLY_API_TOKEN (and GOOGLE_CLIENT_ID if step 2 done) or be authed locally`);
    say(`4. run:   node tools/deck-deploy.mjs launch     (first time)`);
    say(`   then:  node tools/deck-deploy.mjs deploy     (every later release)`);
    say(`5. prove it:  node tools/deck-deploy.mjs verify`);
    return;
  }

  if (cmd === 'doctor') {
    if (!fs.existsSync(CMD)) die(`flyctl not found at ${CMD} — install it (see plan)`);
    say('ok - flyctl present:', execFileSync(CMD, ['version'], { encoding: 'utf8' }).split('\n')[0]);
    try { fly(['auth', 'whoami']); say('ok - fly auth: authenticated' + (process.env.FLY_API_TOKEN ? ' (FLY_API_TOKEN)' : '')); }
    catch { die('fly is not authenticated — run `flyctl auth login` or export FLY_API_TOKEN'); }
    if (!gitClean()) die('git tree is dirty — commit or stash first (release.mjs discipline: never deploy an unknown tree)');
    say('ok - git tree clean');
    const apps = fly(['apps', 'list', '--json']);
    if (JSON.stringify(apps).includes(`"${APP}"`)) say(`ok - app ${APP} exists (run 'deploy')`);
    else say(`note - app ${APP} does not exist yet (run 'launch')`);
    return;
  }

  if (cmd === 'launch' || cmd === 'deploy') {
    if (!fs.existsSync(CMD)) die(`flyctl not found at ${CMD} — install it (see plan)`);
    if (!gitClean()) die('git tree is dirty — commit or stash first; the image build must run gates on a known tree');

    if (cmd === 'launch') {
      say(`── creating the app (${APP}) — copies fly.toml, does NOT deploy yet`);
      fly(['launch', '--no-deploy', '--name', APP, '--region', 'iad', '--copy-config']);
      say('── creating the ledger volume (1GB, iad)');
      fly(['volumes', 'create', 'ef_data', '--size', '1', '--region', 'iad', '--yes']);
      say('── setting the secrets that make the deck production + world-readable');
      fly(['secrets', 'set', '--stage',
        `NODE_ENV=production`, `TRUST_PROXY=1`, `EF_LIVE_LEDGER=1`,
        `EF_CORS_ORIGINS=${PAGES}`]);
      if (process.env.GOOGLE_CLIENT_ID) {
        fly(['secrets', 'set', '--stage', `EF_GOOGLE_CLIENT_ID=${process.env.GOOGLE_CLIENT_ID}`]);
        say(`── Google sign-in: client id staged (${process.env.GOOGLE_CLIENT_ID.slice(0, 12)}…)`);
      } else {
        say(`── Google sign-in: not staged (export GOOGLE_CLIENT_ID to arm it; unset = the feature honestly does not exist)`);
      }
    }

    say(`── deploying (the image build RUNS the gate battery — a red gate can never ship)`);
    fly(['deploy']);
    say(`── deployed. verifying:`);
    return runVerify();
  }

  if (cmd === 'verify') return runVerify();

  die(`unknown subcommand: ${cmd} (plan | doctor | launch | deploy | verify)`);
}

async function runVerify() {
  const j = await fetch(ORIGIN + '/api/health').then(r => r.json()).catch(e => { die('health probe failed: ' + e.message); });
  j.ok === true ? say('ok - /api/health answers ok:true') : die('health not ok: ' + JSON.stringify(j));
  j.live === true ? say('ok - the deck self-identifies LIVE (EF_LIVE_LEDGER=1; the battery will refuse to touch it)') : die('deck is NOT flagged live — production ledgers must be fenced from batteries');
  const r = await fetch(ORIGIN + '/api/health', { headers: { Origin: PAGES } }).catch(e => die('CORS probe failed: ' + e.message));
  const acao = r.headers.get('access-control-allow-origin');
  acao === PAGES ? say('ok - CORS echoes the Pages origin (the live game can call this deck)') : die('CORS did not echo ' + PAGES + ' (got: ' + acao + ') — check EF_CORS_ORIGINS');
  const g = await fetch(ORIGIN + '/api/health').then(x => x.json()).catch(() => null);
  if (g && g.googleClientId) say('ok - Google sign-in is announced (' + String(g.googleClientId).slice(0, 12) + '…)');
  else say('note - Google sign-in is not configured on this deck (the button stays unarmed — honest)');
  say('── ledger durability (gap 12): a backup that has never been restored is a hope.');
  say('   schedule:  fly ssh console -C "node /app/tools/db-backup.js --verify --out /data/backups --keep 14"');
  say('   rehearsal: node tools/drill-restore.mjs   (live backup → destroy → restore → pilot logs in)');
  say(`── the Pages game adopts this deck automatically (deck.json ladder) — players get signup + boards with zero configuration.`);
  say(`── prove it yourself: open ${PAGES}/emberfall/ and create an account in Settings → Command deck.`);
  say('DECK-DEPLOY: VERIFIED');
}

main().catch(e => { console.error('deck-deploy harness error:', e); process.exit(1); });
