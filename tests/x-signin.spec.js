const { test, expect } = require('@playwright/test');

/* Sign in with X: hidden unless Supabase reports the provider enabled; when
   enabled it calls signInWithOAuth({ provider: 'x', redirectTo: origin }).
   Supabase settings are stubbed: no real network, no real OAuth. */
const boot = async (page, external) => {
  await page.route('**/auth/v1/settings', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ external: Object.assign({ email: true, anonymous_users: true }, external) }) }));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof CLOUD !== 'undefined');
  await page.evaluate(() => CLOUD.open());
};

test('X button stays hidden when the provider is off', async ({ page }) => {
  await boot(page, { x: false, twitter: false });
  await expect(page.locator('#cloudX')).toHaveClass(/hidden/);
});

test('X button shows when enabled and asks for provider x, back to this origin', async ({ page }) => {
  await boot(page, { x: true });
  await expect(page.locator('#cloudX')).not.toHaveClass(/hidden/);
  const call = await page.evaluate(async () => {
    let got = null;
    CLOUD.sb.auth.signInWithOAuth = async o => { got = o; return { data: {}, error: null }; };
    await CLOUD.signInX();
    return got;
  });
  expect(call.provider).toBe('x');
  expect(call.options.redirectTo).toBe('http://127.0.0.1:8123/index.html');
});

test('X sign-in error is caught, reported, and the button hides', async ({ page }) => {
  await boot(page, { x: true });
  await page.evaluate(() => {
    CLOUD.sb.auth.signInWithOAuth = async () => ({ data: null, error: new Error('Unsupported provider: provider is not enabled') });
    document.getElementById('cloudX').click();
  });
  await expect(page.locator('#cloudMsg')).toContainText('not enabled');
  await expect(page.locator('#cloudX')).toHaveClass(/hidden/);
});
