const { test, expect } = require('@playwright/test');

test('pilot profile page loads and handles missing callsign', async ({ page }) => {
  await page.goto('/pilot.html');
  await expect(page.locator('#err')).toBeVisible();
  await expect(page.locator('#err')).toContainText(/callsign/i);
});

test('pilot profile page accepts callsign query', async ({ page }) => {
  await page.goto('/pilot.html?callsign=SmokeTestPilot');
  await page.waitForTimeout(1500);
  const err = page.locator('#err');
  const hero = page.locator('#hero');
  const errVisible = await err.isVisible();
  if (errVisible) {
    await expect(err).toContainText(/mirror|pilot/i);
  } else {
    await expect(hero).toBeVisible();
  }
});

test('pilot deck link accepts only http(s) URLs', async ({ page }) => {
  await page.goto('/pilot.html?callsign=SmokeTestPilot&deck=javascript:alert(1)');
  const r = await page.evaluate(() => ({
    js: safeDeckBase('javascript:alert(1)'),
    data: safeDeckBase('data:text/html,<script>alert(1)</script>'),
    vb: safeDeckBase(' JavaScript:alert(1)'),
    junk: safeDeckBase('not a url'),
    https: safeDeckBase('https://deck.example.com/'),
    http: safeDeckBase('http://localhost:8080'),
    live: deckParam
  }));
  expect(r).toEqual({ js: '', data: '', vb: '', junk: '', https: 'https://deck.example.com', http: 'http://localhost:8080', live: '' });
  const href = await page.locator('#deckLink').getAttribute('href');
  expect(href || '').not.toMatch(/^\s*javascript:/i);
});
