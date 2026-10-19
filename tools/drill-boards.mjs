#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   drill-boards.mjs — the public ladder is one dossier.

   A board row has to be the flight that set the score. This drill flies
   two accepted runs from one pilot (a loud low run, then a quieter best)
   and proves:

     * the worldwide row wears the best run's hull, wave, paint, mastery
     * a non-allowlisted paint is stored as none, never echoed
     * equal bests share a competition rank; the earlier flight is listed
       first
     * /pilot/<name> JSON and the HTML page tell that same story
     * the season total is the best runs, and the mirror SQL publishes
       that row (not the louder lesser one)

   Own scratch deck. Exit 0 = all green.
   BOARD_DRILL_PORT=<port> node tools/drill-boards.mjs
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeHealth, assertPortFree, assertNotLive } from './live-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.BOARD_DRILL_PORT || 8185;
const BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0, child = null;
const say = (...a) => console.log(...a);
const good = m => { pass++; say('  ok  -', m); };
const bad = m => { fail++; say('  FAIL-', m); };

const ARC = [[2.1, 1, 320, 4, 30, 12, 3, 1], [12.4, 2, 940, 11, 72, 31, 8, 2], [25.0, 3, 1880, 19, 118, 54, 15, 2], [44.7, 3, 2410, 24, 151, 66, 21, 2]];
const ARC_8000 = [[4.5, 1, 800, 6, 40, 16, 2, 1], [9.0, 2, 2200, 14, 90, 40, 6, 2], [14.0, 3, 4800, 28, 160, 70, 12, 2], [20.0, 4, 8000, 40, 220, 100, 18, 2]];
const ARC_9000 = [[5, 1, 900, 8, 40, 16, 2, 1], [10, 2, 2500, 16, 100, 40, 6, 2], [16, 3, 5500, 30, 180, 80, 12, 2], [22, 4, 9000, 44, 240, 110, 18, 2]];
const ARC_5000 = [[4, 1, 800, 6, 30, 12, 2, 1], [9, 2, 2200, 14, 80, 30, 6, 2], [16, 3, 5000, 24, 140, 60, 12, 2]];

