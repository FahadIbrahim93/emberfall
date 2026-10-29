const { test, expect } = require('@playwright/test');

/* Bounty Board / framed arcade: no sign-in, sign-up, or email prompts. */

test('framed play hides every auth prompt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'self', { get: () => ({}) });
    Object.defineProperty(window, 'top', { get: () => ({}) });
  });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof emberfallPortal === 'function' && typeof CLOUD !== 'undefined');

  const framed = await page.evaluate(() => ({
    portal: emberfallPortal(),
    framed: typeof emberfallFramed === 'function' && emberfallFramed(),
    available: CLOUD.available(),
  }));
  expect(framed.framed).toBe(true);
  expect(framed.portal).toBe(true);
  expect(framed.available).toBe(false);

  await expect(page.locator('#btnPilot')).toHaveClass(/hidden/);
  await expect(page.locator('#btnAcctSign')).toHaveClass(/hidden/);
  await expect(page.locator('#acctPanel')).toHaveClass(/hidden/);
  await expect(page.locator('#ovCloud')).toHaveClass(/hidden/);

  await page.evaluate(() => CLOUD.overPrompt(true));
  await expect(page.locator('#ovCloud')).toHaveClass(/hidden/);
});
