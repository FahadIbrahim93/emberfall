const { test, expect } = require('@playwright/test');

test('native-confirm hangar actions are unavailable in an embedded arcade player', async ({ page }) => {
  await page.goto('/');

  // Standalone play retains the reset control and the yard donation action.
  expect(await page.locator('#btnWipe').getAttribute('class')).not.toMatch(/\bhidden\b/);
  await page.evaluate(() => renderDonations());
  await expect(page.locator('#donateBox button')).toHaveCount(1);

  // Load the same build in an iframe, as the arcade player does.
  await page.evaluate(() => new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.id = 'arcade-player';
    iframe.src = '/index.html?portal=1';
    iframe.onload = resolve;
    document.body.appendChild(iframe);
  }));

  const frame = page.frames().find(f => /[?&]portal=1(?:&|$)/.test(new URL(f.url()).search));
  expect(frame, 'the embedded game frame should load').toBeTruthy();
  await expect(page.frameLocator('#arcade-player').locator('#btnWipe')).toHaveClass(/hidden/);

  const result = await frame.evaluate(() => {
    renderDonations();
    let confirmCalls = 0;
    window.confirm = () => { confirmCalls++; return true; };
    const reset = document.getElementById('btnWipe');
    if (reset && typeof reset.onclick === 'function') reset.onclick();
    return {
      confirmCalls,
      donationActions: [...document.querySelectorAll('#donateBox button')]
        .filter(button => /Donate to the yard/i.test(button.textContent)).length,
      milestones: document.querySelectorAll('#donateBox .ms').length
    };
  });

  expect(result.confirmCalls, 'the embedded reset handler must never invoke native confirm').toBe(0);
  expect(result.donationActions, 'the confirm-dependent donation action is omitted in a frame').toBe(0);
  expect(result.milestones, 'yard honor milestones remain available to inspect').toBeGreaterThan(0);
});
