const { test, expect } = require('@playwright/test');

/* ops.html is the deck operator's cockpit. Its contract: same-origin reads
   of /api/health + /api/stats, the version read from the served footline,
   the live-flag card that mirrors the EF_LIVE_LEDGER fence, and an honest
   offline card. These tests run against the suite's scratch deck
   (unflagged, fresh ledger). */

test.describe(() => {
  test('ops page renders the real instruments of its own deck', async ({ page }) => {
    await page.goto('/ops.html');
    await expect(page.locator('h1')).toHaveText(/DECK OPS/, { timeout: 10000 });

    /* the census card renders a REAL count as a bare integer — never a
       dash, NaN, or a promise. (Not '0': other specs register pilots on
       this same suite deck in parallel; the census is a live figure.) */
    await expect(page.locator('.card', { hasText: 'PILOTS' }).locator('.big')).toHaveText(/^\d+$/, { timeout: 10000 });

    /* the live-fence card must show "off" — the suite's deck is never flagged */
    await expect(page.locator('.card', { hasText: 'LIVE LEDGER FENCE' }).locator('.big')).toHaveText('off', { timeout: 10000 });

    /* wardenfall honor card: the public aggregate as a bare integer (same
       concurrency note — other specs may pay honor-shaped daily rows) */
    await expect(page.locator('.card', { hasText: 'WARDENFALL HONOR' }).locator('.big')).toHaveText(/^\d+$/, { timeout: 10000 });

    /* version comes from the deck's own footline — the page must show it */
    await expect(page.locator('#v')).toHaveText(/^v\d+\.\d+\.\d+$/, { timeout: 15000 });
  });

  test('limiter card stays honest when the window is quiet', async ({ page }) => {
    await page.goto('/ops.html');
    /* on a fresh deck the window is quiet: the card says so, never lies */
    await expect(page.locator('.card', { hasText: 'LIMITER REFUSALS' })).toContainText('quiet window', { timeout: 10000 });
  });
});
