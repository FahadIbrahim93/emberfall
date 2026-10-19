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
  await page.waitForTimeout(1500);
  const err = page.locator('#err');
  const hero = page.locator('#hero');
  const errVisible = await err.isVisible();
  if (errVisible) {
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
  // Only the exact-match lookup ran, and it named public columns (no select=*, no last_seen_at).
  expect(r.hits.length).toBe(1);
  expect(r.hits[0]).not.toContain('ilike');
  expect(r.hits[0]).not.toContain('select=*');
  expect(r.hits[0]).not.toContain('last_seen');
});
