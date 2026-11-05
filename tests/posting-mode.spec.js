const { test, expect } = require('@playwright/test');

// Exercise the shipped account controller and game-over path with a local Auth
// adapter. No test accounts, emails or writes reach the hosted project.
async function boot(page) {
  await page.route('**/auth/v1/settings', r => r.fulfill({ json: { external: {} } }));
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }));
  await page.addInitScript(() => {
    window.accountTest = {
      user: { id: 'pilot-75', email: 'pilot@example.test', is_anonymous: false },
      profile: { id: 'pilot-75', callsign: 'PILOT75', avatar: 'wraith' },
      posts: [],
      authEvent: null
    };
    window.supabase = { createClient: () => ({
      auth: {
        onAuthStateChange: cb => { accountTest.authEvent = cb; },
        getSession: async () => ({ data: { session: accountTest.user ? { user: accountTest.user } : null } }),
        signOut: async () => { accountTest.user = null; return { error: null }; }
      },
      from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [accountTest.profile] }) }) }) }),
      rpc: async (name, args) => {
        if (name === 'submit_score') accountTest.posts.push(args);
        return { data: 'run-75', error: null };
      }
    }) };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof startRun === 'function' && typeof CLOUD !== 'undefined');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => GAME.state === 'title');
  await page.evaluate(async () => { CODEX.mute = true; await CLOUD.open(); });
}

test('Play as guest with an existing account keeps the completed run local', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    document.getElementById('btnAcctGuest').click();
    GAME.paused = true; GAME.score = 4321;
    const runs = META.runs;
    endRun();
    await Promise.resolve();
    return { posts: accountTest.posts, runs: META.runs - runs,
      guest: localStorage.getItem('ef.guest'), title: document.getElementById('acctMeta').textContent };
  });
  expect(result.guest).toBe('1');
  expect(result.runs).toBe(1);
  expect(result.posts).toEqual([]);
  expect(result.title).toBe('Guest');
});

test('Continue as guest blocks direct posting and guest-best transfer', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    DB.set(boardKey('main'), [{ s: 7890, w: 3, k: 'wraith', n: 'LOCAL' }]);
    document.getElementById('cloudGuest').click();
    const posted = await CLOUD.submit('main', 1234, { wave: 2 });
    const carried = await CLOUD.carryGuestBest();
    return { posted, carried, posts: accountTest.posts,
      marker: localStorage.getItem('ef.carried.' + CLOUD.user.id) };
  });
  expect(result.posted).toBeNull();
  expect(result.carried).toBeNull();
  expect(result.posts).toEqual([]);
  expect(result.marker).toBeNull();
});

test('guest choice survives reload and auth refresh without resuming posting', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => CLOUD.playGuest());
  await page.reload({ waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    await CLOUD.open();
    accountTest.authEvent('TOKEN_REFRESHED', { user: accountTest.user });
    accountTest.authEvent('SIGNED_IN', { user: accountTest.user });
    await new Promise(r => setTimeout(r, 20));
    return { posted: await CLOUD.submit('daily', 7654, { wave: 1 }),
      posts: accountTest.posts, title: document.getElementById('acctMeta').textContent };
  });
  expect(result.posted).toBeNull();
  expect(result.posts).toEqual([]);
  expect(result.title).toBe('Guest');
});

test('opening boards or Profile stays guest until the explicit account action', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    CLOUD.playGuest();
    DB.set(boardKey('main'), [{ s: 9999, w: 5, k: 'wraith', n: 'LOCAL' }]);
    CLOUD.showBoards();
    await CLOUD.open();
    CLOUD.showAccount();
    await CLOUD.open();
    CLOUD.overPrompt(true);
  });
  await expect(page.locator('#acctMeta')).toHaveText('Guest');
  await expect(page.locator('#cloudStatus')).toContainText('Runs stay on this device');
  await expect(page.locator('#ovCloud b')).toHaveText('Guest run saved on this device');
  await expect(page.locator('#cloudAccount')).toBeVisible();
  await page.getByRole('button', { name: 'Use account for future runs', exact: true }).click();
  await expect(page.locator('#cloudAccount')).toBeHidden();
  await expect(page.locator('#cloudMsg')).toHaveText('Account posting resumed for future runs.');
  await expect(page.locator('#cloudOut')).toBeFocused();
  const result = await page.evaluate(async () => {
    const before = accountTest.posts.slice();
    CLOUD.closeSheet(); startRun('endless'); GAME.paused = true; GAME.score = 2468; endRun();
    await Promise.resolve();
    return { before, posts: accountTest.posts, choice: localStorage.getItem('ef.guest') };
  });
  expect(result.before).toEqual([]); // Resuming does not silently upload old guest runs.
  expect(result.choice).toBe('0');
  expect(result.posts).toHaveLength(1);
  expect(result.posts[0].p_score).toBe(2468);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(async () => { await CLOUD.open(); return CLOUD.canPost(); })).toBe(true);
});

