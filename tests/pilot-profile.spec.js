const { test, expect } = require('@playwright/test');

test('pilot profile deck link rejects non-http URLs', async ({ page }) => {
  await page.goto('/pilot.html');
  const js = await page.evaluate(() => mirrorDeckHref('javascript:alert(1)', 'Nova'));
  const data = await page.evaluate(() => mirrorDeckHref('data:text/html,hi', 'Nova'));
  const userinfo = await page.evaluate(() => mirrorDeckHref('https://user:pass@deck.example', 'Nova'));
  const ok = await page.evaluate(() => mirrorDeckHref('https://deck.example.com/', 'Nova'));
  expect(js).toBe('');
  expect(data).toBe('');
  expect(userinfo).toBe('');
  expect(ok).toBe('https://deck.example.com/pilot/Nova');
});

test('pilot profile page loads and handles missing callsign', async ({ page }) => {
  await page.goto('/pilot.html');
  await expect(page.locator('#err')).toBeVisible();
  await expect(page.locator('#err')).toContainText(/callsign/i);
});

test('pilot profile page accepts callsign query', async ({ page }) => {
  await page.goto('/pilot.html?callsign=SmokeTestPilot');
  const err = page.locator('#err');
  const hero = page.locator('#hero');
  // The lookup hits the live public board over the network; wait for it to
  // settle into one of its two end states instead of sampling at a fixed time.
  await expect(page.locator('#err:visible, #hero:visible').first()).toBeVisible({ timeout: 20000 });
  if (await err.isVisible()) {
    await expect(err).toContainText(/mirror|pilot/i);
  } else {
    await expect(hero).toBeVisible();
  }
});

test('pilot deck link accepts only http(s) URLs', async ({ page }) => {
  await page.goto('/pilot.html?callsign=SmokeTestPilot&deck=javascript:alert(1)');
  const r = await page.evaluate(() => ({
    js: safeDeckBase('javascript:alert(1)'),
    data: safeDeckBase('data:text/html,<script>alert(1)</script>'),
    vb: safeDeckBase(' JavaScript:alert(1)'),
    junk: safeDeckBase('not a url'),
    https: safeDeckBase('https://deck.example.com/'),
    http: safeDeckBase('http://localhost:8080'),
    live: deckParam
  }));
  expect(r).toEqual({ js: '', data: '', vb: '', junk: '', https: 'https://deck.example.com', http: 'http://localhost:8080', live: '' });
  const href = await page.locator('#deckLink').getAttribute('href');
  expect(href || '').not.toMatch(/^\s*javascript:/i);
});

test('mirror hardening: strict deck URLs, wildcard guard, integer checks, paint allowlist', async ({ page }) => {
  await page.goto('/pilot.html');
  const r = await page.evaluate(async () => {
    const hits = [];
    const realFetch = window.fetch;
    window.fetch = (u) => { hits.push(String(u)); return Promise.resolve(new Response('[]', { status: 200, headers: { 'content-range': '0-0/0' } })); };
    try {
      return {
        quote: mirrorDeckHref('https://deck.example.com/"onmouseover=x', 'Nova'),
        space: mirrorDeckHref('https://deck.example.com/a b', 'Nova'),
        angle: mirrorDeckHref('https://deck.example.com/<x>', 'Nova'),
        baseUser: safeDeckBase('https://u:p@deck.example.com'),
        baseQuote: safeDeckBase('https://deck.example.com/"x'),
        wildcard: await mirrorPilotRow('N%va'),
        rankBad: await mirrorMainRank('1;drop'),
        bestBad: await mirrorModeBest('1&x=y', 'main'),
        paintOk: paintText('gold'),
        paintBad: paintText('<img src=x onerror=alert(1)>'),
        hits
      };
    } finally { window.fetch = realFetch; }
  });
  expect(r.quote).toBe('');
  expect(r.space).toBe('');
  expect(r.angle).toBe('');
  expect(r.baseUser).toBe('');
  expect(r.baseQuote).toBe('');
  expect(r.wildcard).toBeNull();
  expect(r.rankBad).toBeNull();
  expect(r.bestBad).toBeNull();
  expect(r.paintOk).toBe('gold');
  expect(r.paintBad).toBe('');
  // A name that is not a legal callsign never reaches the network (no wildcard lookup at all).
  expect(r.hits.length).toBe(0);
});

test('pilot lookup escapes _ and names only public columns', async ({ page }) => {
  await page.goto('/pilot.html');
  const hits = await page.evaluate(async () => {
    const seen = [];
    const realFetch = window.fetch;
    window.fetch = (u) => { seen.push(String(u)); return Promise.resolve(new Response('[]', { status: 200 })); };
    try { await mirrorPilotRow('Ace_1'); } finally { window.fetch = realFetch; }
    return seen;
  });
  expect(hits.length).toBe(1);
  expect(hits[0]).toContain('/rest/v1/profiles?callsign=ilike.Ace%5C_1');
  expect(hits[0]).toContain('select=id,callsign,created_at');
  expect(hits[0]).not.toContain('select=*');
});
