const { test, expect } = require('@playwright/test');

/* Bounty Board / framed arcade: no sign-in, sign-up, or email prompts. */

test('framed play hides every auth prompt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'self', { get: () => ({}) });
    Object.defineProperty(window, 'top', { get: () => ({}) });
  });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof CLOUD !== 'undefined');

  const state = await page.evaluate(() => ({
    portal: typeof emberfallPortal === 'function' && emberfallPortal(),
    flag: !!window.EMBERFALL_PORTAL,
    available: CLOUD.available(),
  }));
  expect(state.flag).toBe(true);
  expect(state.portal).toBe(true);
  expect(state.available).toBe(false);

  await expect(page.locator('#btnPilot')).toHaveClass(/hidden/);
  await expect(page.locator('#btnAcctSign')).toHaveClass(/hidden/);
  await expect(page.locator('#acctPanel')).toHaveClass(/hidden/);
  await expect(page.locator('#ovCloud')).toHaveClass(/hidden/);

  await page.evaluate(() => CLOUD.overPrompt(true));
  await expect(page.locator('#ovCloud')).toHaveClass(/hidden/);
});
