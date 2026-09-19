const { test, expect } = require('@playwright/test');

/* P0-6 evidence: the audit's first-five-seconds failures, locked by tests.
   Each Playwright test gets a FRESH profile (fresh localStorage), so these
   assertions hold for a genuine first-launch player. */

async function titleUp(page) {
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'load' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
}

test('first launch shows the title, not the changelog (phone portrait)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await titleUp(page);
  await page.waitForTimeout(1200);   // the old auto-open fired 450ms after title
  await expect(page.locator('#s-notes')).not.toHaveClass(/on/);
});

test('phone landscape title: no DASH/PULSE buttons floating over it', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await titleUp(page);
  await expect(page.locator('#s-title')).toHaveClass(/on/);
  const touch = page.locator('#touch');
  await expect(touch).toBeHidden();   // visibility:hidden via [hidden] + CSS
});

test('desktop 1280x720: logo, launch and settings all on-screen and apart', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await titleUp(page);
  await expect(page.locator('#s-title')).toHaveClass(/on/);
  const h1 = page.locator('#s-title h1');
  const launch = page.locator('#btnLaunch');
  const settings = page.locator('#btnSettings');
  for (const el of [h1, launch, settings]) await expect(el).toBeVisible();
  const hb = await h1.boundingBox();
  const lb = await launch.boundingBox();
  const sb = await settings.boundingBox();
  expect(hb.y).toBeGreaterThanOrEqual(0);              // logo not clipped at the top
  expect(hb.y + hb.height).toBeLessThanOrEqual(720);
  expect(lb.y + lb.height).toBeLessThanOrEqual(720);   // launch reachable
  const overlap = !(sb.y + sb.height < lb.y || lb.y + lb.height < sb.y) &&
    !(sb.x + sb.width < lb.x || lb.x + lb.width < sb.x);
  expect(overlap, 'settings overlaps the launch column').toBe(false);
  const foot = await page.locator('.footline').boundingBox();
  if (foot) {
    const hitFoot = !(sb.y + sb.height < foot.y || foot.y + foot.height < sb.y) &&
      !(sb.x + sb.width < foot.x || foot.x + foot.width < sb.x);
    expect(hitFoot, 'settings button overlaps the footer line (audit 3.7)').toBe(false);
  }
});

test('phone portrait: notes dialog opens via What\'s new and Done is on-screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await titleUp(page);
  await page.locator('#btnNotes').click();
  await expect(page.locator('#s-notes')).toHaveClass(/on/);
  const done = page.locator('#btnNotesClose');
  await expect(done).toBeVisible();
  const db = await done.boundingBox();
  expect(db.y).toBeGreaterThanOrEqual(0);
  expect(db.y + db.height).toBeLessThanOrEqual(844);   // the audit: close button off-screen
  await done.click();
  await expect(page.locator('#s-notes')).not.toHaveClass(/on/);
});

test('returning pilot with an unread version still gets the changelog offer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'load' });
  // mark a PRIOR version as seen: the profile now predates v3.7.0
  await page.evaluate(() => {
    localStorage.setItem('emberfall2.notesSeen', JSON.stringify('3.6.1'));
    localStorage.setItem('emberfall2.meta', JSON.stringify({ runs: 3 }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await expect(page.locator('#s-notes')).toHaveClass(/on/, { timeout: 4000 });
  await page.locator('#btnNotesClose').click();
  await expect(page.locator('#s-notes')).not.toHaveClass(/on/);
});
