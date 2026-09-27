const { test, expect } = require('@playwright/test');
const fs = require('fs');

/* v4.21.2 — "always reachable": the DASH/PULSE buttons were INVISIBLE on
   hybrid devices (a coarse SECONDARY pointer with a mouse primary — both
   old detectors missed them) and DEAD to keyboard/assistive activation
   (only pointerdown was bound). This spec pins the whole contract.

   Emulation notes (probed empirically — .freebuff/probe.json recipe):
   Emulation.setEmulatedMedia features CANNOT move pointer media queries
   in this Chromium; Emulation.setTouchEmulationEnabled + reload fully
   emulates a coarse pointer (any-pointer AND pointer go coarse). A real
   primary-fine/secondary-coarse hybrid is therefore not CDP-emulatable —
   the any-pointer clause is pinned by source guard + boot behavior, and
   real hybrids are covered because every modern browser reports
   any-pointer honestly. CDP touch needs a small gap between Start and
   End or the pair coalesces. */

async function playing(page) {
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'load' });
  await page.keyboard.press('Space');                      // arm
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await page.getByRole('button', { name: /Launch intercept/i }).click();
  await expect(page.locator('#hud')).toBeVisible();
}

test('coarse-pointer device: touchmode at boot, buttons visible while flying', async ({ page }) => {
  // source drift guard: the detector must keep the any-pointer clause —
  // the ONLY signal a real hybrid (touch secondary, mouse primary) gives
  const src = fs.readFileSync('js/input.js', 'utf8');
  expect(src, 'isTouchDevice must consult any-pointer:coarse (the hybrid case)').toContain('(any-pointer:coarse)');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'load' });
  expect(await page.evaluate(() => matchMedia('(any-pointer:coarse)').matches)).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  await expect(page.locator('body'), 'touchmode at boot on a detected coarse device').toHaveClass(/touchmode/);
  await page.getByRole('button', { name: /Launch intercept/i }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#bDash')).toBeVisible();
  await expect(page.locator('#bBomb')).toBeVisible();
});

test('keyboard and assistive activation fire exactly once (no double-spend)', async ({ page }) => {
  await playing(page);
  await page.evaluate(() => document.body.classList.add('touchmode'));  // surface the buttons on desktop
  await expect(page.locator('#bBomb')).toBeVisible();
  const bombs = () => page.evaluate(() => P.bombs);
  const before = await bombs();
  expect(before).toBeGreaterThanOrEqual(2);   // startRun stocks 2 pulses

  // keyboard: focus + Enter (what a screen reader and a keyboard user get)
  await page.locator('#bBomb').focus();
  await page.keyboard.press('Enter');
  expect(await bombs(), 'Enter on the focused PULSE button spends exactly one pulse').toBe(before - 1);

  // let the nova wave finish (tryBomb refuses during an active pulse; the
  // pulse's slow-mo stretches its 0.75s life to ~1.8s wall at 60fps — and
  // to 2.5s+ at CI's 20fps, where sim-time runs slower than wall time)
  await page.waitForTimeout(3500);
  // …then a real pointer tap: pointerdown + click both land, guard eats the click
  const bb = await page.locator('#bBomb').boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  expect(await bombs(), 'a pointer tap spends exactly one pulse (click guarded)').toBe(before - 2);
  // (the ship stocks exactly 2 pulses — the AT-shape spend lives in its own test)
});

test('AT activation (click without pointerdown) still fires', async ({ page }) => {
  await playing(page);
  await page.evaluate(() => document.body.classList.add('touchmode'));
  const bombs = () => page.evaluate(() => P.bombs);
  const before = await bombs();
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('bBomb').click());
  expect(await bombs(), 'click without a preceding pointerdown (AT activation) fires').toBe(before - 1);
});

test('a real touch upgrades an undetected device on first contact', async ({ page }) => {
  await playing(page);
  expect(await page.evaluate(() => document.body.classList.contains('touchmode')),
    'desktop session must start undetected for this test to mean anything').toBe(false);
  // a genuine touch lands (emulation on mid-session = the first contact a
  // missed-detection device makes; no reload, so boot detection never ran)
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // settle past the title screen's fade (an overlapping screen eats the touch)
  await expect.poll(() => page.evaluate(() => GAME.state), { timeout: 5000 }).toBe('playing');
  await page.waitForTimeout(400);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 400, y: 300, id: 1 }],
  });
  await page.waitForTimeout(150);
  await expect(page.locator('body'), 'first contact joins touchmode — the backstop').toHaveClass(/touchmode/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});
