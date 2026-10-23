const { test, expect } = require('@playwright/test');

/* The Global tab reads the worldwide Supabase board through its
   publishable key; if that sleeps, an honest local-mode line. Never a
   blank board, never a thrown error. */

async function openGlobalTab(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
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

test('Global tab shows the worldwide mirror or an honest fallback', async ({ page }) => {
  await openGlobalTab(page);
  /* the static host has no /api; abort the legacy probe outright so the
     client settles in local mode deterministically */
  await page.route('**/api/health', route => route.abort());
  await page.evaluate(() => { NET.on = false; NET.user = null; NET.probed = false; });
  await page.evaluate(() => NET.renderGlobal());
  await page.waitForFunction(() => {
    const el = document.querySelector('#globalBoard');
    const t = el ? (el.textContent || '') : '';
    return el && el.querySelector('.row') !== null || /not answering|No ranked pilots/.test(t);
  }, null, { timeout: 15000 });
  await expect(page.locator('#globalStatus')).toContainText('local mode');
  const text = await page.locator('#globalBoard').textContent();
  const mirrorRows = await page.locator('#globalBoard .row').count();
  if (mirrorRows > 0) {
    expect(text).toContain('public mirror');
    /* the mirror footer hands the pilot the full stats page (v4.19.0):
       present with rows, absent on the fallback (it lives IN the footer) */
    await expect(page.locator('#globalBoard a[href="stats.html"]')).toHaveCount(1);
  } else if (/No ranked pilots/.test(text)) {
    /* v4.26.1: a third honest state — the mirror ANSWERS and is genuinely
       empty (the true world state since the 2026-09-30 mirror purge; the
       machine pilots are gone and no human has flown yet). The footer is
       a footer FOR the rows, so it stays absent here — the empty state
       invites the pilot to fly instead */
    expect(text).toContain('public board');
    await expect(page.locator('#globalBoard a[href="stats.html"]')).toHaveCount(0);
  } else {
    expect(text).toContain('not answering');
    await expect(page.locator('#globalBoard a[href="stats.html"]')).toHaveCount(0);
  }
});