async function req(method, p, { body, token, accept } = {}) {
  const headers = { 'X-Emberfall': 'command-deck' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Cookie = 'EF_SESSION=' + token;
  if (accept) headers.Accept = accept;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html or plain */ }
  const set = res.headers.get('set-cookie') || '';
  const m = /EF_SESSION=([^;]+)/.exec(set);
  return { status: res.status, json, text, token: m ? m[1] : null, type: res.headers.get('content-type') || '' };
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-boards-'));
  say(`── booting a scratch deck on :${PORT}`);
  await assertPortFree(await probeHealth(BASE), BASE, 'drill-boards', 'BOARD_DRILL_PORT');
  child = spawn(process.execPath, ['server.js', '--port', String(PORT)], {
    cwd: ROOT, env: { ...process.env, EF_DATA_DIR: dataDir }, stdio: 'ignore'
  });
  const h = await (async () => {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(BASE + '/api/health');
        if (r.ok) { const j = await r.json(); if (j.ok) return j; }
      } catch { /* booting */ }
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  })();
  if (!h) { say('  FAIL- deck never became healthy'); process.exit(1); }
  assertNotLive(h, BASE, 'drill-boards');

  async function pilot(name) {
    const reg = await req('POST', '/api/register', { body: { name, password: 'board-pass-1' } });
    if (reg.status !== 200 || !reg.token) { bad(name + ' register: ' + reg.status); return null; }
    return reg.token;
  }
  async function fly(token, body) {
    const r = await req('POST', '/api/scores', { token, body });
    if (!(r.json && r.json.verdict === 'accepted')) bad('run refused: ' + JSON.stringify(r.json).slice(0, 160));
    return r;
  }

  say('── two flights, one record');
  const ace = await pilot('Ace Board');
  const twin = await pilot('Twin Board');
  const rival = await pilot('Rival');
  const glitch = await pilot('Glitch');
  if (!ace || !twin || !rival || !glitch) {
    say('DRILL-BOARDS: registration failed');
    process.exit(1);
  }
  await fly(ace, { mode: 'main', score: 2410, wave: 3, ship: 'halcyon', diff: 1, paint: 'night', mastery: 5, runT: 44.7, kills: 24, cps: ARC });
  await fly(twin, { mode: 'main', score: 8000, wave: 4, ship: 'vesper', diff: 1, paint: 'gold', mastery: 0, runT: 20, kills: 40, cps: ARC_8000 });
  await fly(ace, { mode: 'main', score: 8000, wave: 4, ship: 'vesper', diff: 1, paint: 'gold', mastery: 1, runT: 20, kills: 40, cps: ARC_8000 });
  await fly(rival, { mode: 'main', score: 9000, wave: 4, ship: 'atlas', diff: 1, paint: 'crimson', mastery: 2, runT: 22, kills: 44, cps: ARC_9000 });
  await fly(glitch, { mode: 'main', score: 5000, wave: 3, ship: 'wraith', diff: 1, paint: '<x>', mastery: 4, runT: 16, kills: 24, cps: ARC_5000 });

  await req('PUT', '/api/profile', { token: ace, body: { meta: { paint: 'slate', alloy: 1 }, cfg: {}, updated: Date.now() } });
  await req('PUT', '/api/profile', { token: glitch, body: { meta: { paint: '<img' }, cfg: {}, updated: Date.now() } });

  const board = await req('GET', '/api/scores?mode=main');
  const top = (board.json && board.json.top) || [];
  const row = top.find(r => r.n === 'Ace Board');
  row && row.s === 8000 && row.ship === 'vesper' && row.w === 4 && row.p === 'gold' && row.m === 1 && row.rank === 2
    ? good('Ace board row is the best flight (vesper, W4, gold, M1, rank 2), not the louder halcyon run')
    : bad('ace row: ' + JSON.stringify(row));
  const twinRow = top.find(r => r.n === 'Twin Board');
  twinRow && twinRow.rank === 2 && top.indexOf(twinRow) < top.indexOf(row)
    ? good('equal bests share rank 2, and the earlier flight is listed first')
    : bad('tie order: ' + JSON.stringify(top.map(r => [r.n, r.rank, r.s])));
  const rivalRow = top.find(r => r.n === 'Rival');
  rivalRow && rivalRow.rank === 1 && rivalRow.s === 9000
    ? good('the higher score holds rank 1')
    : bad('rival: ' + JSON.stringify(rivalRow));
  const glitchRow = top.find(r => r.n === 'Glitch');
  glitchRow && glitchRow.p === null && glitchRow.rank === 4
    ? good('a paint outside the wardrobe is stored as none and does not rank as a color')
    : bad('glitch paint: ' + JSON.stringify(glitchRow));

  const dossier = await req('GET', '/pilot/ace%20board');
  const b = dossier.json && dossier.json.bests && dossier.json.bests.main;
  dossier.status === 200 && b && b.s === 8000 && b.ship === 'vesper' && b.paint === 'gold' && b.rank === 2 &&
    dossier.json.paint === 'slate' && dossier.json.season && dossier.json.season.pts === 10410 && dossier.json.season.rank === 1
    ? good('JSON dossier: best run, worn paint, season total')
    : bad('dossier: ' + JSON.stringify(dossier.json).slice(0, 240));
  const glitchDoc = await req('GET', '/pilot/Glitch');
  glitchDoc.json && glitchDoc.json.paint === null
    ? good('a profile paint outside the wardrobe is not public')
    : bad('glitch worn paint: ' + JSON.stringify(glitchDoc.json && glitchDoc.json.paint));

  const page = await req('GET', '/pilot/Ace%20Board', { accept: 'text/html' });
  page.status === 200 && page.type.includes('text/html') && page.text.includes('VESPER-01') &&
    page.text.includes('8,000') && page.text.includes('slate') && !page.text.includes('HALCYON') && !page.text.includes('<x>')
    ? good('HTML profile shows the best hull and worn paint, not the lesser flight')
    : bad('html: ' + page.status + ' ' + page.type + ' ' + page.text.slice(0, 180));
  const missing = await req('GET', '/pilot/nobody');
  missing.status === 404 && missing.text.includes('no such pilot')
    ? good('unknown pilot stays a JSON-less 404 for API clients')
    : bad('missing: ' + missing.status);

  const season = await req('GET', '/api/season');
  const lead = season.json && season.json.top && season.json.top[0];
  lead && lead.n === 'Ace Board' && lead.pts === 10410 && lead.rank === 1
    ? good('season ladder sums the best runs and ranks Ace first')
    : bad('season: ' + JSON.stringify(lead));

  say('── mirror SQL publishes the same row');
  const sql = await new Promise((resolve, reject) => {
    const childSql = spawn(process.execPath, ['tools/db-sync.mjs', '--print-sql'], {
      cwd: ROOT, env: { ...process.env, EF_DATA_DIR: dataDir }
    });
    let out = '', err = '';
    childSql.stdout.on('data', c => { out += c; });
    childSql.stderr.on('data', c => { err += c; });
    childSql.on('exit', code => code === 0 ? resolve(out) : reject(new Error(err || ('exit ' + code))));
  }).catch(e => { bad('db-sync: ' + e.message); return ''; });
  /'Ace Board', 8000, 4, 'vesper', 'gold'/.test(sql) && /'Ace Board', 10410, 2, 8000, 1/.test(sql) &&
    !sql.includes('<x>') && sql.includes('insert into public.pilot_cards') && /'Ace Board', '[^']+', 'slate'/.test(sql)
    ? good('mirror SQL carries the best-run standing, the season total, and the allowlisted paint')
    : bad('sql missing the dossier — snippet: ' + sql.slice(0, 240));

  if (child) child.kill('SIGKILL');
  if (fail === 0) say(`DRILL-BOARDS: ALL GREEN (${pass} checks)`);
  else say(`DRILL-BOARDS: ${fail} FAILURES ABOVE (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

process.on('exit', () => { try { if (child) child.kill('SIGKILL'); } catch { /* gone */ } });
main().catch(e => { console.error('drill-boards harness error:', e); process.exit(1); });
