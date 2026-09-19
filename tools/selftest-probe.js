#!/usr/bin/env node
/* selftest-probe.js — local harness: boots the deck, runs ?selftest headless,
   prints totals + failing tests + the full name list (baseline source). */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '8123' }, stdio: 'ignore'
  });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const lines = [];
  page.on('console', m => lines.push(m.text()));
  page.on('pageerror', e => lines.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  await page.goto('http://127.0.0.1:8123/index.html?selftest', { waitUntil: 'domcontentloaded' });
  let res = null, end = Date.now() + 120000;
  while (Date.now() < end) {
    res = await page.evaluate(() => window.__EF_SELFTEST_RESULT__ || null).catch(() => null);
    if (res) break;
    await new Promise(r => setTimeout(r, 500));
  }
  await browser.close(); server.kill();
  if (!res) {
    console.log('NO RESULT; console tail:', lines.slice(-12));
    const canary = await page.evaluate(() => ({
      marker: typeof window.__EF_SELFTEST_RESULT__,
      stSum: (document.getElementById('stSum') || {}).textContent || null
    })).catch(e => String(e));
    console.log('canary:', JSON.stringify(canary));
    process.exit(1);
  }
  console.log('RESULT:', res.pass ? 'PASS' : 'FAIL', res.passed + '/' + res.total);
  for (const [n, p, e] of res.map) if (!p) console.log('FAILED:', n, '—', e);
  console.log('---NAMES---');
  for (const [n] of res.map) console.log(JSON.stringify(n));
})();
