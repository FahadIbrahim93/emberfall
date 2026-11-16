import { describe, it, expect } from 'vitest';
import {
  ARENA_W, ARENA_H, STEP, MAX_ACCUM, GRAZE_HEAT_DECAY,
  SHIP_SCALE, SHOT_SCALE, createWorld,
} from '../src/index.ts';

describe('T-ARENA constants', () => {
  it('logical arena is fixed 540×960', () => {
    expect(ARENA_W).toBe(540);
    expect(ARENA_H).toBe(960);
  });

  it('sim step is 1/120', () => {
    expect(STEP).toBeCloseTo(1 / 120, 12);
  });

  it('MAX_ACCUM guards death spiral', () => {
    expect(MAX_ACCUM).toBe(5);
  });
});

describe('shipped geometry and decay', () => {
  /* the old trig-LUT block went with the duplicate sim: the shipped core uses
     Math.sin/cos directly, so there is no LUT to compare. These assertions
     cover the dimensions and decay constants that replaced it. */
  it('a fresh world is laid out at the shipped scale', () => {
    const w = createWorld({ seed: 3 });
    expect(w.player.x).toBeGreaterThan(0);
    expect(w.player.x).toBeLessThan(ARENA_W);
    expect(w.player.y).toBeGreaterThan(0);
    expect(w.player.y).toBeLessThan(ARENA_H);
    expect(w.player.r).toBeGreaterThan(0);
  });

  it('render scales and graze decay are the shipped values', () => {
    expect(SHIP_SCALE).toBe(1.3);
    expect(SHOT_SCALE).toBe(1.18);
    expect(GRAZE_HEAT_DECAY).toBe(1);
  });
});
