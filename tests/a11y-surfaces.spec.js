const { test, expect } = require('@playwright/test');

/* v4.22.2 — the surface audit, pinned. The DASH/PULSE fix (v4.21.2) was a
   pointerdown-only binding; this spec pins the SURFACE-level findings of
   the follow-up audit so the whole class stays closed:

     1. the playfield canvas is role=img with an instructive label — AT
        users get told what the game is and how to fly it
     2. settings opened from the TITLE traps Tab (the trap-hole: pause and
        game-over already trapped; settings-from-title did not)
     3. pause still traps (pin the existing contract against drift)
     4. settings switches are real buttons: role=switch, aria-checked
        toggles, Enter operates them from the keyboard */

async function titleUp(page) {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
}

test('the playfield canvas announces itself to assistive tech', async ({ page }) => {
  await page.goto('/');
  const role = await page.locator('#game').getAttribute('role');
  const label = await page.locator('#game').getAttribute('aria-label');
  expect(role).toBe('img');
  expect(label).toContain('Keyboard');
  expect(label).toContain('Space fires');
});

test('settings opened from the title traps Tab focus', async ({ page }) => {
  await titleUp(page);
  await page.locator('#btnSettings').click();
  await expect(page.locator('#s-set')).toHaveClass(/on/);
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() =>
    document.activeElement && document.getElementById('s-set').contains(document.activeElement));
  expect(inside, 'focus stays inside the settings dialog after 25 Tabs').toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#s-set')).not.toHaveClass(/on/);
});

test('pause traps Tab focus (pinned contract)', async ({ page }) => {
  await titleUp(page);
  await page.getByRole('button', { name: /Launch intercept/i }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('KeyP');
  await expect(page.locator('#s-pause')).toHaveClass(/on/);
  const inside = () => page.evaluate(() =>
    !!document.activeElement && document.getElementById('s-pause').contains(document.activeElement));
  /* the panel must be focusable the instant it opens: its visibility used to
     wait for the fade, so the synchronous Resume focus was a silent no-op and
     the trap had nothing to hold on to */
  expect(await inside(), 'pause takes focus as soon as it opens').toBe(true);
  /* assert after every press, not only at the end: the escape happened on
     the first presses, while the dialog was still transitioning in */
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await inside(), 'focus stays inside the pause dialog after Tab #' + (i + 1)).toBe(true);
  }
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inside(), 'focus stays inside the pause dialog after Shift+Tab #' + (i + 1)).toBe(true);
  }
});

test('settings switches are keyboard-operable toggles with real state', async ({ page }) => {
  await titleUp(page);
  await page.locator('#btnSettings').click();
  await expect(page.locator('#s-set')).toHaveClass(/on/);
  const sw = page.locator('#swShake');
  expect(await sw.getAttribute('role')).toBe('switch');
  const before = await sw.getAttribute('aria-checked');
  await sw.focus();
  await page.keyboard.press('Enter');
  expect(await sw.getAttribute('aria-checked'), 'Enter toggles the switch').toBe(before === 'true' ? 'false' : 'true');
  // and a click agrees with the keyboard (one control, one truth)
  await sw.click();
  expect(await sw.getAttribute('aria-checked')).toBe(before);
});

/* The settings rebuild: segments are radiogroups with one tab stop and arrow
   keys, sliders publish the value they are setting, and restore-defaults is a
   confirmed action that puts every control back without touching progress. */
test('settings segments are radiogroups: one tab stop, arrow keys select', async ({ page }) => {
  await titleUp(page);
  await page.locator('#btnSettings').click();
  await expect(page.locator('#s-set')).toHaveClass(/on/);
  const group = page.locator('#segDiff');
  expect(await group.getAttribute('role')).toBe('radiogroup');
  const cozy = group.getByRole('radio', { name: 'Cozy', exact: true });
  const cadet = group.getByRole('radio', { name: 'Cadet', exact: true });
  await expect(cozy).toHaveAttribute('aria-checked', 'true');
  await cozy.focus();
  await page.keyboard.press('ArrowRight');
  await expect(cadet).toHaveAttribute('aria-checked', 'true');
  await expect(cozy).toHaveAttribute('aria-checked', 'false');
  expect(await cadet.evaluate(el => el === document.activeElement), 'selection follows focus').toBe(true);
});

test('settings sliders publish the value they set', async ({ page }) => {
  await titleUp(page);
  await page.locator('#btnSettings').click();
  await expect(page.locator('#s-set')).toHaveClass(/on/);
  await expect(page.locator('#oMas')).toHaveText('80%');
  await page.locator('#rMas').evaluate(el => {
    el.value = '35';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#oMas')).toHaveText('35%');
  expect(await page.locator('#rMas').getAttribute('aria-valuetext')).toBe('35%');
});

test('restore defaults resets every control and never touches progress', async ({ page }) => {
  await titleUp(page);
  await page.evaluate(() => { META.alloy = 4321; saveMeta(); });
  await page.locator('#btnSettings').click();
  await expect(page.locator('#s-set')).toHaveClass(/on/);
  const sw = page.locator('#swShake');
  const before = await sw.getAttribute('aria-checked');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await page.locator('#btnSetReset').click();
  await expect(page.locator('#s-ask')).toHaveClass(/on/);
  await expect(page.locator('#btnAskYes')).toHaveText('Restore defaults');
  await page.locator('#btnAskYes').click();
  await expect(sw).toHaveAttribute('aria-checked', before);
  expect(await page.evaluate(() => META.alloy), 'reset never touches alloy').toBe(4321);
});
