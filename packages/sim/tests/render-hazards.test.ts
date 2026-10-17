import { describe, it, expect } from 'vitest';
import {
  HAZARDS,
  type HazardsHost,
  makeHost,
  beginHazards,
  stopHazards,
  updateHazards,
  pullHazards,
  seekMulHazards,
  dashMulHazards,
  drawBackHazards,
  drawFrontHazards,
  makeHazardsScratch,
  HZPULL,
} from '../src/render-hazards';

/* These tests run through a thin adapter over js/hazards.js — the file the
   live client loads (ADR 0003). Expectations here are the CLIENT's truth;
   CI fails if the client and the package ever diverge again. */

describe('single-path hazards — config table (client truth)', () => {
  it('has the expected hazard keys', () => {
    expect(Object.keys(HAZARDS)).toEqual(['gravity', 'storm', 'frost', 'haze', 'flare', 'cloudbank']);
  });

  it('gravity has no strikeEvery and a neutral dashMul of 1', () => {
    expect(HAZARDS.gravity.strikeEvery).toBeUndefined();
    expect(HAZARDS.gravity.dashMul()).toBe(1);
  });

  it('storm declares a strike cadence and slows dash recharge', () => {
    expect(HAZARDS.storm.strikeEvery).toBeTruthy();
    expect(HAZARDS.storm.strikeEvery({ haz: 'storm', hazK: 2 } as any)).toBeCloseTo(2.7 / 2);
    expect(HAZARDS.storm.dashMul()).toBe(1.18);
  });

  it('frost only modifies dash recharge (client: 1.9)', () => {
    expect(HAZARDS.frost.strikeEvery).toBeUndefined();
    expect(HAZARDS.frost.dashMul()).toBe(1.9);
  });

  it('haze declares seekMul and dashMul (client: 1.12)', () => {
    expect(HAZARDS.haze.seekMul).toBeTruthy();
    expect(HAZARDS.haze.dashMul()).toBe(1.12);
    expect(HAZARDS.haze.seekMul({ haz: 'haze', hazK: 2 } as any)).toBe(2);
  });

  it('flare and cloudbank modify dash recharge (client values)', () => {
    expect(HAZARDS.flare.strikeEvery).toBeUndefined();
    expect(HAZARDS.flare.dashMul()).toBe(1.15);
    expect(HAZARDS.cloudbank.strikeEvery).toBeUndefined();
    expect(HAZARDS.cloudbank.dashMul()).toBe(1.1);
  });
});

describe('single-path hazards — runtime factory', () => {
  it('makeHost auto-wires the live instance, starts disarmed', () => {
    const h = makeHost({ STAGE: null });
    expect(h.inst.active).toBeNull();
  });

  it('exposes the shared pull scratch shape', () => {
    const s = makeHazardsScratch();
    expect(typeof s.ax).toBe('number');
    expect(typeof s.ay).toBe('number');
  });

  it('HZPULL is a shared writable zero vec', () => {
    expect(HZPULL.ax).toBe(0);
    expect(HZPULL.ay).toBe(0);
  });
});

