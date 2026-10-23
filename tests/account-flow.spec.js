const { test, expect } = require('@playwright/test');

/* Standard account flow: guest needs no account, email+password via Supabase
   Auth, first sign-in asks for a callsign, game over nudges guests to sign up.
   Supabase is stubbed: no real network, no real accounts. */
const boot = async page => {
  await page.route('**/auth/v1/settings', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ external: { email: true } }) }));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof CLOUD !== 'undefined');
  await page.evaluate(() => CLOUD.open());
};

test('title screen shows the account panel with a guest option, no anonymous auth', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#acctPanel')).not.toHaveClass(/hidden/);
  await expect(page.locator('#btnAcctGuest')).toContainText('Play as guest');
  await expect(page.locator('#acctMeta')).toHaveText('Guest');
  const r = await page.evaluate(() => {
    let anon = false;
    CLOUD.sb.auth.signInAnonymously = async () => { anon = true; return { error: null }; };
    document.getElementById('cloudGuest').click();
    return { anon, user: CLOUD.user };
  });
  expect(r.anon).toBe(false);
  expect(r.user).toBeNull();
});

test('guests never submit to the worldwide board', async ({ page }) => {
  await boot(page);
  const id = await page.evaluate(() => CLOUD.submit('endless', 1234, {}));
  expect(id).toBeNull();
});

test('email sign-up and sign-in use password auth; first sign-in asks for a callsign', async ({ page }) => {
  await boot(page);
  const calls = await page.evaluate(async () => {
    const got = {};
    const user = { id: 'u1', email: 'a@b.test', is_anonymous: false };
    CLOUD.sb.auth.signUp = async o => { got.up = o; return { data: { session: null }, error: null }; };
    CLOUD.sb.auth.signInWithPassword = async o => { got.in = o; return { data: {}, error: null }; };
    CLOUD.refresh = async () => { CLOUD.user = got.in ? user : null; CLOUD.profile = null; return CLOUD.user; };
    document.getElementById('cloudEmail').value = 'a@b.test';
    document.getElementById('cloudPass').value = 'hunter22pw';
    document.getElementById('cloudSignUp').click();
    await new Promise(r => setTimeout(r, 50));
    got.afterUp = document.getElementById('cloudMsg').textContent;
    document.getElementById('cloudSignIn').click();
    await new Promise(r => setTimeout(r, 50));
    got.status = document.getElementById('cloudStatus').textContent;
    return got;
  });
  expect(calls.up.email).toBe('a@b.test');
  expect(calls.up.password).toBe('hunter22pw');
  expect(calls.afterUp).toContain('confirm');
  expect(calls.in.email).toBe('a@b.test');
  expect(calls.status).toContain('pick a callsign');
  await expect(page.locator('#cloudMe')).not.toHaveClass(/hidden/);
});

test('game over shows "Sign up to post this score" to guests only', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => CLOUD.overPrompt(true));
  await expect(page.locator('#ovCloud')).not.toHaveClass(/hidden/);
  await expect(page.locator('#ovCloud')).toContainText('Sign up to post this score');
  await page.evaluate(() => { CLOUD.profile = { callsign: 'ACE' }; CLOUD.overPrompt(true); });
  await expect(page.locator('#ovCloud')).toHaveClass(/hidden/);
});
