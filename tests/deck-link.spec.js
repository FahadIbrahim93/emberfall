const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

/* v4.22 — the ADR 0002 E2E: the game on THIS origin (the test server),
   flying a deck on ANOTHER port with an allowlist naming this origin.
   That is the exact Pages→deck topology, minus the internet. Proves:

     1. sign-up from a foreign origin: register through the panel →
        signed-in state (bearer token, not cookies)
     2. the account survives reload (localStorage token adopts the session)
     3. the global board reads the remote deck cross-origin
     4. the deck-address field switches decks (bad address → local mode,
        blank → back to the local deck)

   Boots its OWN second deck (scratch data dir, EF_CORS_ORIGINS aimed at
   the suite's origin) on a spare port. */

const XO_PORT = 8165;
const XO = 'http://127.0.0.1:' + XO_PORT;
let xoProc = null;

async function bootXo() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-e2e-xo-'));
  xoProc = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(XO_PORT), EF_DATA_DIR: dataDir, EF_CORS_ORIGINS: 'http://127.0.0.1:8123' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(XO + '/api/health');
      if (r.ok) return;
    } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('cross-origin deck never came up');
}

test.beforeAll(async () => { await bootXo(); });
test.afterAll(async () => { if (xoProc) try { xoProc.kill(); } catch { /* gone */ } });

async function playing(page) {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.getByRole('button', { name: /Launch intercept/i }).click();
  await expect(page.locator('#hud')).toBeVisible();
}

test('sign-up from a foreign origin works end to end and survives reload', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.evaluate(u => localStorage.setItem('emberfall2.deck', u), XO);
  await page.goto('/?deck=' + encodeURIComponent(XO));
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.locator('#btnSettings').click();
  await expect(page.locator('#s-set')).toHaveClass(/on/);
  await expect(page.locator('#acctStat')).toContainText('deck linked');
  // sign UP (the ease path: one callsign, one password, no email, done)
  await page.fill('#acctName', 'XO Pilot');
  await page.fill('#acctPass', 'cross-origin-pass');
  await page.click('#btnAcctNew');
  await expect(page.locator('#acctStat')).toContainText('signed in · XO Pilot', { timeout: 8000 }).catch(e => { throw new Error('SIGN-UP FAILED. console errors: ' + JSON.stringify(errors, null, 1)); });
  // the session is a bearer token held client-side — reload keeps it
  await page.reload({ waitUntil: 'load' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.locator('#btnSettings').click();
  await expect(page.locator('#acctStat')).toContainText('signed in · XO Pilot', { timeout: 8000 });
});

test('the global board flies the remote deck cross-origin', async ({ page }) => {
  await page.goto('/?deck=' + encodeURIComponent(XO));
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.locator('.tab[data-tab="global"]').click();
  await expect(page.locator('#globalStatus')).toContainText('(remote)', { timeout: 10000 });
  await expect(page.locator('#globalBody')).toBeVisible();
});

test('the deck-address field switches decks honestly', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.locator('#btnSettings').click();
  await expect(page.locator('#s-set')).toHaveClass(/on/);
  // a deck address that answers nothing: the game says so and stays local
  await page.fill('#deckUrl', 'http://127.0.0.1:9');
  await page.locator('#deckUrl').blur();
  await expect(page.locator('#acctStat')).toContainText('local mode', { timeout: 8000 });
  // clearing it returns to this origin's own deck
  await page.fill('#deckUrl', '');
  await page.locator('#deckUrl').blur();
  await expect(page.locator('#acctStat')).toContainText('deck linked', { timeout: 8000 });
});
