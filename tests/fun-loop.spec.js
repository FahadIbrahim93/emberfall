const { test, expect } = require('@playwright/test');

/* ═══════════════════════════════════════════════════════════════════════
   fun-loop.spec.js — the core loop, proven THROUGH PLAY.

   The fun-audit pins the first 60 seconds of a passive player. This spec
   goes further: a real bot pilot flies via the game's own touch-drag
   scheme (relative aim = shipO + delta*1.45, holding touch = firing —
   the exact semantics in js/input.js), steering with a threat model:

     · predict each enemy bullet's crossing point; dodge inside a 46px
       half-width tube, weighted by time-to-impact;
     · hold a safe altitude band (62-82% height) and weave when clear;
     · flee any hostile that closes within 90px.

   The assertions are the GAME's core promises, proven by play:
     survive into wave 2+ · graze at least one bullet · chain a combo to
     ×2 or better · double-digit kills · death is not required.

   Frames are captured for the press kit (docs/audit/frames/, git-ignored).

   Run:  npx playwright test tests/fun-loop.spec.js
   ═══════════════════════════════════════════════════════════════════════ */

test.setTimeout(120000);

test('a bot pilot survives, grazes and combos through real play', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Space');            // arm
  await page.waitForTimeout(350);
  const launch = page.getByRole('button', { name: /Launch intercept/i });
  await expect(launch).toBeVisible({ timeout: 5000 });
  await launch.click();
  await page.waitForTimeout(400);
  /* some paths land in the hangar (ship choice) — launch from there too */
  const state1 = await page.evaluate(() => (typeof GAME !== 'undefined' && GAME.state) || 'boot');
  if (state1 === 'hangar') {
    const bay = page.getByRole('button', { name: /^Launch$/i });
    await expect(bay).toBeVisible({ timeout: 5000 });
    await bay.click();
    await page.waitForTimeout(300);
  }
  const st = await page.evaluate(() => ({
    state: (typeof GAME !== 'undefined' && GAME.state) || 'boot',
    W: typeof W !== 'undefined' ? W : 1280,
    H: typeof H !== 'undefined' ? H : 720,
    px: P.x, py: P.y,
  }));
  if (st.state !== 'playing') throw new Error('did not reach playing state: ' + st.state);

  /* ── the touch-drag channel (exact js/input.js semantics) ──
     touchStart at (ox, oy) captures shipO = P at that instant; every
     touchMove sets aim = shipO + (client - origin) * 1.45; touch held
     means firing. We keep our own model of the accumulated delta D. */
  const cdp = await page.context().newCDPSession(page);
  const origin = { x: st.px, y: st.py };
  const D = { x: 0, y: 0 };               // accumulated drag delta (screen px)
  let touchActive = false;
  const touchStart = async () => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: origin.x, y: origin.y + 120, id: 1 }],
    });
    touchActive = true;
  };
  const touchMove = async (dx, dy) => {
    D.x = dx; D.y = dy;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: origin.x + dx, y: origin.y + 120 + dy, id: 1 }],
    });
  };

  const sample = () => page.evaluate(() => {
    const me = { x: P.x, y: P.y };
    const bullets = (typeof fb !== 'undefined' ? fb : []).map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy }));
    const hosts = (typeof foes !== 'undefined' ? foes : []).map(e => ({ x: e.x, y: e.y }));
    const drops = (typeof picks !== 'undefined' ? picks : []).map(p => ({ x: p.x, y: p.y }));
    return {
      state: GAME.state, wave: GAME.wave, kills: GAME.kills, deaths: GAME.deaths || 0,
      grazes: GAME.grazes, combo: GAME.combo, mult: GAME.mult, score: GAME.score,
      lives: GAME.lives, me, bullets, hosts, drops,
      fps: Math.round((typeof fpsEMA !== 'undefined' && fpsEMA) || 0),
    };
  });

  /* ── the threat model ── */
  function steer(s, tSec) {
    const { me, bullets, hosts, drops } = s;
    let dangerX = 0, danger = false;
    for (const b of bullets) {
      if (b.vy <= 40) continue;                        // only things coming down-ish
      const tHit = (me.y - b.y) / b.vy;                // seconds until it crosses my line
      if (tHit <= 0.02 || tHit > 0.85) continue;
      const bx = b.x + b.vx * tHit;
      const dx = me.x - bx;
      if (Math.abs(dx) < 46) {                         // inside the tube
        danger = true;
        dangerX += Math.sign(dx || 1) * (1 - tHit / 0.85);
      }
    }
    for (const e of hosts) {                           // rammers and collisions
      const dx = me.x - e.x, dy = me.y - e.y;
      if (dx * dx + dy * dy < 90 * 90) { danger = true; dangerX += Math.sign(dx || 1) * 1.2; }
    }
    /* weapon drops swing dps hard — seek the nearest one when not dodging */
    let vx = 0, vy = 0;
    if (!danger && drops.length) {
      let bestD = 1e9, target = null;
      for (const d of drops) {
        const dd = (d.x - me.x) * (d.x - me.x) + (d.y - me.y) * (d.y - me.y);
        if (dd < bestD && d.y > me.y - 40) { bestD = dd; target = d; }
      }
      if (target && bestD < 300 * 300) {
        vx = Math.max(-260, Math.min(260, (target.x - me.x) * 3));
        vy = Math.max(-140, Math.min(200, (target.y - me.y) * 2.4));
        return { vx, vy };                             // drops are the dps engine
      }
    }
    if (danger) vx = Math.sign(dangerX || 1) * 300;    // dodge decisively
    else vx = 110 * Math.sin(tSec * 0.9) + (st.W / 2 - me.x) * 0.5;  // weave home
    if (me.y < st.H * 0.62) vy = 70;
    else if (me.y > st.H * 0.82) vy = -70;
    return { vx, vy };
  }

  /* ── the flight loop ── */
  const framesDir = 'docs/audit/frames';
  require('fs').mkdirSync(framesDir, { recursive: true });
  const timeline = [];
  let frameIdx = 0, lastShot = 0;
  const t0 = Date.now();
  const DUR = 56000;
  await touchStart();
  try {
    while (Date.now() - t0 < DUR) {
      const tick = (Date.now() - t0) / 1000;
      const s = await sample();
      if (s.state !== 'playing') {                     // died → the run may be over
        timeline.push({ t: tick, state: s.state });
        if (s.state === 'over') break;
        await page.waitForTimeout(200);
        continue;
      }
      const { vx, vy } = steer(s, tick);
      /* drag delta per tick: aim advances by (vx,vy)*dt, input gain is 1.45 */
      const dt = 0.05;
      const ndx = Math.max(-620, Math.min(620, D.x + vx * dt / 1.45));
      const ndy = Math.max(-620, Math.min(620, D.y + vy * dt / 1.45));
      await touchMove(ndx, ndy);
      timeline.push({ t: +tick.toFixed(2), wave: s.wave, k: s.kills, g: s.grazes,
        c: s.combo, m: s.mult, fps: s.fps, danger: undefined, x: Math.round(s.me.x) });
      /* press-kit frames: grab the opening 24s at ~9fps */
      if (tick < 24 && Date.now() - lastShot > 110) {
        lastShot = Date.now();
        try { await page.screenshot({ path: `${framesDir}/f${String(frameIdx++).padStart(4, '0')}.png` }); } catch { /* fine */ }
      }
      await page.waitForTimeout(50);
    }
  } finally {
    if (touchActive) { try { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } catch { /* gone */ } }
  }

  const best = timeline.reduce((a, x) => ({
    wave: Math.max(a.wave, x.wave || 0), grazes: Math.max(a.grazes, x.g || 0),
    combo: Math.max(a.combo, x.c || 0), mult: Math.max(a.mult, x.m || 0),
    kills: Math.max(a.kills, x.k || 0),
  }), { wave: 0, grazes: 0, combo: 0, mult: 0, kills: 0 });
  const last = timeline[timeline.length - 1] || {};
  const fpsSamples = timeline.map(x => x.fps).filter(Boolean).sort((a, b) => a - b);
  const medianFps = fpsSamples.length ? fpsSamples[Math.floor(fpsSamples.length / 2)] : 0;
  require('fs').writeFileSync('docs/audit/fun-loop.json', JSON.stringify({
    best, deaths: last.wave !== undefined ? undefined : undefined,
    finalState: last.state || 'playing', medianFps, samples: timeline.length,
    endWave: last.wave, endKills: last.k,
  }, null, 2));

  /* ── the core-loop contract, proven by play ── */
  expect(best.wave, 'survived into wave 2+ through play').toBeGreaterThanOrEqual(2);
  expect(best.grazes, 'grazed at least one bullet through play').toBeGreaterThan(0);
  expect(best.mult, 'combo reached ×2 or better through play').toBeGreaterThanOrEqual(2);
  expect(best.kills, 'double-digit kills through play').toBeGreaterThanOrEqual(10);
  expect(medianFps, 'headless canary: no perf collapse during real play').toBeGreaterThanOrEqual(18);
});
