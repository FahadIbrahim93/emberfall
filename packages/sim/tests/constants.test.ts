import { describe, it, expect } from 'vitest';
import { ARENA_W, ARENA_H, STEP, MAX_ACCUM } from '../src/constants.ts';
import { sinLut, cosLut, TAU } from '../src/trig.ts';

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

describe('trig LUT', () => {
  it('sin/cos at 0 and π/2 match Math within LUT resolution', () => {
    expect(sinLut(0)).toBeCloseTo(0, 4);
    expect(cosLut(0)).toBeCloseTo(1, 4);
    expect(sinLut(TAU / 4)).toBeCloseTo(1, 3);
    expect(cosLut(TAU / 4)).toBeCloseTo(0, 3);
  });

  it('is deterministic across calls', () => {
    expect(sinLut(1.234)).toBe(sinLut(1.234));
  });
});
