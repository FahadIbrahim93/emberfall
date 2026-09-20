import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.ts';
import { step, applyGraze, endHash } from '../src/step.ts';
import { ARENA_W, ARENA_H, STEP } from '../src/constants.ts';
import type { InputFrame } from '../src/types.ts';

const idle: InputFrame = { mx: 0, my: 0, fire: false, dash: false, pulse: false };

describe('createWorld', () => {
  it('spawns player inside fixed arena', () => {
    const w = createWorld({ seed: 1 });
    expect(w.player.x).toBeGreaterThan(0);
    expect(w.player.x).toBeLessThan(ARENA_W);
    expect(w.player.y).toBeGreaterThan(0);
    expect(w.player.y).toBeLessThan(ARENA_H);
    expect(w.lives).toBe(3);
  });

  it('respects hull lives', () => {
    expect(createWorld({ seed: 1, hullId: 'wraith' }).lives).toBe(1);
    expect(createWorld({ seed: 1, hullId: 'atlas' }).lives).toBe(5);
  });
});

describe('T-ARENA: movement clamps to logical arena', () => {
  it('cannot leave the 540×960 box', () => {
    const w = createWorld({ seed: 7 });
    const left: InputFrame = { mx: -1, my: 0, fire: false, dash: false, pulse: false };
    for (let i = 0; i < 600; i++) step(w, STEP, left);
    expect(w.player.x).toBeGreaterThanOrEqual(w.player.r);
    expect(w.player.x).toBeLessThanOrEqual(ARENA_W - w.player.r);

    const up: InputFrame = { mx: 0, my: -1, fire: false, dash: false, pulse: false };
    for (let i = 0; i < 600; i++) step(w, STEP, up);
    expect(w.player.y).toBeGreaterThanOrEqual(w.player.r);
  });
});

describe('P0-3 grazeHeat decay', () => {
  it('decays to 0 within ~3s after last graze even with comboT expired', () => {
    const w = createWorld({ seed: 9 });
    applyGraze(w);
    expect(w.grazeHeat).toBe(3);
    w.comboT = 0;
    for (let i = 0; i < Math.ceil(3.1 / STEP); i++) step(w, STEP, idle);
    expect(w.grazeHeat).toBe(0);
  });

  it('continues decaying while comboT > 0', () => {
    const w = createWorld({ seed: 9 });
    applyGraze(w);
    w.comboT = 10;
    for (let i = 0; i < Math.ceil(1.0 / STEP); i++) step(w, STEP, idle);
    expect(w.grazeHeat).toBeCloseTo(2, 1);
  });
});

describe('T-DET: same seed + inputs → same endHash', () => {
  it('replays identically', () => {
    const run = (seed: number) => {
      const w = createWorld({ seed, hullId: 'vesper' });
      for (let i = 0; i < 240; i++) {
        const inp: InputFrame = {
          mx: Math.sin(i * 0.07),
          my: Math.cos(i * 0.05),
          fire: i % 3 === 0,
          dash: false,
          pulse: false,
        };
        step(w, STEP, inp);
        if (i % 40 === 0) applyGraze(w);
      }
      return { hash: endHash(w), score: w.score, grazes: w.grazes, logLen: w.log.length };
    };
    const a = run(424242);
    const b = run(424242);
    expect(a).toEqual(b);
    expect(a.logLen).toBe(240);
  });

  it('different seeds stored on world', () => {
    const wa = createWorld({ seed: 1 });
    const wb = createWorld({ seed: 2 });
    expect(wa.seed).not.toBe(wb.seed);
  });
});
