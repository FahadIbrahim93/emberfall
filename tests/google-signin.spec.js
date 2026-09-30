import { test, expect } from '@playwright/test';
import { GOOGLE } from '../playwright.config.js';

/* the title screen needs its first interaction before the chrome wakes:
   same boot ritual every panel spec uses (Space → dismiss the notes) */
async function openSettings(page) {
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  const notes = page.locator('#s-notes.on');
  if (await notes.count()) await page.click('#btnNotesClose');
  await page.click('#btnSettings');
  await expect(page.locator('#s-set')).toHaveClass(/on/, { timeout: 5000 });
}

/* v4.26 — Google sign-in in the real browser, against the real deck API.
   The GSI library is stubbed at its boundary (window.google.accounts.id):
   the button must still render from the deck's announced client id, and
   the credential → /api/auth/google → session flow must run end to end
   with the deck minting its OWN session — the same contract
   tools/drill-google.mjs proves at the API layer, here through the UI.
   The suite's deck IS configured (playwright.config.js writes a scratch
   JWKS and points EF_GOOGLE_JWKS_FILE at it), so GOOGLE.mint() produces
   tokens the deck's verifier honestly accepts.

   v4.26.1 — 12s ceilings instead of the 5s default (the lazy
   probe → paint chain brushed 5s under a full 4-worker local run; the
   runbook's "probe abort 2.5s→6s" lesson, same shape). The historical
   flake here was NOT timing — it was the per-worker throwaway keypair
   stomping the shared JWKS ('bad signature' 401s under parallel load)
   plus the deck's find-or-mint race; both are fixed at the root
   (playwright.config.js claim-once protocol, server.js IMMEDIATE
   transaction) and pinned by tools/drill-google.mjs act 5. */

test('google button arms from the deck config and drives the real sign-in flow', async ({ page }) => {
  await page.addInitScript(() => {
    let cred = null;
    window.__gsiFire = (c) => { cred = c; fire(); };
    function fire() { if (window.__gsiCfg && cred) window.__gsiCfg.callback({ credential: cred }); }
    window.google = {
      accounts: {
        id: {
          initialize: (cfg) => { window.__gsiCfg = cfg; },
          renderButton: (host) => {
            const b = document.createElement('button');
            b.id = 'gBtnStub';
            b.textContent = 'Continue with Google';
            b.onclick = fire;
            host.appendChild(b);
          }
        }
      }
    };
  });

  await openSettings(page);
  /* the suite's deck announces a client id via /api/health → the row arms */
  await expect(page.locator('#googleBox')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('#gBtnStub')).toBeVisible({ timeout: 12000 });

  const credential = GOOGLE.mint('e2e-google-sub-1', 'e2e.google.pilot@gmail.com');
  await page.evaluate((c) => window.__gsiFire(c), credential);

  /* the panel flips to signed-in, and the session is the deck's OWN */
  await expect(page.locator('#acctStat')).toContainText('e2egooglepil', { timeout: 12000 });
  const me = await page.evaluate(async () => (await (await fetch('/api/me', {
    headers: { 'X-Emberfall': 'command-deck', Authorization: 'Bearer ' + localStorage.getItem('emberfall2.token') }
  })).json()));
  expect(me.user.google).toBe(true);
  expect(me.user.name.toUpperCase()).toBe('E2EGOOGLEPILO'.slice(0, 12));
});

test('password pilots keep working beside Google (register → me → sign out)', async ({ page }) => {
  /* the long multi-stage flow (register → reload → re-boot ritual → sign
     out) needs room on a starved laptop — same tolerance ledger.spec and
     deck-link.spec already claim for their cross-boot dances */
  test.setTimeout(90000);
  await openSettings(page);
  const regStatus = await page.evaluate(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' },
        body: JSON.stringify({ name: 'GsiN' + Math.floor(Math.random() * 900000 + 100000), password: 'panel-pass-1' })
      });
      if (r.status === 200) {
        const me = await (await fetch('/api/me')).json();
        return { reg: 200, meUser: me.user && me.user.name };
      }
      /* a parallel burst may legitimately spend the register bucket —
         wait out the minute window instead of drowning in 429s */
      if (r.status === 429) { await new Promise(res => setTimeout(res, 61000)); continue; }
      return { reg: r.status, body: await r.text() };
    }
    return { reg: 'gave-up' };
  });
  expect(regStatus.reg).toBe(200);
  expect(regStatus.meUser, 'the cookie must already answer /api/me after register').toBeTruthy();
  await page.reload();
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  const notes2 = page.locator('#s-notes.on');
  if (await notes2.count()) await page.click('#btnNotesClose');
  await page.click('#btnSettings');
  await expect(page.locator('#acctStat')).toContainText('signed in');
  await page.click('#btnAcctOut');
  await expect(page.locator('#acctStat')).toContainText('deck linked', { timeout: 15000 });
});
