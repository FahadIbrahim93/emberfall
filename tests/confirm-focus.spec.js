const { test, expect } = require('@playwright/test');

/* Gate 1 / issue #79 — the in-game confirm sits over the hangar, and the
   confirmed action rerenders that hangar. Focus must land back on the
   trigger that survived (or its rebuilt replacement), never on <body>.

   The donation button rebuilds itself in renderDonations(), so the element
   stored when the dialog opened is detached by the time the action returns.
   Reset keeps its static button; both paths share the same restoration rule. */

async function openHangar(page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  /* A returning pilot gets the patch-notes dialog a beat after the title. */
  const close = page.locator('#btnNotesClose');
  try {
    await close.waitFor({ state: 'visible', timeout: 2500 });
    await close.click();
  } catch { /* already seen — dialog not shown */ }
  await expect(page.locator('#s-notes')).not.toHaveClass(/on/);
  await page.locator('#btnHangar').click();
  await expect(page.locator('#s-hangar')).toHaveClass(/on/);
}

async function seedLedger(page, alloy, donated) {
  await page.evaluate(([a, d]) => {
    META.alloy = a;
    META.donated = d;
    renderHangar();
  }, [alloy, donated]);
}

/* Enter opens the ask; Tab traps into its first control and Enter confirms.
   This is the keyboard path the audit failed. */
async function confirmFromDonateButton(page) {
  const donate = page.locator('#donateBox .up');
  await donate.focus();
  await expect(donate).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#s-ask')).toHaveClass(/on/);
  await expect(page.locator('#s-ask')).toBeVisible();   /* the fade gates offsetParent */
  await page.keyboard.press('Tab');
  await expect(page.locator('#btnAskYes')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#s-ask')).not.toHaveClass(/on/);
}

async function focusState(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    return {
      id: el ? el.id : null,
      tag: el ? el.tagName : null,
      inHangar: !!(el && document.getElementById('s-hangar').contains(el)),
      donated: META.donated,
      alloy: META.alloy
    };
  });
}

test('confirming an ordinary donation returns focus to the rebuilt trigger', async ({ page }) => {
  await openHangar(page);
  await seedLedger(page, 5000, 0);
  await confirmFromDonateButton(page);

  const state = await focusState(page);
  expect(state.donated, 'one confirmation performs exactly one donation').toBe(5000);
  expect(state.alloy).toBe(0);
  expect(state.tag, 'focus is not left on the document body').not.toBe('BODY');
  expect(state.inHangar, 'focus stays in the hangar').toBe(true);

  /* The rebuilt button is the replacement trigger for the next tier. */
  const donate = page.locator('#donateBox .up');
  await expect(donate).toBeFocused();
  await expect(donate).toContainText('Donate to the yard');

  /* Keyboard continuation: Tab leaves the restored trigger in DOM order. */
  await page.keyboard.press('Tab');
  await expect(page.locator('#btnBayLaunch')).toBeFocused();
});

test('the final donation falls back to a visible hangar control', async ({ page }) => {
  await openHangar(page);
  await seedLedger(page, 75000, 25000);
  await confirmFromDonateButton(page);

  const state = await focusState(page);
  expect(state.donated, 'one confirmation performs exactly one donation').toBe(100000);
  expect(state.alloy).toBe(0);
  expect(state.tag, 'focus is not left on the document body').not.toBe('BODY');
  expect(state.inHangar, 'focus stays in the hangar').toBe(true);

  /* No donation trigger remains — the top honor is bought. */
  await expect(page.locator('#donateBox .up')).toContainText('Yardmaster');
  await expect(page.locator('#btnBayLaunch')).toBeFocused();
});

test('cancelling a donation keeps focus on the original trigger and mutates nothing', async ({ page }) => {
  await openHangar(page);
  await seedLedger(page, 5000, 0);

  const donate = page.locator('#donateBox .up');
  await donate.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#s-ask')).toHaveClass(/on/);
  await page.locator('#btnAskNo').click();
  await expect(page.locator('#s-ask')).not.toHaveClass(/on/);

  const state = await focusState(page);
  expect(state.donated).toBe(0);
  expect(state.alloy).toBe(5000);
  await expect(donate).toBeFocused();
});

test('Escape cancels a donation, returns focus and mutates nothing', async ({ page }) => {
  await openHangar(page);
  await seedLedger(page, 5000, 0);

  const donate = page.locator('#donateBox .up');
  await donate.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#s-ask')).toHaveClass(/on/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#s-ask')).not.toHaveClass(/on/);

  const state = await focusState(page);
  expect(state.donated).toBe(0);
  expect(state.alloy).toBe(5000);
  await expect(donate).toBeFocused();
  await expect(page.locator('#s-hangar')).toHaveClass(/on/);
});

test('confirming a progress reset keeps focus on the surviving reset control', async ({ page }) => {
  await openHangar(page);
  await seedLedger(page, 12345, 25000);

  const wipe = page.locator('#btnWipe');
  await wipe.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#s-ask')).toHaveClass(/on/);
  await expect(page.locator('#s-ask')).toBeVisible();
  await expect(page.locator('#btnAskYes')).toHaveText('Reset progress');
  await page.keyboard.press('Tab');
  await expect(page.locator('#btnAskYes')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#s-ask')).not.toHaveClass(/on/);

  const state = await focusState(page);
  expect(state.alloy, 'reset clears alloy').toBe(0);
  expect(state.donated, 'reset preserves the honor ledger, as it did before').toBe(25000);
  expect(state.tag, 'focus is not left on the document body').not.toBe('BODY');
  await expect(wipe).toBeFocused();

  /* Keyboard continuation from the surviving control. */
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#btnImport')).toBeFocused();
});
