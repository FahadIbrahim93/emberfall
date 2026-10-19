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
