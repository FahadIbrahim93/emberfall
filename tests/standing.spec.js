const { test, expect } = require('@playwright/test');

/* v4.30 yard standing — closes #48.
   The ladder is derived from the honor ledger (no new persisted counter), so
   these cases exercise the two things that can actually break: the threshold
   math (rank, remainder, stars past Legend) and the finish selection being
   allowlisted to earned ranks. Both are read off the real hangar. */

async function openHangar(page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  const close = page.locator('#btnNotesClose');
  try {
    await close.waitFor({ state: 'visible', timeout: 2500 });
    await close.click();
  } catch { /* already seen — dialog not shown */ }
  await expect(page.locator('#s-notes')).not.toHaveClass(/on/);
  await page.locator('#btnHangar').click();
  await expect(page.locator('#s-hangar')).toHaveClass(/on/);
  await expect(page.locator('#s-hangar')).toBeVisible();
}

async function seed(page, donated, alloy) {
  await page.evaluate(([d, a]) => {
    META.donated = d;
    META.alloy = a;
    META.plate = 'steel';
    renderHangar();
  }, [donated, alloy]);
}

test('standing asks only for the remainder and unlocks the even-rung plate', async ({ page }) => {
  await openHangar(page);
  /* rank I held, 7,000 of the next step already donated */
  await seed(page, 132000, 30000);
  const box = page.locator('#standingBox');
  await expect(box).toContainText('Steward');
  await expect(box).toContainText('18,000');
  /* brass sits on rank II and is still locked */
  const brass = box.locator('.paint').nth(1);
  await expect(brass).toContainText('rank II');
  await brass.click();
  await expect(box).toContainText('Steward');

  await box.locator('.up').click();
  await expect(page.locator('#s-ask')).toHaveClass(/on/);
  await page.locator('#btnAskYes').click();
  const after = await page.evaluate(() => ({ d: META.donated, a: META.alloy, plate: META.plate }));
  expect(after.d, 'one step lands exactly on the rank threshold').toBe(150000);
  expect(after.a, 'only the remainder was charged').toBe(12000);
  expect(after.plate, 'the new rank arrives already worn').toBe('brass');
  await expect(box).toContainText('Quartermaster');
  /* the trigger was rebuilt by the rerender — focus must follow it */
  await expect(box.locator('.up')).toBeFocused();
});

test('past Yard Legend the ladder keeps counting stars', async ({ page }) => {
  await openHangar(page);
  await seed(page, 100000 + 25000 * 12, 0);
  const box = page.locator('#standingBox');
  await expect(box).toContainText('Yard Legend +2');
  await expect(box).toContainText('to the next star');
  /* the dock plate engraves the same rank, in the worn finish */
  const dock = await page.evaluate(() => {
    META.plate = 'legend';
    saveMeta();
    return { st: standingOf(META.donated), fin: plateFinish().id, title: standingTitle(standingOf(META.donated)) };
  });
  expect(dock.st).toBe(12);
  expect(dock.fin).toBe('legend');
  expect(dock.title).toBe('Yard Legend +2');
});
