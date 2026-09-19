#!/usr/bin/env node
/* selftest-baseline.js — one-shot: boots the deck, runs ?selftest, and writes
   tools/selftest-baseline.json from the LIVE results. Run this when the suite
   changes, review the diff, and commit it together with the suite change.
   CI (tools/selftest-ci.js) then asserts totals AND the exact test set — a
   silently skipped check cannot ship. */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '8123' }, stdio: 'ignore'
  });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8123/index.html?selftest', { waitUntil: 'domcontentloaded' });
  let res = null, end = Date.now() + 120000;
  while (Date.now() < end) {
    res = await page.evaluate(() => window.__EF_SELFTEST_RESULT__ || null).catch(() => null);
    if (res) break;
    await new Promise(r => setTimeout(r, 500));
  }
  await browser.close(); server.kill();
  if (!res || !res.pass) {
    console.error('suite not green — refusing to write a baseline');
    process.exit(1);
  }
  const out = {
    total: res.total,
    passed: res.passed,
    tests: res.map.map(x => x[0])
  };
  fs.writeFileSync(__dirname + '/selftest-baseline.json', JSON.stringify(out, null, 2) + '\n');
  console.log('baseline written:', out.total, 'tests,', out.passed, 'passing');
})();
