#!/usr/bin/env node
/* selftest-ci.js — run the in-game ?selftest suite headlessly in CI (P0-4).
   The suite exposes window.__EF_SELFTEST_RESULT__ = { pass, passed, total, map }
   and prints a final `SELFTESTS n/m PASS|FAIL` marker. We assert:
     1. the marker line appears exactly once and says PASS
     2. the totals match the last committed count (stale baselines fail loudly)
     3. the named test list matches exactly — a silently skipped check fails
   Truth-in-copy rule (§0.5): the count this file demands is the only count
   README and the docs may claim. */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const PORT = process.env.SELFTEST_PORT || 8123;
const URL = `http://127.0.0.1:${PORT}/index.html?selftest`;

/* The contract: total + the exact set of test names. Update BOTH when the
   suite changes — that friction is the point (Directive 2: never weaken a
   check silently; a removed test must edit this list to ship). */
const EXPECT = require('./selftest-baseline.json');

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch (e) { /* retry */ }
    await wait(250);
  }
  throw new Error(`server never answered at ${url}`);
}

(async () => {
  /* CI runs this AFTER the deck is already up (smoke + browser smoke reuse
     it). If something already answers on the port, attach to it instead of
     spawning a second server — starting one would just EADDRINUSE. */
  let server = null;
  let deckUp = false;
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); deckUp = r.ok; } catch (e) { /* none */ }
  if (!deckUp) {
    server = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
  let serverLog = '';
  if (server) {
    server.stdout.on('data', d => { serverLog += d; });
    server.stderr.on('data', d => { serverLog += d; });
  }

  try {
    await waitForServer(`http://127.0.0.1:${PORT}/api/health`, 20000);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleLines = [];
    page.on('console', msg => consoleLines.push(msg.text()));
    page.on('pageerror', err => { console.error('PAGE ERROR:', err.message); process.exitCode = 1; });

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const end = Date.now() + 120000;
    let result = null;
    while (Date.now() < end) {
      result = await page.evaluate(() => window.__EF_SELFTEST_RESULT__ || null);
      if (result) break;
      await wait(500);
    }
    await browser.close();

    if (!result) {
      console.error('FAIL: suite never signalled completion (missing __EF_SELFTEST_RESULT__)');
      console.error(consoleLines.slice(-30).join('\n'));
      process.exit(1);
    }

    /* marker contract: exactly one final marker line (the game appends the
       result array as a second console arg — match the marker prefix) */
    const markers = consoleLines.filter(l => /^SELFTESTS \d+\/\d+ (PASS|FAIL)/.test(l.trim()));
    if (markers.length !== 1) {
      console.error(`FAIL: expected exactly 1 SELFTESTS marker line, got ${markers.length}`);
      process.exit(1);
    }
    const m = markers[0].trim().match(/^SELFTESTS (\d+)\/(\d+) (PASS|FAIL)/);

    /* totals must match the baseline exactly */
    if (Number(m[1]) !== EXPECT.passed || Number(m[2]) !== EXPECT.total || m[3] !== 'PASS') {
      console.error(`FAIL: marker says ${m[1]}/${m[2]} ${m[3]}, baseline demands ${EXPECT.passed}/${EXPECT.total} PASS`);
      for (const [name, p, err] of result.map || []) if (!p) console.error('  FAILED TEST:', name, '—', err);
      process.exit(1);
    }
    if (result.pass !== true || result.passed !== EXPECT.passed || result.total !== EXPECT.total) {
      console.error(`FAIL: result object ${result.passed}/${result.total} pass=${result.pass} disagrees with baseline ${EXPECT.passed}/${EXPECT.total}`);
      process.exit(1);
    }

    /* the exact test set must match — catches silently dropped checks */
    const names = (result.map || []).map(x => x[0]).sort();
    const want = [...EXPECT.tests].sort();
    const missing = want.filter(n => !names.includes(n));
    const extra = names.filter(n => !want.includes(n));
    if (missing.length || extra.length) {
      if (missing.length) console.error('FAIL: baseline tests missing from the run:', missing);
      if (extra.length) console.error('FAIL: unbaselined tests ran:', extra);
      console.error('Update tools/selftest-baseline.json together with the suite.');
      process.exit(1);
    }

    console.log(`SELFTEST-CI: ${result.passed}/${result.total} PASS — matches baseline, full set present`);
  } catch (err) {
    console.error('selftest-ci harness error:', err.message);
    console.error('server log tail:\n' + serverLog.slice(-800));
    process.exit(1);
  } finally {
    if (server) server.kill('SIGTERM');
  }
})();
