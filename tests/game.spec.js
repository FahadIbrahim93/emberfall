const { test, expect } = require('@playwright/test');

async function openTitle(page) {
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 7000 });
  const notes = page.locator('#s-notes');
  if (await notes.evaluate(el => el.classList.contains('on'))) await page.locator('#btnNotesClose').click();
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
