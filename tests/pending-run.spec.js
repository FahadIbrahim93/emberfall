const { test, expect } = require('@playwright/test');

/* A completed account-mode run may outlive the sign-in that would let it
   post. Keep the real run (identity, launch day, score and stats) and deliver
   it only after the board acknowledges it. The local Auth adapter means no
   account, email or hosted write is touched. */
async function boot(page) {
  await page.route('**/auth/v1/settings', r => r.fulfill({ json: { external: {} } }));
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }));
  await page.addInitScript(() => {
    window.accountTest = {
      user: null,
      profile: { id: 'pilot-89', callsign: 'PILOT89', avatar: 'wraith' },
      posts: [], acks: [], failAll: false, hold: 0
    };
    window.supabase = { createClient: () => ({
      auth: {
        onAuthStateChange: cb => { accountTest.authEvent = cb; },
        getSession: async () => ({ data: { session: accountTest.user ? { user: accountTest.user } : null } }),
        signOut: async () => { accountTest.user = null; return { error: null }; }
      },
      from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: accountTest.user ? [accountTest.profile] : [] }) }) }) }),
      rpc: async (name, args) => {
        if (name === 'submit_run_v2') {
          accountTest.posts.push({ name, args });
          if (accountTest.failAll) {
            return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.submit_run_v2' } };
          }
          if (accountTest.hold) await new Promise(r => setTimeout(r, accountTest.hold));
          const ack = {
            run_id: args.p_run_id, accepted: true, verification: 'client-reported',
            mode: args.p_mode, day: args.p_day, score: args.p_score,
            daily: {
              day: args.p_day, streak: 1, best: 1, paid: 380, total: 380,
              medals: ['Crest', 'Crown'], perfect: 0, wardenfall: false, wardenfalls: 0
            }
          };
          accountTest.acks.push(ack);
          return { data: ack, error: null };
        }
        if (name === 'submit_score') {
          accountTest.posts.push({ name, args });
          if (accountTest.failAll) return { data: null, error: { message: 'offline' } };
          return { data: 'legacy-89', error: null };
        }
        return { data: null, error: null };
      }
    }) };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof startRun === 'function' && typeof CLOUD !== 'undefined');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => GAME.state === 'title');
  await page.evaluate(async () => { CODEX.mute = true; await CLOUD.open(); });
}

function prepareDaily(page) {
  return page.evaluate(() => {
    startRun('daily');
    GAME.paused = true;
    GAME.score = 12345;
    GAME.wave = 10;
    GAME.kills = 12;
    GAME.runT = 90;
    return { runId: GAME.runId, runDay: GAME.runDay, ship: META.ship };
  });
}

test('a signed-out Daily is delivered once after sign-in with its real run identity', async ({ page }) => {
  await boot(page);
  const prep = await prepareDaily(page);
  const queued = await page.evaluate(() => {
    endRun();
    return { pending: JSON.parse(localStorage.getItem('ef.pendingRun') || 'null'), posts: accountTest.posts };
  });
  expect(queued.posts).toEqual([]);
  expect(queued.pending).toMatchObject({
    id: prep.runId, mode: 'daily', day: prep.runDay, score: 12345,
    stats: { wave: 10, ship: prep.ship, kills: 12, runT: 90 }
  });

  const result = await page.evaluate(async () => {
    accountTest.user = { id: 'pilot-89', email: 'pilot@example.test', is_anonymous: false };
    await CLOUD.refresh();
    const afterRefresh = { posts: accountTest.posts.length, pending: localStorage.getItem('ef.pendingRun') };
    const carried = await CLOUD.carryGuestBest();
    return { afterRefresh, carried, posts: accountTest.posts, pending: localStorage.getItem('ef.pendingRun') };
  });

  expect(result.afterRefresh).toEqual({ posts: 1, pending: null });
  expect(result.carried).toBe(true); // the queued run was already delivered by refresh
  expect(result.posts).toHaveLength(1);
  expect(result.posts[0].name).toBe('submit_run_v2');
  expect(result.posts[0].args).toMatchObject({
    p_run_id: prep.runId, p_mode: 'daily', p_day: prep.runDay, p_score: 12345,
    p_stats: { wave: 10, ship: prep.ship, kills: 12, runT: 90 }, p_status: 'finished'
  });
  expect(result.pending).toBeNull();
});

