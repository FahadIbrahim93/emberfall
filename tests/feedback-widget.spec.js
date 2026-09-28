const { test, expect } = require('@playwright/test');

/* v4.25 — the listening deck, browser side. The widget lives on the
   game-over panel; the funnel is silent instrumentation. These tests run
   against the suite's scratch deck (live-guard globalSetup already
   refused anything flagged). Each test gets a fresh profile. */

async function toGameOver(page) {
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'load' });
  await page.keyboard.press('Space');                       // arm (boot screen is any-key)
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.evaluate(() => startRun('endless'));           // the real entry, no die-in-play wait
  await page.waitForTimeout(400);
  await page.evaluate(() => endRun());                      // straight to the report
  await expect(page.locator('#s-over')).toHaveClass(/on/, { timeout: 9000 });
}

test('the game-over widget sends one line to the deck (anon is fine)', async ({ page, request }) => {
  await toGameOver(page);
  await expect(page.locator('#fbRow')).toBeVisible();
  const note = 'spec: the third wave snuck up on me ' + Date.now();
  await page.fill('#fbText', note);
  await page.click('#btnSendFb');
  await expect(page.locator('#btnSendFb')).toHaveText('Sent ✓', { timeout: 6000 });
  const j = await (await request.get('/api/feedback')).json();
  const row = j.list.find(r => r.text === note);
  expect(row, 'the note must land in the operator read').toBeTruthy();
  expect(row.pilot).toBeNull();                             // anon stays anon
  expect(row.ship).toBe('vesper');                          // flight shape rides along
});

test('offline notes queue locally and flush on the next boot', async ({ page, request }) => {
  await toGameOver(page);
  const note = 'spec: queued while offline ' + Date.now();
  await page.fill('#fbText', note);
  await page.evaluate(() => { NET.sendFeedback = async () => false; });   // the deck is down to us
  await page.click('#btnSendFb');
  await expect(page.locator('#btnSendFb')).toHaveText('Kept for later', { timeout: 6000 });
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem('emberfall2.fb') || '[]'));
  expect(q.length).toBe(1);
  expect(q[0].text).toBe(note);
  /* the next boot flushes the queue for real (stub dies with the reload) */
  await page.reload({ waitUntil: 'load' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.waitForTimeout(800);                           // flushFeedback is in flight
  const j = await (await request.get('/api/feedback')).json();
  expect(j.list.some(r => r.text === note)).toBeTruthy();
});

test('the funnel hears about boots and arming', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'load' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.evaluate(() => startRun('endless'));           // 'armed' fires here
  await page.waitForTimeout(600);
  const s = await (await request.get('/api/stats')).json();
  expect(s.funnel.boot).toBeGreaterThanOrEqual(1);
  expect(s.funnel.armed).toBeGreaterThanOrEqual(1);
});
