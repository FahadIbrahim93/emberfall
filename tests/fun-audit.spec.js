const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════════════
   fun-audit.spec.js — "is it fun" becomes FACTS. v2.

   v1 found two things: the flow is title → arm-key → menu → LAUNCH →
   hangar → LAUNCH (two deliberate clicks, by design), and v1's harness
   never held fire (a player error, not a game bug). v2 plays honestly:

     · captures the visible TEXT at every milestone (the copy experience)
     · routes through the hangar like a player
     · holds W + Space during the play window
     · asserts the TRUE first-60-seconds contract

   Artifacts: docs/audit/timeline.json + screens.json + PNGs
   ═══════════════════════════════════════════════════════════════════════ */

const OUT = path.join(__dirname, '..', 'docs', 'audit');

test('first 60 seconds, instrumented', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const screens = [];
  const textOf = () => page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400));
  const snap = () => page.evaluate(() => {
    /* top-level const/let in classic scripts are NOT window properties —
       bare identifiers resolve through the global lexical environment
       (the v2 harness read window.X and measured nothing but fallbacks) */
    const g = typeof GAME !== 'undefined' ? GAME : {};
    const arr = n => (typeof window !== 'undefined' && false) || (eval('typeof ' + n + " !== 'undefined' ? " + n + ' : []'));
    return {
      t: performance.now(),
      state: g.state || 'boot',
      wave: g.wave || 0, score: g.score || 0, kills: g.kills || 0,
      combo: g.combo || 0, mult: g.mult || 1, shots: g.shots || 0, grazes: g.grazes || 0,
      shake: (eval("typeof CAM !== 'undefined' ? CAM.shake : 0")) || 0,
      hitstop: g.hitstop || 0, slowV: g.slowV || 1,
      fps: Math.round(eval("typeof fpsEMA !== 'undefined' ? fpsEMA : 0") || 0),
      foes: arr('foes').length, pb: arr('pb').length, fb: arr('fb').length,
      parts: arr('parts').length, rings: arr('rings').length, picks: arr('picks').length,
    };
  });
  const step = async (name, fn) => {
    const s = await snap();
    screens.push({ name, ms: Date.now() - t0, state: s.state, text: await textOf() });
    return fn ? await fn() : s;
  };

  await page.goto('/');
  const s0 = await step('loaded');
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const armedAt = Date.now() - t0;
  await step('armed-after-key');
  await page.screenshot({ path: path.join(OUT, '01-menu.png') });

  /* the menu: click by ACCESSIBLE NAME — the buttons stack vertically and a
     center-click on #btnLaunch can land on #btnHangar after a layout shift
     (the v2 harness hungared once this way) */
  const menuAt = Date.now() - t0;
  const launch = page.getByRole('button', { name: /Launch intercept/i });
  await expect(launch).toBeVisible({ timeout: 5000 });
  await launch.click();
  await page.waitForTimeout(500);
  const afterMenuAt = Date.now() - t0;
  const landed = (await snap()).state;
  await step('after-menu-launch');
  await page.screenshot({ path: path.join(OUT, '02-hangar.png') });

  /* branch on where the menu launch lands: hangar (ship choice) or straight
     to the field — BOTH are by-design paths; record which */
  let clickAt = afterMenuAt, hangarSeen = false;
  if (landed === 'hangar') {
    hangarSeen = true;
    const bay = page.getByRole('button', { name: /^Launch$/i });
    await expect(bay).toBeVisible({ timeout: 5000 });
    await bay.click();
    clickAt = Date.now() - t0;
    await page.waitForTimeout(300);
  }
  await step('after-launch-sequence');

  /* fly: weave + HOLD fire — like a player */
  const timeline = [];
  const playStart = Date.now();
  let firstPlaying = null, firstShot = null, firstKill = null, firstMult = null, firstFoe = null;
  let maxParts = 0, maxRings = 0, maxShake = 0, maxHitstop = 0, minFps = 99, foesSeen = 0, fbSeen = 0;
  await page.keyboard.down('w');
  await page.keyboard.down('Space');
  try {
    while (Date.now() - playStart < 22000) {
      await page.keyboard.down('a'); await page.waitForTimeout(150); await page.keyboard.up('a');
      await page.keyboard.down('d'); await page.waitForTimeout(150); await page.keyboard.up('d');
      const x = await snap();
      x.ms = Date.now() - playStart;
      timeline.push(x);
      if (x.state === 'playing' && !firstPlaying) firstPlaying = x.ms;
      if (x.shots > 0 && !firstShot) firstShot = x.ms;
      if (x.foes > 0 && !firstFoe) firstFoe = x.ms;
      if (x.kills > 0 && !firstKill) firstKill = x.ms;
      if (x.mult > 1 && !firstMult) firstMult = x.ms;
      if (x.state === 'playing') {
        maxParts = Math.max(maxParts, x.parts); maxRings = Math.max(maxRings, x.rings);
        maxShake = Math.max(maxShake, x.shake); maxHitstop = Math.max(maxHitstop, x.hitstop);
        minFps = Math.min(minFps, x.fps || 99);
        foesSeen = Math.max(foesSeen, x.foes); fbSeen = Math.max(fbSeen, x.fb);
      }
    }
  } finally { await page.keyboard.up('w'); await page.keyboard.up('Space'); }

  const end = await snap();
  await page.screenshot({ path: path.join(OUT, '03-20s-in.png') });
  const endText = await textOf();

  const report = {
    armedAtMs: armedAt, menuAtMs: menuAt, afterMenuState: landed, hangarSeen,
    bayClickAtMs: clickAt,
    firstPlayingMs: firstPlaying, firstShotMs: firstShot, firstFoeMs: firstFoe,
    firstKillMs: firstKill, firstMultMs: firstMult,
    juice: { maxParts, maxRings, maxShake, maxHitstop, minFps,
      warmupMinFps: Math.min(...timeline.slice(0, 10).map(x => x.fps || 99)),
      sustainedMinFps: Math.min(...timeline.slice(10).map(x => x.fps || 99)) },
    combat: { foesSeen, fbSeen }, final: end, samples: timeline.length,
    fpsCurve: timeline.map(x => [x.ms, x.fps, x.parts, x.foes]),
    screens, endText: endText.slice(0, 300),
    samples10s: timeline.filter(x => x.ms % 1000 < 100),
  };
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(report, null, 2));

  /* ── the TRUE first-60-seconds contract ── */
  expect(armedAt, 'armed fast (<2.5s incl. page load)').toBeLessThan(2500);
  expect(firstPlaying, 'flying within 2s of the last launch click').toBeLessThan(2000);
  expect(firstShot, 'player fires within 2s of spawn').toBeLessThan(2000);
  expect(firstFoe, 'foes present within the first window').toBeLessThan(15000);
  expect(fbSeen, 'wave 1 THREATENS: enemy fire seen inside 20s (v4.20 fix — was 0 for 22s)').toBeGreaterThan(0);
  expect(firstKill, 'first kill inside 15s of play').toBeLessThan(15000);
  expect(maxParts, 'particles exist (juice)').toBeGreaterThan(5);
  /* headless CI renders on SwiftShader (software GL) and shares the runner
     CPU with the rest of the suite — the MIN is contention noise (it sat at
     exactly 20 and flaked). The canary is the MEDIAN: a real regression
     (runaway particles, spawn storm) crushes the median too, but a CPU spike
     cannot drag ~140 samples. Min rides home as reported data. */
  const playingFps = timeline.filter(x => x.state === 'playing').map(x => x.fps).sort((a, b) => a - b);
  const medianFps = playingFps.length ? playingFps[Math.floor(playingFps.length / 2)] : 0;
  report.juice.medianFps = medianFps;
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(report, null, 2));
  expect(medianFps, 'headless canary: no perf collapse (median fps)').toBeGreaterThanOrEqual(20);
  expect(end.shots, 'scoreboard counted shots').toBeGreaterThan(0);
  expect(end.fps).toBeGreaterThanOrEqual(30);
});