test('a failed acknowledgement retains the run and a retry can deliver it', async ({ page }) => {
  await boot(page);
  await prepareDaily(page);
  const queued = await page.evaluate(() => {
    endRun();
    return JSON.parse(localStorage.getItem('ef.pendingRun') || 'null');
  });
  expect(queued).not.toBeNull();

  const failed = await page.evaluate(async () => {
    accountTest.failAll = true;
    accountTest.user = { id: 'pilot-89', email: 'pilot@example.test', is_anonymous: false };
    await CLOUD.refresh();
    return { pending: JSON.parse(localStorage.getItem('ef.pendingRun') || 'null'), posts: accountTest.posts };
  });
  expect(failed.pending).toMatchObject({ id: queued.id, score: 12345 });
  expect(failed.posts.map(p => p.name)).toEqual(['submit_run_v2', 'submit_score']);

  const retried = await page.evaluate(async () => {
    accountTest.failAll = false;
    const res = await CLOUD.deliverPending();
    return { ok: !!res, pending: localStorage.getItem('ef.pendingRun'), posts: accountTest.posts };
  });
  expect(retried.ok).toBe(true);
  expect(retried.pending).toBeNull();
  expect(retried.posts.map(p => p.name)).toEqual(['submit_run_v2', 'submit_score', 'submit_run_v2']);
  expect(retried.posts[2].args.p_run_id).toBe(queued.id);
});

test('an explicitly guest-launched run is never queued or posted', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    CLOUD.playGuest();
    startRun('daily');
    GAME.paused = true;
    GAME.score = 4321;
    endRun();
    await Promise.resolve();
    return { pending: localStorage.getItem('ef.pendingRun'), posts: accountTest.posts, guestRun: GAME.guestRun };
  });
  expect(result.guestRun).toBe(true);
  expect(result.pending).toBeNull();
  expect(result.posts).toEqual([]);
});

test('concurrent delivery attempts share one request and one acknowledgement', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    accountTest.user = { id: 'pilot-89', email: 'pilot@example.test', is_anonymous: false };
    await CLOUD.refresh();
    CLOUD.rememberRun({ id: 'queued-main-1', mode: 'main', score: 777, stats: { wave: 2 } });
    accountTest.hold = 60;
    const [a, b] = await Promise.all([CLOUD.deliverPending(), CLOUD.deliverPending()]);
    return { same: a === b, posts: accountTest.posts, pending: localStorage.getItem('ef.pendingRun') };
  });
  expect(result.same).toBe(true);
  expect(result.posts).toHaveLength(1);
  expect(result.posts[0].name).toBe('submit_run_v2');
  expect(result.pending).toBeNull();
});

test('a queued run stays scoped to the first signed-in owner', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    CLOUD.rememberRun({ id: 'owned-main-1', mode: 'main', score: 321, stats: { wave: 1 } });
    const q = JSON.parse(localStorage.getItem('ef.pendingRun'));
    q.owner = 'pilot-89';
    localStorage.setItem('ef.pendingRun', JSON.stringify(q));

    accountTest.user = { id: 'pilot-90', email: 'other@example.test', is_anonymous: false };
    accountTest.profile = { id: 'pilot-90', callsign: 'OTHER', avatar: 'wraith' };
    await CLOUD.refresh();
    const other = { posts: accountTest.posts.length, pending: localStorage.getItem('ef.pendingRun') !== null };

    accountTest.user = { id: 'pilot-89', email: 'pilot@example.test', is_anonymous: false };
    accountTest.profile = { id: 'pilot-89', callsign: 'PILOT89', avatar: 'wraith' };
    await CLOUD.refresh();
    return { other, posts: accountTest.posts, pending: localStorage.getItem('ef.pendingRun') };
  });
  expect(result.other).toEqual({ posts: 0, pending: true });
  expect(result.posts).toHaveLength(1);
  expect(result.posts[0].args.p_run_id).toBe('owned-main-1');
  expect(result.pending).toBeNull();
});
