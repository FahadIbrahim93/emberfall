const { test, expect, devices } = require('@playwright/test');

/* Accounts v2 on every form factor (docs/specs/accounts-v2.md): the pilot
   chip, sign-in, profile and both boards must be reachable from the title,
   with >=44px targets and no horizontal scroll. Supabase is stubbed. */
const DEVICES = {
  'iphone-se': devices['iPhone SE'],
  'iphone-14': devices['iPhone 14'],
  'pixel-7': devices['Pixel 7'],
  'ipad-portrait': devices['iPad (gen 7)'],
  'ipad-landscape': devices['iPad (gen 7) landscape'],
  'iphone-14-landscape': devices['iPhone 14 landscape'],
  desktop: { viewport: { width: 1366, height: 768 } }
};
const strip = d => { const o = Object.assign({}, d); delete o.defaultBrowserType; return o; };

for (const [name, dev] of Object.entries(DEVICES)) {
  test.describe(name, () => {
    test.use(strip(dev));
    test('account + boards reachable, touch-sized, no horizontal scroll', async ({ page }) => {
      await page.route('**/auth/v1/settings', r => r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ external: { email: true, google: false } }) }));
      await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof CLOUD !== 'undefined' && typeof toTitle === 'function');
      await page.evaluate(() => { toTitle(); });
      const notes = page.locator('#s-notes.on');
      await page.waitForTimeout(500);
      if (await notes.count()) await page.click('#btnNotesClose');
      /* the pilot chip sits above the fold on the title */
      const chip = page.locator(await page.locator('#btnPilot').isVisible() ? '#btnPilot' : '#btnAcctSign');
      await expect(chip).toBeVisible();
      const cb = await chip.boundingBox();
      const vp = page.viewportSize();
      expect(cb.y + cb.height).toBeLessThanOrEqual(vp.height);
      expect(cb.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: 'test-results/mobile-' + name + '-title.png' });
      /* nothing overflows sideways */
      const wide = await page.evaluate(() => {
        const s = document.getElementById('s-title');
        return { s: s.scrollWidth - s.clientWidth, d: document.documentElement.scrollWidth - innerWidth };
      });
      expect(wide.s).toBeLessThanOrEqual(1);
      expect(wide.d).toBeLessThanOrEqual(1);
      /* root cause of the v4.28 phone bug: the title must be user-scrollable */
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('s-title')).overflowY)).toBe('auto');
      /* the chip opens sign-in; the email field is on screen and touch-sized */
      await chip.click();
      const email = page.locator('#cloudEmail');
      await expect(email).toBeInViewport();
      expect((await email.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await expect(page.locator('#cloudOtp')).toBeVisible();
      await expect(page.locator('#cloudGoogle')).toBeHidden();
      await page.screenshot({ path: 'test-results/mobile-' + name + '-signin.png' });
      /* Boards: both tabs reachable */
      if (await page.locator('#btnBoards').isVisible()) await page.locator('#btnBoards').scrollIntoViewIfNeeded();
      await page.evaluate(() => (document.getElementById('btnBoards').offsetParent ? document.getElementById('btnBoards') : document.querySelector('[data-tab=global]')).click());
      await expect(page.locator('#globalBody')).toBeVisible();
      await page.locator('.btab[data-board="all"]').click();
      await expect(page.locator('#globalBoard')).toBeInViewport();
      await page.locator('.btab[data-board="daily"]').click();
      await expect(page.locator('#dailyBoard')).toBeInViewport();
      await page.screenshot({ path: 'test-results/mobile-' + name + '-boards.png' });
    });
  });
}

test('Google button appears only when the provider is on', async ({ page }) => {
  await page.route('**/auth/v1/settings', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ external: { email: true, google: true } }) }));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof CLOUD !== 'undefined');
  await page.evaluate(() => CLOUD.open());
  await expect(page.locator('#cloudGoogle')).not.toHaveClass(/hidden/);
});

test('email code flow calls signInWithOtp then verifyOtp', async ({ page }) => {
  await page.route('**/auth/v1/settings', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"external":{"email":true}}' }));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof CLOUD !== 'undefined');
  await page.evaluate(() => CLOUD.open());
  const got = await page.evaluate(async () => {
    const g = {};
    CLOUD.sb.auth.signInWithOtp = async o => { g.otp = o; return { error: null }; };
    CLOUD.sb.auth.verifyOtp = async o => { g.ver = o; return { error: null }; };
    CLOUD.refresh = async () => null;
    document.getElementById('cloudEmail').value = 'a@b.test';
    document.getElementById('cloudOtp').click();
    await new Promise(r => setTimeout(r, 50));
    g.row = !document.getElementById('cloudCodeRow').classList.contains('hidden');
    document.getElementById('cloudCode').value = '123456';
    document.getElementById('cloudVerify').click();
    await new Promise(r => setTimeout(r, 50));
    return g;
  });
  expect(got.otp.email).toBe('a@b.test');
  expect(got.otp.options.shouldCreateUser).toBe(true);
  expect(got.row).toBe(true);
  expect(got.ver).toEqual({ email: 'a@b.test', token: '123456', type: 'email' });
});
