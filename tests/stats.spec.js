const { test, expect } = require('@playwright/test');

/* stats.html reads the anon-read-only public mirror (ADR 0001). The mirror
   is a live external service — the spec asserts the page RENDERS in one of
   its two honest states (data, or the graceful error panel) and hard-fails
   on a blank page or a wrong shell. Deck-served CSP allows the mirror
   origin for this page only; the CI Pages live-smoke covers the static
   copy through the public host. */
test('stats page renders the public totals or fails gracefully', async ({ page }) => {
  await page.goto('http://127.0.0.1:8123/stats.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toContainText('EMBER');
  await expect(page.locator('#board'))
    .toContainText(/loading|ranked runs yet|unavailable|\d/, { timeout: 15000 });
  const pilots = await page.locator('#cPilots').textContent();
  const errShown = await page.locator('#err').evaluate(el => el.style.display === 'block');
  if (!errShown) {
    expect(Number(pilots)).toBeGreaterThanOrEqual(0);
  }
  /* the page must never offer a way to write to the mirror */
  const html = await page.content();
  expect(html).not.toMatch(/(POST|PUT|PATCH)\b.*rest\/v1/i);
});
