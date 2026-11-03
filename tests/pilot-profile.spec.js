const { test, expect } = require('@playwright/test');

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

test('mirror hardening: wildcard guard, integer checks, paint allowlist', async ({ page }) => {
  await page.goto('/pilot.html');
  const r = await page.evaluate(async () => {
    const hits = [];
    const realFetch = window.fetch;
    window.fetch = (u) => { hits.push(String(u)); return Promise.resolve(new Response('[]', { status: 200, headers: { 'content-range': '0-0/0' } })); };
    try {
      return {
        wildcard: await mirrorPilotRow('N%va'),
        rankBad: await mirrorMainRank('1;drop'),
        bestBad: await mirrorModeBest('1&x=y', 'main'),
        paintOk: paintText('gold'),
        paintBad: paintText('<img src=x onerror=alert(1)>'),
        hits
      };
    } finally { window.fetch = realFetch; }
  });
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
