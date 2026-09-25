const { test, expect } = require('@playwright/test');

/* ═══════════════════════════════════════════════════════════════════════
   first-contact.spec.js — the game teaches dodging at the moment it matters.

   v4.20 made wave 1 fire at ~6s. The learning moment must land at the same
   instant: the striker's codex card ("muzzle lights up before it shoots")
   appears at FIRST SIGHT, on a fresh profile (the card dedupes through
   META.codex in localStorage — a fresh context is a fresh pilot).

   Contract: a brand-new pilot sees CODEX · STRIKER with the fire tell
   inside the first 20 seconds of the first run — before or as the first
   aimed shots arrive.

   Run:  npx playwright test tests/first-contact.spec.js
   ═══════════════════════════════════════════════════════════════════════ */

test('a fresh pilot is taught the striker at first sight', async ({ browser }) => {
  const context = await browser.newContext();      // fresh localStorage → fresh META
  const page = await context.newPage();
  await page.goto('/');

  await page.keyboard.press('Space');              // arm
  await page.waitForTimeout(350);
  const launch = page.getByRole('button', { name: /Launch intercept/i });
  await expect(launch).toBeVisible({ timeout: 5000 });
  await launch.click();
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => (typeof GAME !== 'undefined' && GAME.state) || 'boot');
  if (s === 'hangar') {
    const bay = page.getByRole('button', { name: /^Launch$/i });
    await expect(bay).toBeVisible({ timeout: 5000 });
    await bay.click();
  }

  /* the codex card is a live DOM note in #feed; strikers arrive ~6s in */
  const card = page.locator('#feed .note.codex', { hasText: 'STRIKER' });
  await expect(card, 'the striker codex card appears at first sight').toBeVisible({ timeout: 20000 });
  await expect(card).toContainText(/muzzle/i);     // the tell, not just the name

  /* and the game recorded the encounter (dedupe bookkeeping = shown exactly once) */
  const seen = await page.evaluate(() => (typeof META !== 'undefined' && META.codex && META.codex.striker) || 0);
  expect(seen, 'META.codex.striker recorded').toBe(1);

  await context.close();
});
