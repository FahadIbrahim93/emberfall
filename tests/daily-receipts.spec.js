const { test, expect } = require('@playwright/test');

// Exercise the shipped game-over path with a local Supabase adapter. No test
// account, email or write touches the hosted project.
async function boot(page) {
  await page.route('**/auth/v1/settings', r => r.fulfill({ json: { external: {} } }));
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }));
  await page.addInitScript(() => {
    window.accountTest = {
      user: { id: 'pilot-87', email: 'pilot@example.test', is_anonymous: false },
      profile: { id: 'pilot-87', callsign: 'PILOT87', avatar: 'wraith' },
      posts: [], acks: [], total: 0, legacy: 0, failReceipt: false
    };
    window.supabase = { createClient: () => ({
      auth: {
        onAuthStateChange: cb => { accountTest.authEvent = cb; },
        getSession: async () => ({ data: { session: accountTest.user ? { user: accountTest.user } : null } }),
        signOut: async () => { accountTest.user = null; return { error: null }; }
      },
      from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [accountTest.profile] }) }) }) }),
      rpc: async (name, args) => {
        if (name === 'submit_run_v2') {
          accountTest.posts.push(args);
          if (accountTest.failReceipt) {
            return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.submit_run_v2' } };
          }
          accountTest.total += 380;
          const ack = {
            run_id: args.p_run_id, accepted: true, verification: 'client-reported',
            mode: args.p_mode, day: args.p_day, score: args.p_score,
            daily: {
              day: args.p_day, streak: 1, best: 1, paid: 380, total: accountTest.total,
              medals: ['Crest', 'Crown'], perfect: 0, wardenfall: false, wardenfalls: 0
            }
          };
          accountTest.acks.push(ack);
          return { data: ack, error: null };
        }
        if (name === 'submit_score') { accountTest.legacy++; return { data: 'legacy-1', error: null }; }
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

async function prepareDailyRun(page, dailyPaid = 0) {
  return page.evaluate((dailyPaid) => {
    const before = META.alloy;
    META.dailyPaid = dailyPaid;   // an existing pilot's legacy local watermark
    startRun('daily');
    GAME.paused = true;
    GAME.score = 12000;
    GAME.wave = 10;
    GAME.kills = 12;
    GAME.runT = 90;
    const local = Math.round((GAME.alloyRun + GAME.score / 140 + GAME.wave * 6) * (1 + refit('fortune') * .05));
    return { before, local, runId: GAME.runId, runDay: GAME.runDay };
  }, dailyPaid);
}

test('a Daily completion is acknowledged once and adopted once, even if finalization repeats', async ({ page }) => {
  await boot(page);
  const prep = await prepareDailyRun(page, 5000);
  const result = await page.evaluate(async () => {
    endRun();
    endRun();   // a duplicate finalization must not post or pay twice
    await new Promise(r => setTimeout(r, 60));
    const after = META.alloy;
    const ack = accountTest.acks[0] || null;
    if (ack) applyDailyResult(ack);   // replay the same acknowledgement
    const replay = META.alloy;
    if (ack) applyDailyResult({ run_id: 'older-run', daily: {
      day: '2026-10-31', streak: 1, best: 1, paid: 120, total: 300,
      medals: ['Crest'], perfect: 0, wardenfall: false, wardenfalls: 0
    } });
    return {
      after, replay, older: META.alloy, ack, lastDay: META.daily.lastDay,
      posts: accountTest.posts, legacy: accountTest.legacy,
      daily: META.daily, dailyPaid: META.dailyPaid || 0,
      over: document.getElementById('s-over').classList.contains('on')
    };
  });

  expect(result.posts).toHaveLength(1);
  expect(result.posts[0].p_run_id).toBe(prep.runId);
  expect(result.posts[0].p_day).toBe(prep.runDay);
  expect(result.posts[0].p_mode).toBe('daily');
  expect(result.posts[0].p_score).toBe(12000);
  expect(result.posts[0].p_status).toBe('finished');
  expect(result.legacy).toBe(0);
  expect(result.ack.verification).toBe('client-reported');
  expect(result.after - prep.before).toBe(prep.local + 380);
  expect(result.replay).toBe(result.after);
  expect(result.older).toBe(result.after + 120);
  expect(result.dailyPaid).toBe(5000);
  expect(result.lastDay).toBe(prep.runDay);
  expect(result.daily.streak).toBe(1);
  expect(result.over).toBe(true);
});

test('an un-migrated project falls back to submit_score without claiming Daily rewards', async ({ page }) => {
  await boot(page);
  const prep = await prepareDailyRun(page);
  const result = await page.evaluate(async () => {
    accountTest.failReceipt = true;
    endRun();
    await new Promise(r => setTimeout(r, 60));
    return {
      after: META.alloy, posts: accountTest.posts, legacy: accountTest.legacy,
      acks: accountTest.acks.length, dailyPaid: META.dailyPaid || 0, daily: !!META.daily
    };
  });

  expect(result.posts).toHaveLength(1);
  expect(result.legacy).toBe(1);
  expect(result.acks).toBe(0);
  expect(result.after - prep.before).toBe(prep.local);
  expect(result.dailyPaid).toBe(0);
  expect(result.daily).toBe(false);
});
