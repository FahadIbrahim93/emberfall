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
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() =>
    document.activeElement && document.getElementById('s-pause').contains(document.activeElement));
  expect(inside, 'focus stays inside the pause dialog after 25 Tabs').toBe(true);
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
