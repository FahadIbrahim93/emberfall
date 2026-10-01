#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-restore.mjs — the restore rehearsal (ROADMAP gap 12's third leg).

   `db-backup --verify` proves a snapshot EXISTS and OPENS. This drill
   proves a snapshot WORKS: the ledger's full round trip, end to end.

     act 1   boot a scratch deck, onboard a real pilot (register + an
             accepted honest run) — the ledger now holds state worth saving
     act 2   take a live backup --verify (no deck stop — the WAL-contract)
     act 3   DESTROY the data dir entirely (the machine-loss simulation:
             db, -wal, -shm, everything)
     act 4   restore = copy the snapshot back over the virgin path
             (exactly the documented operator procedure)
     act 5   reboot the deck on the restored dir and log the pilot in:
             same scrypt salt+hash, same accepted run on the board,
             same census. Nothing lost, nothing invented.

   This is the drill a real rollout must pass before its first real
   pilot: a backup that has never been restored is a hope, not a plan.

     RESTORE_DRILL_PORT=<port> node tools/drill-restore.mjs
   Exit 0 = all green · exit 1 = any gap · the live-ledger fence applies.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { probeHealth, assertPortFree, assertNotLive } from './live-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.RESTORE_DRILL_PORT || 8183;
const BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0, child = null, dataDir = null;
const say = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad = m => { fail++; say('  FAIL-', m); };

function boot() {
  child = spawn(process.execPath, ['server.js', '--port', String(PORT)], {
    cwd: ROOT, env: { ...process.env, EF_DATA_DIR: dataDir }, stdio: 'ignore'
  });
}
async function waitHealthy() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) { const j = await r.json(); if (j.ok) return j; } } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}
const kill = () => { try { if (child) { child.kill('SIGKILL'); child = null; } } catch { /* gone */ } };

async function req(method, p, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
}
const tokenOf = sc => { const m = /EF_SESSION=([^;\r]+)/.exec(sc || ''); return m ? m[1] : null; };
/* the battery's proven-honest arc — the plausibility engine accepts exactly this shape */
const ARC = [[2.1, 1, 320, 4, 30, 12, 3, 1], [12.4, 2, 940, 11, 72, 31, 8, 2], [25.0, 3, 1880, 19, 118, 54, 15, 2], [44.7, 3, 2410, 24, 151, 66, 21, 2]];

async function main() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-restore-'));
  say(`── booting a scratch deck on :${PORT} (${dataDir})`);
  await assertPortFree(await probeHealth(BASE), BASE, 'drill-restore', 'RESTORE_DRILL_PORT');
  boot();
  const h = await waitHealthy();
  if (!h) { say('  FAIL- deck never became healthy'); process.exit(1); }
  assertNotLive(h, BASE, 'drill-restore');
  say(`── deck up (pilot census: ${h.pilots})`);

  /* act 1 — real state worth saving: a pilot and an accepted run */
  say('── act 1: onboard a real pilot + an accepted run (the state that must survive)');
  const name = 'Phx' + String(Date.now()).slice(-6);
  const reg = await req('POST', '/api/register', { body: { name, password: 'restore-pass-1' } });
  reg.status === 200 ? good(`pilot ${name} registered`) : bad('register: ' + reg.status);
  const tok = tokenOf(reg.headers.get('set-cookie') || '');
  const sc = await req('POST', '/api/scores', { token: tok, body: { mode: 'main', score: 2410, wave: 3, ship: 'vesper', diff: 1, runT: 44.7, kills: 24, cps: ARC } });
  sc.status === 200 && sc.json && sc.json.ok ? good('accepted honest run banked (2410)') : bad('score: ' + JSON.stringify(sc.json).slice(0, 100));

  /* act 2 — live backup with verify, no deck stop */
  say('── act 2: live backup --verify (deck still running — the WAL contract)');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-restore-bak-'));
  /* EF_DATA_DIR must ride along EXPLICITLY: db-backup otherwise resolves
     its default (the repo-sibling production ledger) and would happily
     back up the WRONG database while claiming success — the 2026-09-25
     incident class, caught by this drill's own first flight because the
     census check at act 5 refused to lie */
  execFileSync(process.execPath, [path.join('tools', 'db-backup.js'), '--out', outDir, '--verify'], { cwd: ROOT, env: { ...process.env, EF_DATA_DIR: dataDir }, encoding: 'utf8' });
  const snaps = fs.readdirSync(outDir).filter(f => f.endsWith('.db'));
  snaps.length === 1 ? good('one verified snapshot written: ' + snaps[0]) : bad('snapshots: ' + JSON.stringify(snaps));
  const snapPath = path.join(outDir, snaps[0]);
  const bytes = fs.statSync(snapPath).size;
  bytes > 4096 ? good(`snapshot carries real content (${bytes} bytes)`) : bad('suspiciously small snapshot: ' + bytes);

  /* act 3 — the machine-loss simulation: destroy the data dir entirely */
  say('── act 3: DESTROY the ledger dir (machine-loss simulation)');
  kill();
  await new Promise(r => setTimeout(r, 400));
  const had = fs.readdirSync(dataDir).filter(f => f.startsWith('emberfall.db'));
  had.length >= 1 ? good('the dir held the ledger (' + had.join(', ') + ')') : bad('nothing to destroy: ' + JSON.stringify(fs.readdirSync(dataDir)));
  fs.rmSync(dataDir, { recursive: true, force: true });
  !fs.existsSync(dataDir) ? good('ledger dir erased — db, -wal, -shm, everything gone') : bad('dir survived the rm');

  /* act 4 — restore: the documented operator procedure, verbatim */
  say('── act 4: restore from the snapshot alone (copy back, sidecars gone with the dir)');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(snapPath, path.join(dataDir, 'emberfall.db'));
  good('snapshot copied to ' + path.join(dataDir, 'emberfall.db'));

  /* act 5 — reboot and prove the state came back */
  say('── act 5: reboot on the restored ledger — the pilot flies again');
  boot();
  const h2 = await waitHealthy();
  if (!h2) { bad('deck never became healthy on the restored ledger'); }
  else {
    assertNotLive(h2, BASE, 'drill-restore');
    h2.pilots === 1 ? good('census survived: 1 pilot (not 0, not 2)') : bad('census: ' + JSON.stringify(h2.pilots));
    const login = await req('POST', '/api/login', { body: { name, password: 'restore-pass-1' } });
    login.status === 200 ? good('login succeeds — the scrypt salt+hash came back intact') : bad('login after restore: ' + login.status + ' ' + JSON.stringify(login.json).slice(0, 80));
    const tok2 = tokenOf(login.headers.get('set-cookie') || '');
    const bd = await req('GET', '/api/scores?mode=main', { token: tok2 });
    const mine = bd.json && bd.json.top && bd.json.top.find(t => t.n === name);
    mine && mine.s === 2410 ? good('the accepted run is back on the board (2410)') : bad('board after restore: ' + JSON.stringify(bd.json && bd.json.top).slice(0, 100));
    const me = await req('GET', '/api/me', { token: tok2 });
    me.status === 200 && me.json && me.json.user ? good('/api/me answers the restored identity') : bad('/api/me: ' + me.status);
  }

  kill();
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* tmp */ }
  if (fail === 0) say(`DRILL-RESTORE: ALL GREEN (${pass} checks)`);
  else say(`DRILL-RESTORE: ${fail} FAILURES ABOVE (${pass} passed)`);
  process.exitCode = fail === 0 ? 0 : 1;
}

process.on('exit', () => { kill(); });

main().catch(e => { console.error('drill-restore harness error:', e); process.exit(1); });
