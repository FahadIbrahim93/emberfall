const { test, expect } = require('@playwright/test');

const ORIGIN = 'https://rgmbexmodebegllahotc.supabase.co';
const BIG = '9223372036854775807';
const WM = '2026-11-11T00:00:00.000Z';

function row(n, extra) {
  return Object.assign({
    place: n,
    source_mode: 'endless',
    user_id: '00000000-0000-4000-8000-' + String(n).padStart(12, '0'),
    callsign: 'P' + String(n).padStart(4, '0'),
    score: String(1000 - n),
    wave: 2,
    ship: 'wraith',
    paint: 'gold',
    created_at: '2026-11-01T00:00:' + String(n).padStart(2, '0') + 'Z'
  }, extra);
}

async function mockMirror(page, respond) {
  const seen = [];
  await page.route(ORIGIN + '/**', async route => {
    const hit = {
      url: route.request().url(),
      method: route.request().method(),
      body: route.request().postData()
    };
    seen.push(hit);
    if (/seasons|pilot_cards|board_standings/.test(hit.url)) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"missing"}' });
      return;
    }
    await respond(route, hit);
  });
  return seen;
}

test('a hostile callsign is shown as text and never looked up', async ({ page }) => {
  const seen = await mockMirror(page, route => route.fulfill({ status: 500, body: 'no' }));
  await page.goto('/pilot.html?callsign=%3Cimg%20src=x%20onerror=alert(1)%3E');
  await expect(page.locator('#err')).toBeVisible();
  await expect(page.locator('#modes img, #modes script')).toHaveCount(0);
  await expect(page.locator('#err')).toContainText('not a public pilot name');
  expect(seen.some(hit => /seasons|pilot_cards|board_standings/.test(hit.url))).toBe(false);
  expect(seen).toEqual([]);
});

test('a dossier names the run mode and the exact score', async ({ page }) => {
  const seen = await mockMirror(page, async (route, hit) => {
    if (hit.url.includes('/rpc/pilot_dossier')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          callsign: 'ACE_1',
          since: '2026-11-01T00:00:00Z',
          runs: 2,
          modes: [{
            board: 'alltime', source_mode: 'daily', score: BIG, place: 2,
            wave: 9, ship: 'seraph', paint: 'gold'
          }]
        })
      });
      return;
    }
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"unexpected"}' });
  });
  await page.goto('/pilot.html?callsign=ace_1');
  await expect(page.locator('#hero')).toBeVisible();
  await expect(page.locator('#callsign')).toHaveText('ACE_1');
  const row = page.locator('#modes .row');
  await expect(row).toContainText('Daily');
  await expect(row).not.toContainText('Endless');
  await expect(row).toContainText('9,223,372,036,854,775,807');
  await expect(row).toContainText('#2');
  expect(seen.some(hit => /pilot_cards|seasons/.test(hit.url))).toBe(false);
  expect(seen.some(hit => hit.url.includes('/rpc/pilot_dossier'))).toBe(true);
});

test('standings page by watermark, keep source mode, and refuse a missing dossier', async ({ page }) => {
  const page1 = [row(1, { place: 1, source_mode: 'daily', score: BIG, callsign: 'ACE_1', ship: 'seraph' })];
  for (let n = 2; n <= 50; n += 1) page1.push(row(n, { place: n === 2 || n === 3 ? 2 : n, score: n === 2 || n === 3 ? '500' : String(1000 - n) }));
  const seen = await mockMirror(page, async (route, hit) => {
    if (hit.url.includes('deck_stats')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ pilots: 2, runs: 4, top_score: 1, top_score_exact: BIG }]) });
      return;
    }
    if (hit.url.includes('/leaderboard_daily')) {
      await route.fulfill({ contentType: 'application/json', body: '[]' });
      return;
    }
    if (hit.url.includes('/rpc/standings_page')) {
      const body = JSON.parse(hit.body || '{}');
      if (body.p_board === 'daily') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ watermark: WM, rows: [] }) });
        return;
      }
      if (!body.p_cursor_score) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ watermark: WM, rows: page1 }) });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ watermark: WM, rows: [row(51, { place: 51, score: '10', callsign: 'TAIL' })] })
      });
      return;
    }
    if (hit.url.includes('/rpc/pilot_dossier')) {
      await route.fulfill({ contentType: 'application/json', body: 'null' });
      return;
    }
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"unexpected"}' });
  });

  await page.goto('/stats.html?pilot=%3Cscript%3E');
  await expect(page.locator('#board .row').first()).toBeVisible();
  await expect(page.locator('#cTop')).toHaveText('9,223,372,036,854,775,807');
  const first = page.locator('#board .row').first();
  await expect(first).toHaveAttribute('data-source', 'daily');
  await expect(first).toContainText('Daily');
  await expect(first).not.toContainText('Endless');
  await expect(first.locator('.score')).toHaveText('9,223,372,036,854,775,807');
  const ranks = await page.locator('#board .row .rank').allTextContents();
  expect(ranks[1]).toBe('02');
  expect(ranks[2]).toBe('02');
  expect(ranks[3]).toBe('04');
  await expect(page.locator('#pilot script')).toHaveCount(0);
  await expect(page.locator('#pilot h3')).toHaveText('<script>');
  await expect(page.locator('#seasons')).toContainText('not published yet');

  await page.locator('#boardMore').click();
  await expect(page.locator('#board .row', { hasText: 'TAIL' })).toBeVisible();
  const posts = seen.filter(hit => hit.url.includes('/rpc/standings_page')).map(hit => JSON.parse(hit.body));
  expect(posts[0].p_board).toBe('alltime');
  expect(posts[0].p_watermark).toBe(null);
  expect(posts[1].p_watermark).toBe(WM);
  expect(posts[1].p_cursor_score).toBe(page1[49].score);
  expect(posts[1].p_cursor_user).toBe(page1[49].user_id);
  const names = await page.locator('#board .name').allTextContents();
  expect(new Set(names).size).toBe(names.length);

  await page.locator('#tabs button', { hasText: 'Daily' }).click();
  await expect(page.locator('#board')).toContainText('no ranked runs');
  const daily = seen.filter(hit => hit.url.includes('/rpc/standings_page')).map(hit => JSON.parse(hit.body));
  expect(daily.some(body => body.p_board === 'daily' && body.p_day)).toBe(true);
  expect(seen.some(hit => /seasons|pilot_cards|board_standings/.test(hit.url))).toBe(false);
});

test('a mirror failure stays on the page', async ({ page }) => {
  await mockMirror(page, route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"down"}' }));
  await page.goto('/stats.html');
  await expect(page.locator('#err')).toContainText('play on');
  await expect(page.locator('#board')).toContainText('unavailable');
});
