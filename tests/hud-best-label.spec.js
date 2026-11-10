const { test, expect, devices } = require('@playwright/test');

/* #92: on narrow phones the HUD hid the "Best" label, so the device-local
   best (static until beaten) sat unlabeled beside the pause button and read
   as a score counter frozen from launch. A stored best must stay labeled,
   and the live score must still start at zero and climb. */
const STORED_BEST = 840351;
const DEVICES = {
  'iphone-se': devices['iPhone SE'],
  'iphone-14': devices['iPhone 14'],
  'pixel-7': devices['Pixel 7'],
  desktop: { viewport: { width: 1366, height: 768 } }
};
const strip = d => { const o = Object.assign({}, d); delete o.defaultBrowserType; return o; };

for (const [name, dev] of Object.entries(DEVICES)) {
  test.describe(name, () => {
    test.use(strip(dev));
    test('stored best stays labeled and the live score climbs from zero', async ({ page }) => {
      await page.route('**/auth/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.addInitScript(best => {
        localStorage.setItem('emberfall2.board.main',
          JSON.stringify([{ n: 'PILOT', s: best, w: 34, ship: 'wraith', d: Date.now() }]));
      }, STORED_BEST);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof startRun === 'function' && typeof toTitle === 'function');
      await page.evaluate(() => { toTitle(); startRun('endless'); });
      await expect(page.locator('#hud')).not.toHaveClass(/hidden/);

      /* the best readout shows the stored value, with its label visible */
      await expect(page.locator('#best')).toHaveText('0840351');
      const lbl = page.locator('.best .lbl');
      await expect(lbl).toBeVisible();
      await expect(lbl).toHaveText(/best/i);
      const lb = await lbl.boundingBox();
      expect(lb.height).toBeGreaterThan(0);

      /* the live score is a separate counter: starts at zero, then climbs */
      const start = await page.evaluate(() => GAME.score);
      expect(start).toBe(0);
      await page.evaluate(() => { addScore(1000); });
      await expect.poll(async () => Number(await page.locator('#score').textContent()), { timeout: 5000 })
        .toBeGreaterThan(0);
      expect(Number(await page.locator('#best').textContent())).toBe(STORED_BEST);
    });
  });
}
