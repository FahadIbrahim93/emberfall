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

  test('limiter card mirrors the deck telemetry honestly (quiet OR hot)', async ({ page }) => {
    await page.goto('/ops.html');
    const card = page.locator('.card', { hasText: 'LIMITER REFUSALS' });
    /* either state is honest: a quiet ring says so, a hot ring renders its
       buckets. On CI the shared battery deck is usually HOT (smoke and
       account.spec spend the stats/login buckets) — demanding "quiet"
       there was this test lying about production reality. */
    await page.waitForFunction(() => {
      const c = [...document.querySelectorAll('.card')].find(x => x.textContent.includes('LIMITER REFUSALS'));
      return c && (c.textContent.includes('quiet window') || c.querySelector('table'));
    }, null, { timeout: 10000 });
    const text = await card.textContent();
    test.info().annotations.push({ type: 'limiter-state', description: text.includes('quiet window') ? 'quiet' : 'hot' });
    if (text.includes('quiet window')) return;   /* quiet is honest too */
    await expect(card.locator('th', { hasText: '60s' })).toHaveCount(1);
    const buckets = await card.locator('table td:first-child').allTextContents();
    expect(buckets.length).toBeGreaterThan(0);
    for (const b of buckets) expect(b.trim()).toMatch(/^[a-z-]+$/);   /* bucket names only — the card never carries addresses or PII */
  });
});