describe('single-path hazards — begin / stop', () => {
  it('begin on a world with no hazard keeps it disarmed', () => {
    const h = makeHost({ STAGE: null, GAME_mode: 'playing' });
    beginHazards(h);
    expect(h.inst.active).toBeNull();
  });

  it('begin arms gravity on a stage that declares it', () => {
    const h = makeHost({ STAGE: { haz: 'gravity', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    expect(h.inst.active).toBe(HAZARDS.gravity);
  });

  it('begin computes the gravity well below the bottom of the screen', () => {
    const h = makeHost({ STAGE: { haz: 'gravity', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    expect(h.inst.wl).toEqual([{ x: h.W / 2, y: h.H + 140, k: 52000 * 1 }]);
  });

  it('begin clears existing weather state', () => {
    const h = makeHost({
      STAGE: { haz: 'storm', hazK: 1 },
      GAME_mode: 'playing',
      inst: undefined,
    } as Partial<HazardsHost>);
    h.inst.active = HAZARDS.storm;
    h.inst.t = 9;
    h.inst.nextStrike = 9;
    h.inst.flares.push({ x: 0, t: 0, life: 0, warn: 0, w: 0, y: 0 } as any);
    h.inst.clouds.push({ x: 0, y: 0, vx: 0, w: 0, a: 0 } as any);
    beginHazards(h);
    expect(h.inst.t).toBe(0);
    expect(h.inst.nextStrike).toBe(2.4);
    expect(h.inst.strikeT).toBe(0);
    expect(h.inst.strikeFlash).toBe(0);
    expect(h.inst.flares.length).toBe(0);
    expect(h.inst.clouds.length).toBe(0);
  });

  it('begin is skipped for rush mode', () => {
    const h = makeHost({ STAGE: { haz: 'storm', hazK: 1 }, GAME_mode: 'rush' });
    beginHazards(h);
    expect(h.inst.active).toBeNull();
  });

  it('begin is skipped for school mode', () => {
    const h = makeHost({ STAGE: { haz: 'storm', hazK: 1 }, GAME_mode: 'playing', GAME_school: true });
    beginHazards(h);
    expect(h.inst.active).toBeNull();
  });

  it('stop disarms and clears transient state', () => {
    const h = makeHost({ STAGE: { haz: 'storm', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    h.inst.strikeFlash = 0.3;
    h.inst.flares.push({ x: 0, t: 0, life: 0, warn: 0, w: 0, y: 0 } as any);
    h.inst.clouds.push({ x: 0, y: 0, vx: 0, w: 0, a: 0 } as any);
    stopHazards(h);
    expect(h.inst.active).toBeNull();
    expect(h.inst.k).toBe(0);
    expect(h.inst.wl).toBeNull();
    expect(h.inst.flares.length).toBe(0);
    expect(h.inst.clouds.length).toBe(0);
    expect(h.inst.strikeT).toBe(0);
    expect(h.inst.strikeFlash).toBe(0);
  });
});

describe('single-path hazards — pull math', () => {
  it('returns null when there are no wells, leaving the scratch untouched (live behavior)', () => {
    const h = makeHost({ STAGE: null });
    pullHazards(h, 100, 100, null);
    HZPULL.ax = 99;
    HZPULL.ay = 99;
    expect(pullHazards(h, 0, 0, HZPULL)).toBeNull();
    expect(HZPULL.ax).toBe(99);
    expect(HZPULL.ay).toBe(99);
    HZPULL.ax = 0;
    HZPULL.ay = 0;
  });

  it('zeroes the supplied scratch before accumulating when wells exist', () => {
    const h = makeHost({ STAGE: { haz: 'gravity', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    const out = makeHazardsScratch();
    out.ax = 99;
    out.ay = 99;
    const result = pullHazards(h, h.W / 2, h.H + 140, out);
    expect(result).not.toBeNull();
    expect(out.ax).toBe(0);
    expect(out.ay).toBe(0);
  });

  it('gravity pull strengthens on-axis toward the well', () => {
    const h = makeHost({ STAGE: { haz: 'gravity', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    const wells = h.inst.wl!;
    const expectPull = (px: number, py: number) => {
      let ay = 0;
      for (const w of wells) {
        const dy = w.y - py;
        const d = Math.max(90, Math.abs(dy));
        ay += (dy / d) * (w.k / d);
      }
      return ay;
    };
    // sample two points on the vertical axis through the well (well sits
    // at (W/2, H+140)); the nearer one must be pulled harder — client math
    const close = pullHazards(h, h.W / 2, h.H, null)!;
    const far = pullHazards(h, h.W / 2, 100, null)!;
    expect(close.ay).toBeCloseTo(expectPull(h.W / 2, h.H), 5);
    expect(far.ay).toBeCloseTo(expectPull(h.W / 2, 100), 5);
    // both pulls aim down-screen (well is below), and the close one is stronger
    expect(close.ay).toBeGreaterThan(0);
    expect(far.ay).toBeGreaterThan(0);
    expect(close.ay).toBeGreaterThan(far.ay);
  });
});

describe('single-path hazards — seekMul / dashMul', () => {
  it('seekMul is 1 when no hazard is active', () => {
    const h = makeHost({ STAGE: null });
    expect(seekMulHazards(h)).toBe(1);
  });

  it('seekMul reflects haze intensity', () => {
    const h = makeHost({ STAGE: { haz: 'haze', hazK: 2 }, GAME_mode: 'playing' });
    beginHazards(h);
    expect(seekMulHazards(h)).toBe(2);
  });

  it('dashMul is 1 when no hazard is active', () => {
    const h = makeHost({ STAGE: null });
    expect(dashMulHazards(h)).toBe(1);
  });

  it('dashMul reflects the active hazard (client values)', () => {
    const h = makeHost({ STAGE: { haz: 'storm', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    expect(dashMulHazards(h)).toBe(1.18);
  });
});

describe('single-path hazards — update (client semantics: flash decays the same tick it fires)', () => {
  it('is a no-op when disarmed', () => {
    const h = makeHost({ STAGE: null });
    updateHazards(h, 1 / 60);
    expect(h.inst.active).toBeNull();
  });

  it('storm ticks strike cadence: telegraph fires then flash decays immediately (client: `.14 - dt` same tick)', () => {
    const h = makeHost({ STAGE: { haz: 'storm', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    h.inst.strikeT = 0.1;
    h.inst.nextStrike = 1;
    updateHazards(h, 0.15);
    expect(h.inst.strikeT).toBeCloseTo(-0.05);
    // client truth (index.html update(dt)): strike fires sets `.14`, then the
    // decay line runs on the SAME tick — dt outruns it here, so it goes
    // slightly negative on the frame the strike lands.
    expect(h.inst.strikeFlash).toBeCloseTo(-0.01);
  });

  it('strike flash decays after it fires', () => {
    const h = makeHost({ STAGE: { haz: 'storm', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    h.inst.strikeFlash = 0.14;
    updateHazards(h, 0.05);
    expect(h.inst.strikeFlash).toBeCloseTo(0.09);
  });

  it('strike hurts a live, vulnerable player inside the bite column', () => {
    const hurts: any[] = [];
    const h = makeHost({
      STAGE: { haz: 'storm', hazK: 1 },
      GAME_mode: 'playing',
      canHit: () => true,
      pX: () => 50,
      pY: () => 500,
      hurtPlayer: (src) => hurts.push(src),
    });
    beginHazards(h);
    h.inst.strikeT = 0.01;
    h.inst.strikeX = 60; // within 46 of pX = 50
    updateHazards(h, 1);
    expect(hurts.length).toBe(1);
    expect(hurts[0].x).toBe(60);
    expect(hurts[0].r).toBe(8);
  });

  it('strike does not hurt an invulnerable player', () => {
    const hurts: any[] = [];
    const h = makeHost({
      STAGE: { haz: 'storm', hazK: 1 },
      GAME_mode: 'playing',
      canHit: () => false,
      pX: () => 50,
      pY: () => 500,
      hurtPlayer: (src) => hurts.push(src),
    });
    beginHazards(h);
    h.inst.strikeT = 0.01;
    h.inst.strikeX = 60;
    updateHazards(h, 1);
    expect(hurts.length).toBe(0);
  });

  it('flare state machine ages and recycles in place', () => {
    const h = makeHost({ STAGE: { haz: 'flare', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    expect(h.inst.flares.length).toBe(2); // mkFlare(0) and mkFlare(4.2) from begin()
    const f0 = h.inst.flares[0];
    const t0 = f0.t;                         // capture the START value by value
    const preWarn = Math.max(0.01, f0.warn - 0.2);
    updateHazards(h, preWarn);
    updateHazards(h, preWarn); // cross the warn threshold
    expect(h.inst.flares[0].t).toBeGreaterThan(t0);
    updateHazards(h, f0.life + 1);
    expect(h.inst.flares.length).toBe(2);
    // recycled in place, back at its fresh (non-positive, pre-warn) startoff
    expect(h.inst.flares[0].t).toBeLessThanOrEqual(f0.warn);
    expect(h.inst.flares[0]).not.toBe(f0);   // new object, not the aged one
  });

  it('cloud banks wrap horizontally', () => {
    const h = makeHost({ STAGE: { haz: 'cloudbank', hazK: 1 }, GAME_mode: 'playing' });
    beginHazards(h);
    for (const c of h.inst.clouds) c.vx = 100000; // force a wrap this tick
    updateHazards(h, 0.001); // ~100 px right
    for (const c of h.inst.clouds) {
      expect(c.x).toBeLessThanOrEqual(h.W + c.w);
      expect(c.x).toBeGreaterThanOrEqual(-c.w);
    }
  });

  it('cloud banks hold their posts under REDUCE', () => {
    const h = makeHost({ STAGE: { haz: 'cloudbank', hazK: 1 }, GAME_mode: 'playing', REDUCE: true });
    beginHazards(h);
    const xs = h.inst.clouds.map(c => c.x);
    updateHazards(h, 99);
    h.inst.clouds.forEach((c, i) => expect(c.x).toBe(xs[i]));
  });
});

describe('single-path hazards — drawBack / drawFront contract', () => {
  it('drawBack is a no-op when disarmed or ctx is missing', () => {
    const h = makeHost({ STAGE: null });
    expect(() => drawBackHazards(h)).not.toThrow();
    const armed = makeHost({ STAGE: { haz: 'storm', hazK: 1 }, GAME_mode: 'playing', ctx: null });
    beginHazards(armed);
    expect(() => drawBackHazards(armed)).not.toThrow();
  });

  it('drawFront is a no-op when disarmed', () => {
    const h = makeHost({ STAGE: null });
    expect(() => drawFrontHazards(h)).not.toThrow();
  });

  it('drawBack/drawFront run the full draw path against a real context without throwing', () => {
    const strokes: string[] = [];
    const ctx: any = {
      save: () => strokes.push('save'),
      restore: () => strokes.push('restore'),
      setLineDash: () => strokes.push('dash'),
      beginPath: () => strokes.push('path'),
      moveTo: () => strokes.push('move'),
      lineTo: () => strokes.push('line'),
      arc: () => strokes.push('arc'),
      fillRect: () => strokes.push('rect'),
      stroke: () => strokes.push('stroke'),
      createRadialGradient: () => ({ addColorStop: () => strokes.push('stop') }),
      createLinearGradient: () => ({ addColorStop: () => strokes.push('stop') }),
    };
    ctx.globalAlpha = 0; ctx.strokeStyle = ''; ctx.lineWidth = 0; ctx.fillStyle = '';

    const h = makeHost({
      STAGE: { haz: 'flare', hazK: 1 },
      GAME_mode: 'playing',
      ctx,                 // the fake context must actually reach the module
    });
    beginHazards(h);
    // Manually arm the draw-only state (client semantics: strikeT/strikeFlash
    // are instance state independent of the active hazard's limbs).
    h.inst.strikeT = 0.4;
    h.inst.strikeX = 300;
    h.inst.strikeFlash = 0.14;
    // and one live flare so the band-fill path runs (t inside (0, life))
    h.inst.flares.push({ x: 0, t: 1, life: 2.6, warn: 1.05, w: 60, y: 400 } as any);
    drawBackHazards(h);
    drawFrontHazards(h);
    expect(strokes).toContain('dash');   // telegraph lane
    expect(strokes).toContain('stroke'); // telegraph lane + bolt
    expect(strokes).toContain('rect');   // flare band
  });
});

describe('single-path hazards — public surface', () => {
  it('exports the expected surface shape', () => {
    expect(typeof HAZARDS).toBe('object');
    expect(typeof beginHazards).toBe('function');
    expect(typeof stopHazards).toBe('function');
    expect(typeof updateHazards).toBe('function');
    expect(typeof pullHazards).toBe('function');
    expect(typeof seekMulHazards).toBe('function');
    expect(typeof dashMulHazards).toBe('function');
    expect(typeof drawBackHazards).toBe('function');
    expect(typeof drawFrontHazards).toBe('function');
    expect(typeof makeHazardsScratch).toBe('function');
    expect(typeof HZPULL).toBe('object');
  });
});
