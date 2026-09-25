const { test, expect } = require('@playwright/test');

/* The Global tab has two honest worlds, both pinned here:
   1. deck linked  → the live boards render (regression: a bare `honor`
      identifier once threw a ReferenceError and left the board BLANK
      whenever any ranked row existed)
   2. deck offline → the public mirror (ADR 0001) still shows the world's
      best through its publishable key; if even that sleeps, an honest
      local-mode line. Never a blank board, never a thrown error. */

async function openGlobalTab(page) {
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  const notes = page.locator('#s-notes.on');
  if (await notes.count()) await page.click('#btnNotesClose');
  await page.click('[data-tab="global"]');
  /* a terminal state: linked boards, mirror rows, or the honest fallback text */
  await page.waitForFunction(() => {
    const el = document.querySelector('#globalBoard');
    if (!el) return false;
    const t = el.textContent || '';
    return el.querySelector('.row') !== null || /No worldwide runs|not answering|No ranked pilots/.test(t);
  }, null, { timeout: 15000 });
  return page.locator('#globalStatus').textContent();
}

test('Global tab paints with a linked deck (the honor ReferenceError regression)', async ({ page }) => {
  await openGlobalTab(page);
  await expect(page.locator('#globalStatus')).toContainText('Linked to command deck');
  /* the deck battery seeds ranked main-mode runs on every fresh boot, so a
     healthy render has rows; a ReferenceError would leave the box empty */
  const rows = await page.locator('#globalBoard .row').count();
  expect(rows).toBeGreaterThanOrEqual(1);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.click('[data-tab="global"]');
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});

test('deckless Global tab shows the worldwide mirror or an honest fallback', async ({ page }) => {
  await openGlobalTab(page);
  /* sever the deck for real: abort the health probe at the network layer so
     the client's own probe() decides the deck is gone — faking NET.on is a
     lie the next honest probe() undoes (the first version of this test
     failed exactly that way). */
  await page.route('**/api/health', route => route.abort());
  await page.evaluate(() => { NET.on = false; NET.user = null; NET.probed = false; });
  await page.evaluate(() => NET.renderGlobal());
  await page.waitForFunction(() => {
    const el = document.querySelector('#globalBoard');
    const t = el ? (el.textContent || '') : '';
    return el && el.querySelector('.row') !== null || /not answering/.test(t);
  }, null, { timeout: 15000 });
  await expect(page.locator('#globalStatus')).toContainText('local mode');
  const text = await page.locator('#globalBoard').textContent();
  const mirrorRows = await page.locator('#globalBoard .row').count();
  if (mirrorRows > 0) {
    expect(text).toContain('public mirror');
  } else {
    expect(text).toContain('not answering');
  }
});
