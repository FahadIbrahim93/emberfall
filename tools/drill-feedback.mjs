#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-feedback.mjs — the listening deck's contract, proven end to end.

   Boots a scratch deck WITH TRUST_PROXY=1 so X-Forwarded-For can simulate
   a second device from one machine (the only honest multi-device rig on
   localhost). Proves:
     - anon notes are first-class (no session, still stored)
     - garbage coerced, never stored (short text, bad ship, bad stage)
     - the 5/hour/IP feedback cap (429 with telemetry, then 200 again from
       a different device)
     - the funnel vocabulary is closed ('wallet' dies)
     - funnel dedupe is per DEVICE per DAY (A's repeats stay one row,
       B's boot is a second device)
     - a signed-in pilot's note carries their name in the operator read
     - /api/stats aggregates: feedback total/7d + funnel COUNT(DISTINCT)

     FB_PORT=<port> node tools/drill-feedback.mjs
   Exit 0 = all green · exit 1 = any gap · the live-ledger fence applies.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeHealth, assertPortFree, assertNotLive } from './live-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.FB_PORT || 8177;
const BASE = 'http://127.0.0.1:' + PORT;
const HDR = { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' };
let pass = 0, fail = 0, child = null;
const say = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad = m => { fail++; say('  FAIL-', m); };

async function req(method, p, { body, token, ip } = {}) {
  const headers = { ...HDR };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (ip) headers['X-Forwarded-For'] = ip;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
}

const tokenOf = sc => { const m = /EF_SESSION=([^;\r]+)/.exec(sc || ''); return m ? m[1] : null; };

function bootDeck(dataDir) {
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), EF_DATA_DIR: dataDir, TRUST_PROXY: '1' },
    stdio: 'ignore'
  });
}

async function waitHealthy() {
  for (let i = 0; i < 40; i++) {
    try { const h = await req('GET', '/api/health'); if (h.json && h.json.ok) return h.json; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-feedback-'));
  say(`── booting a scratch deck on :${PORT} (${dataDir})`);
  await assertPortFree(await probeHealth(BASE), BASE, 'drill-feedback', 'FB_PORT');
  bootDeck(dataDir);
  const h = await waitHealthy();
  if (!h) { bad('deck never came up'); return finish(); }
  good('scratch deck healthy (TRUST_PROXY=1 — X-Forwarded-For simulates devices)');
  assertNotLive(h, BASE, 'drill-feedback');

  const note = async (text, extra, ip) => req('POST', '/api/feedback', { body: { text, ...extra }, ip });
  const stage = async (s, ip) => req('POST', '/api/funnel', { body: { stage: s }, ip });

  say('── anon notes are first-class, garbage never stored');
  const a1 = await note('wave 3 shooters cornered me - felt unfair', { ship: 'vesper', wave: 3, mode: 'main' }, '203.0.113.10');
  (a1.status === 200 && a1.json.ok) ? good('anon note accepted') : bad('anon note: ' + JSON.stringify(a1.json));
  const short = await note('x', {}, '203.0.113.10');
  short.status === 400 ? good('too-short refused (400)') : bad('short text: ' + JSON.stringify(short.json));
  const fuzz = await note('ship fuzz and wave fuzz', { ship: 'deathstar', wave: 99999 }, '203.0.113.10');
  (fuzz.status === 200 && fuzz.json.ok) ? good('fuzzed ship/wave coerced, note accepted') : bad('fuzz: ' + JSON.stringify(fuzz.json));

  say('── the cap: 5/hour/IP (ATTEMPTS count — refusals spend the bucket too, garbage is never free)');
  /* budget so far: a1 + the refused short probe + fuzz = 3 attempts; two
     fillers make 5, so the next attempt from this device must 429 */
  for (let i = 0; i < 2; i++) await note('filler note ' + i, {}, '203.0.113.10');
  const sixth = await note('the sixth attempt must die', {}, '203.0.113.10');
  sixth.status === 429 ? good('6th attempt from the same device: honest 429') : bad('cap: ' + JSON.stringify(sixth.json));
  const other = await note('a different device still sails', { ship: 'wraith', wave: 1 }, '203.0.113.11');
  other.status === 200 ? good('a second device is unaffected by the first cap') : bad('other device: ' + JSON.stringify(other.json));

  say('── the funnel: closed vocabulary, per-device dedupe');
  const bs = await stage('wallet', '203.0.113.10');
  bs.status === 400 ? good('unknown stage refused') : bad('wallet: ' + JSON.stringify(bs.json));
  await stage('boot', '203.0.113.10'); await stage('boot', '203.0.113.10'); await stage('boot', '203.0.113.10');
  await stage('armed', '203.0.113.10'); await stage('k1', '203.0.113.10');
  await stage('boot', '203.0.113.11'); await stage('w5', '203.0.113.11');
  say('  (device A: boot x3 + armed + k1 · device B: boot + w5)');

  say('── a signed-in pilots note carries their callsign');
  const uname = 'Fbp' + Math.random().toString(36).slice(2, 7);
  const reg = await req('POST', '/api/register', { body: { name: uname, password: 'fb-pass-1' }, ip: '203.0.113.12' });
  if (!(reg.json && reg.json.ok)) { bad('register: ' + JSON.stringify(reg.json)); return finish(); }
  const login = await req('POST', '/api/login', { body: { name: uname, password: 'fb-pass-1' }, ip: '203.0.113.12' });
  const tok = tokenOf(login.headers.get('set-cookie'));
  const signed = await req('POST', '/api/feedback', { body: { text: 'signed note from the account world', ship: 'atlas', wave: 7, mode: 'main' }, token: tok, ip: '203.0.113.12' });
  signed.status === 200 ? good('signed-in note accepted') : bad('signed note: ' + JSON.stringify(signed.json));

  say('── the reads: operator list + stats aggregates');
  const list = await req('GET', '/api/feedback', { ip: '203.0.113.10' });
  const rows = (list.json && list.json.list) || [];
  const signedRow = rows.find(r => r.text === 'signed note from the account world');
  (rows.length >= 6 && signedRow && signedRow.pilot === uname) ? good('operator read: ' + rows.length + ' notes, signed author named, anon rows nameless')
    : bad('operator read shape: ' + JSON.stringify(list.json).slice(0, 160));
  const anonLeak = rows.some(r => !r.text.includes('account world') && r.pilot);
  anonLeak ? bad('an ANON row carried a pilot name') : good('no anon row carries identity');
  const stats = await req('GET', '/api/stats', { ip: '203.0.113.10' });
  const s = stats.json || {};
  (s.feedback && s.feedback.total >= 6 && s.funnel && s.funnel.boot === 2 && s.funnel.armed === 1 && s.funnel.k1 === 1 && s.funnel.w5 === 1)
    ? good('stats: feedback.total=' + s.feedback.total + ', funnel boot/armed/k1/w5 = ' + s.funnel.boot + '/' + s.funnel.armed + '/' + s.funnel.k1 + '/' + s.funnel.w5)
    : bad('stats aggregates: ' + JSON.stringify(s).slice(0, 200));
  const k1v = (s.funnel && s.funnel.k1) || 0;
  k1v === 1 ? good('funnel counts DEVICES (A fired boot x3, boot still = 2)') : bad('funnel inflated by repeats?');

  return finish();
}

function finish() {
  if (child) { try { child.kill(); } catch { /* gone */ } child = null; }
  console.log(`── verdict: pass=${pass} fail=${fail}`);
  console.log(fail === 0 ? 'DRILL-FEEDBACK: ALL GREEN' : 'DRILL-FEEDBACK: RED');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('drill crashed:', e.message); finish(); });