test('existing registered accounts keep posting without a stored guest choice', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    startRun('daily'); GAME.paused = true; GAME.score = 1357; endRun();
    await Promise.resolve();
    return { posts: accountTest.posts, guest: localStorage.getItem('ef.guest'),
      promptHidden: document.getElementById('ovCloud').classList.contains('hidden') };
  });
  expect(result.guest).toBeNull();
  expect(result.posts).toHaveLength(1);
  expect(result.posts[0].p_mode).toBe('daily');
  expect(result.posts[0].p_score).toBe(1357);
  expect(result.promptHidden).toBe(true);
});

test('blocked storage defaults safely and retains explicit choices for this page', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'ef.guest') throw new DOMException('Blocked', 'SecurityError');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ef.guest') throw new DOMException('Blocked', 'SecurityError');
      return set.call(this, key, value);
    };
    try {
      const initial = await CLOUD.submit('main', 100, {});
      CLOUD.useAccount();
      const account = await CLOUD.submit('main', 200, {});
      CLOUD.playGuest(); await CLOUD.refresh();
      const guest = await CLOUD.submit('main', 300, {});
      return { initial, account, guest, posts: accountTest.posts,
        title: document.getElementById('acctMeta').textContent };
    } finally { Storage.prototype.getItem = get; Storage.prototype.setItem = set; }
  });
  expect(result.initial).toBeNull();
  expect(result.account).toBe('run-75');
  expect(result.guest).toBeNull();
  expect(result.posts.map(r => r.p_score)).toEqual([200]);
  expect(result.title).toBe('Guest');
});

test('account mode never permits anonymous, signed-out or callsign-less posting', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    CLOUD.useAccount();
    DB.set(boardKey('main'), [{ s: 9999, w: 5, k: 'wraith', n: 'LOCAL' }]);
    const results = [];
    for (const kind of ['anonymous', 'signed-out', 'no-profile']) {
      CLOUD.user = kind === 'signed-out' ? null : { ...accountTest.user, is_anonymous: kind === 'anonymous' };
      CLOUD.profile = kind === 'no-profile' ? null : accountTest.profile;
      results.push(await CLOUD.submit('main', 5000, {}), await CLOUD.carryGuestBest());
    }
    return { results, posts: accountTest.posts };
  });
  expect(result.results).toEqual([null, null, null, null, null, null]);
  expect(result.posts).toEqual([]);
});

test('another tab sees guest and account choices without reloading', async ({ page, context }) => {
  await boot(page);
  const other = await context.newPage();
  await boot(other);
  await page.evaluate(() => CLOUD.playGuest());
  await expect(other.locator('#acctMeta')).toHaveText('Guest');
  expect(await other.evaluate(() => CLOUD.submit('main', 1000, {}))).toBeNull();
  await page.evaluate(() => CLOUD.useAccount());
  await expect(other.locator('#acctMeta')).toHaveText('PILOT75');
  expect(await other.evaluate(() => CLOUD.submit('main', 2000, {}))).toBe('run-75');
  await other.close();
});

test('resuming account posting cannot turn an already launched guest run into a post', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    CLOUD.playGuest(); startRun('daily'); GAME.paused = true;
    CLOUD.useAccount(); GAME.score = 3210; endRun();
    await Promise.resolve();
    const guestPosts = accountTest.posts.slice();
    startRun('daily'); GAME.paused = true; GAME.score = 4567; endRun();
    await Promise.resolve();
    return { guestPosts, posts: accountTest.posts };
  });
  expect(result.guestPosts).toEqual([]);
  expect(result.posts.map(p => p.p_score)).toEqual([4567]);
});

test('a stale account controller keeps gameplay local until the posting contract is available', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    // Model the public API of the previous cached controller. The new page
    // must not call its absent methods or its ungated score-write method.
    delete CLOUD.postingMode; delete CLOUD.canPost;
    CLOUD.overPrompt = () => {};
    CLOUD.submit = async () => { accountTest.posts.push('legacy-post'); };
    startRun('endless'); GAME.paused = true; GAME.score = 1000; endRun();
    await Promise.resolve();
    return { state: GAME.state, posts: accountTest.posts };
  });
  expect(result).toEqual({ state: 'over', posts: [] });
});
