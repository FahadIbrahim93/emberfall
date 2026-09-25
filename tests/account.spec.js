const { test, expect } = require('@playwright/test');

/* Account self-management, driven through the REAL panel — no endpoint
   shortcuts. The deletion flow opens TWO dialogs per click (a confirm,
   then a typed-callsign prompt), so every click here registers stacked
   once-handlers in firing order; a dangling dialog hangs the page. */

const CALLSIGN = () => 'PanelE2E' + String(Date.now()).slice(-6);

const openSignedIn = async (page, name, pass) => {
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  const notes = page.locator('#s-notes.on');
  if (await notes.count()) await page.click('#btnNotesClose');
  await page.click('#btnSettings');
  await expect(page.locator('#s-set')).toHaveClass(/on/, { timeout: 5000 });
  await page.fill('#acctName', name);
  await page.fill('#acctPass', pass);
  await page.click('#btnAcctNew');
  await page.waitForTimeout(900);
  await expect(page.locator('#acctStat')).toContainText('signed in');
};

const deleteClick = async (page, typed) => {
  /* the deletion flow opens TWO dialogs (confirm → prompt). page.once
     handlers both fire on the FIRST dialog event, so this is scripted with
     one counting handler: dialog #1 confirm-accept, dialog #2 prompt gets
     the typed callsign. */
  let n = 0;
  const handler = d => {
    n += 1;
    if (n === 1) d.accept();
    else { d.accept(typed); page.off('dialog', handler); }
  };
  page.on('dialog', handler);
  await page.click('#btnAcctDel');
  await page.waitForTimeout(1400);
};

test('password change through the panel retires the old password', async ({ page }) => {
  const name = CALLSIGN();
  await openSignedIn(page, name, 'panel-pass-1');
  await page.click('#btnAcctMgmt');
  await expect(page.locator('#acctMgmt')).toBeVisible();
  await page.fill('#mgmtPassCur', 'panel-pass-1');
  await page.fill('#mgmtPassNew', 'panel-pass-2');
  await page.click('#btnAcctPass');
  await page.waitForTimeout(900);
  const oldLogin = await page.evaluate(async ([n]) => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' }, body: JSON.stringify({ name: n, password: 'panel-pass-1' }) });
    return r.status;
  }, [name]);
  expect(oldLogin).toBe(401);
  const newLogin = await page.evaluate(async ([n]) => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' }, body: JSON.stringify({ name: n, password: 'panel-pass-2' }) });
    return r.status;
  }, [name]);
  expect(newLogin).toBe(200);
  /* cleanup through the same panel: confirm + typed callsign */
  await page.fill('#mgmtDelPass', 'panel-pass-2');
  await deleteClick(page, name);
  await expect(page.locator('#acctStat')).not.toContainText('signed in');
});

test('deletion requires the typed callsign and ends the session', async ({ page }) => {
  const name = CALLSIGN();
  await openSignedIn(page, name, 'delete-pass-1');
  await page.click('#btnAcctMgmt');
  await expect(page.locator('#acctMgmt')).toBeVisible();

  /* dismissed confirm — nothing may happen (dialog #1 dismissed; the
     prompt never opens, so the handler removes itself) */
  await page.once('dialog', d => { d.dismiss(); });
  await page.click('#btnAcctDel');
  await page.waitForTimeout(600);
  await expect(page.locator('#acctStat')).toContainText('signed in');

  /* wrong typed callsign — still signed in */
  await page.fill('#mgmtDelPass', 'delete-pass-1');
  await deleteClick(page, 'not-my-callsign');
  await expect(page.locator('#acctStat')).toContainText('signed in');

  /* correct flow: the session ends and the account is really gone */
  await page.fill('#mgmtDelPass', 'delete-pass-1');
  await deleteClick(page, name);
  await expect(page.locator('#acctStat')).not.toContainText('signed in');
  const status = await page.evaluate(async ([n]) => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' }, body: JSON.stringify({ name: n, password: 'delete-pass-1' }) });
    return r.status;
  }, [name]);
  expect([401, 409]).toContain(status);   // gone (401) or callsign retired (409)
});
