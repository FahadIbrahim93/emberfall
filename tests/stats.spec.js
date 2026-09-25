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
  /* wait for a TERMINAL state: the board stops saying loading — either the
     data landed, the honest empty state rendered, or the error panel showed.
     (Matching /loading/ in a containText race read the counters too early;
     CI's slower mirror turned that into a red flake. Terminal states only.) */
  await page.waitForFunction(() => {
    const b = document.querySelector('#board');
    return b && !/loading/i.test(b.textContent || '');
  }, null, { timeout: 20000 });
  const errShown = await page.locator('#err').evaluate(el => el.style.display === 'block');
  if (errShown) {
    /* graceful degradation is a pass: the mirror is allowed to sleep */
    await expect(page.locator('#err')).toContainText('play on');
  } else {
    const pilots = Number(await page.locator('#cPilots').textContent());
    expect(pilots).toBeGreaterThanOrEqual(0);
  }
  /* the page must never offer a way to write to the mirror */
  const html = await page.content();
  expect(html).not.toMatch(/(POST|PUT|PATCH)\b.*rest\/v1/i);
});
