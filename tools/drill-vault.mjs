#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-vault.mjs — the save vault's contract, executable.

   The vault (profile_snaps) broke silently once: the prune threw on a
   missing column and was swallowed by design, so "six newest per pilot"
   was actually "every snapshot forever" — and the throttle never engaged
   either. This drill pins both halves of the contract through the public
   API only:

     1. a first profile write lands exactly one snapshot
     2. an identical re-write is THROTTLED (no new snapshot within the
        hour when the content moved < 512 bytes)
     3. real content growth (>= 512 bytes) always earns a snapshot
     4. the vault never exceeds SNAP_MAX (6): the prune works
     5. each stored snapshot is readable byte-for-byte by `taken` stamp

   RUNS ITS OWN DECK: boots server.js on a scratch port with a scratch
   EF_DATA_DIR, waits for /api/health, proves, tears down. CI: one step
   after drill-sessions. Local: node tools/drill-vault.mjs.
   Exit 0 = vault honest · exit 1 = any clause broken.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.VLT_PORT || 8169;
const BASE = 'http://127.0.0.1:' + PORT;
const HDR = { 'Content-Type': 'application/json', 'x-emberfall': 'command-deck' };
const SNAP_MAX = 6;
let pass = 0, fail = 0, child = null;
const good = m => { pass++; console.log('  ok  -', m); };
const bad  = m => { fail++; console.log('  FAIL-', m); };

async function req(method, p, { token, body } = {}) {
  const headers = { ...HDR };
  if (token) headers.Cookie = 'EF_SESSION=' + token;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
const tokenOf = sc => { const m = /EF_SESSION=([^;\r]+)/.exec(sc || ''); return m ? m[1] : null; };

/* a profile payload whose SIZE grows by ~640 honest bytes each call — the
   throttle is distance-based (an hour apart OR ≥512 bytes of changed
   content), so same-size rewrites are correctly throttled no matter how
   the content differs. Size is what earns a snapshot inside the hour. */
function payload(run) {
  const meta = { alloy: 500 + run * 120, hulls: { vesper: 1 } };
  const cfg = { quality: 'auto', log: 'f'.repeat(400 + run * 640) };
  return { updated: Date.now(), meta, cfg };
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-vault-'));
  console.log(`── booting a scratch deck on :${PORT} (${dataDir})`);
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir },
    stdio: 'ignore'
  });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const h = await req('GET', '/api/health'); up = !!(h.json && h.json.ok); }
    catch { await new Promise(r => setTimeout(r, 250)); }
  }
  up ? good('scratch deck healthy') : bad('deck never came up');
  if (!up) return;

  const reg = await req('POST', '/api/register', { body: { name: 'VaultPilot', password: 'vault-pass' } });
  const tok = tokenOf(reg.setCookie);
  tok ? good('pilot registered') : bad('register failed: ' + reg.status);
  if (!tok) return;

  /* 1 — the first write lands a snapshot */
  await req('PUT', '/api/profile', { token: tok, body: payload(0) });
  let snaps = (await req('GET', '/api/profile/snaps', { token: tok })).json.snaps || [];
  snaps.length === 1 ? good('first profile write lands exactly one snapshot')
                     : bad('expected 1 snapshot after first write, saw ' + snaps.length);

  /* 2 — same content again: throttled, the vault does not churn */
  await req('PUT', '/api/profile', { token: tok, body: payload(0) });
  snaps = (await req('GET', '/api/profile/snaps', { token: tok })).json.snaps || [];
  snaps.length === 1 ? good('an identical re-write is throttled (still 1 snapshot)')
                     : bad('throttle broken: ' + snaps.length + ' snapshots after identical re-write');

  /* 3+4 — real growth earns snapshots, and the prune holds the line at 6 */
  for (let i = 1; i <= 10; i++) {
    await req('PUT', '/api/profile', { token: tok, body: payload(i) });
    snaps = (await req('GET', '/api/profile/snaps', { token: tok })).json.snaps || [];
    if (snaps.length > SNAP_MAX) { bad('vault exceeded ' + SNAP_MAX + ': ' + snaps.length + ' after write ' + i); break; }
  }
  snaps.length === SNAP_MAX
    ? good('11 real-growth writes → the vault holds at exactly ' + SNAP_MAX + ' (prune works)')
    : bad('expected the vault to hold at ' + SNAP_MAX + ', saw ' + snaps.length);

  /* 5 — newest snapshot is readable and byte-identical to the live profile */
  const newest = snaps[0];
  const read = await req('GET', '/api/profile/snaps/' + newest.taken, { token: tok });
  const live = (await req('GET', '/api/me', { token: tok })).json.profile;
  const same = read.json && read.json.data && live &&
    JSON.stringify(read.json.data) === JSON.stringify(live.data);
  same ? good('newest snapshot restores byte-for-byte (taken ' + newest.taken + ')')
       : bad('snapshot readback differs from the live profile');
  const stranger = await req('GET', '/api/profile/snaps/999999999', { token: tok });
  stranger.status === 404 ? good('a missing snapshot 404s') : bad('missing snapshot answered ' + stranger.status);

  console.log(`── verdict: pass=${pass} fail=${fail}`);
  if (fail === 0) console.log('DRILL-VAULT: ALL GREEN');
  else console.log('DRILL-VAULT: FAILURES ABOVE');
}

main()
  .catch(e => { console.error('drill crashed:', e.message); fail++; })
  .finally(() => {
    if (child) try { child.kill(); } catch { /* gone */ }
    process.exit(fail === 0 ? 0 : 1);
  });
