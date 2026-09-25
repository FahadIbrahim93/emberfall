const { defineConfig } = require('@playwright/test');

/* The browser suite must never write to a REAL deck's ledger. Specs hardcode
   http://127.0.0.1:8123 (the canonical origin; the game's client code and
   CSP assume it), so the suite boots its OWN deck on that port with a
   SCRATCH data dir — the first version of this isolation forgot the env in
   the command itself and the suite cheerfully registered pilots in the real
   emberfall-data ledger (115 → 116, caught by the before/after census).
   E2E_REUSE=1 attaches to whatever deck is already up instead (CI reuses
   the smoke deck there; locally that writes to the real ledger — your
   choice, your rows). */
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const PORT = Number(process.env.E2E_PORT) || 8123;
const BASE = 'http://127.0.0.1:' + PORT;

/* the data dir is minted here but ANNOUNCED by the deck itself: a seed
   script runs in a second process, and both re-requiring this config and
   trusting tmpdir-mtime heuristics failed live (the runner and the
   webServer each load the config, minting TWO tmpdirs; the newest marker
   belonged to the deck that never started). server.js writes the marker
   when EF_E2E_MARKER is set — the deck knows its own EF_DATA_DIR with
   certainty. */
const E2E_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'ef-e2e-'));
const E2E_MARKER = path.join(tmpdir(), 'ef-e2e-active-dir.txt');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { browserName: 'chromium', headless: true, baseURL: BASE },
  /* local CPUs juggle the suite (three consecutive full runs flaked a
     DIFFERENT timing test each time; each passed on retry). CI keeps one
     retry — the report shows retried tests transparently. */
  retries: 1,
  webServer: process.env.E2E_REUSE ? undefined : {
    command: 'node server.js --port ' + PORT,
    env: {
      ...process.env,
      EF_DATA_DIR: E2E_DATA_DIR,
      EF_E2E_MARKER: E2E_MARKER
    },
    url: BASE + '/api/health',
    reuseExistingServer: true /* a deck already on this port is reused AS-IS —
      including its real data dir. The isolated path only applies when the
      suite boots the deck itself. */
  }
});
module.exports.E2E_DATA_DIR = E2E_DATA_DIR;
module.exports.E2E_PORT = PORT;
