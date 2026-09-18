const { test, expect } = require('@playwright/test');

async function openTitle(page) {
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 7000 });
  /* The patch-notes dialog mounts a beat AFTER the title gains .on (and on a
     fresh profile it always opens — the version is unseen). Sampling it once
     here raced the mount; wait for it instead, then guarantee it is closed. */
  const close = page.locator('#btnNotesClose');
  try {
    await close.waitFor({ state: 'visible', timeout: 2500 });
    await close.click();
  } catch { /* already seen — dialog not shown */ }
  await expect(page.locator('#s-notes')).not.toHaveClass(/on/);
}

test('boots locally without third-party network requests', async ({ page }) => {
  const blocked = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:8123') blocked.push(request.url());
  });
  await openTitle(page);
  await expect(page.locator('#btnLaunch')).toBeVisible();
  expect(blocked).toEqual([]);
});

test('launches, pauses, and returns to the title screen', async ({ page }) => {
  await openTitle(page);
  await page.locator('#btnLaunch').click();
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.keyboard.press('p');
  await expect(page.locator('#s-pause')).toHaveClass(/on/);
  await page.locator('#btnAbort').click();
  await expect(page.locator('#s-title')).toHaveClass(/on/);
});
