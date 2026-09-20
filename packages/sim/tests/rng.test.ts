import { describe, it, expect } from 'vitest';
import { makeRng, hashStr } from '../src/rng.ts';

describe('makeRng (mulberry32)', () => {
  it('is deterministic for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(
      Array.from({ length: 5 }, () => b()),
    );
  });

  it('range stays within [lo, hi)', () => {
    const r = makeRng(99);
    for (let i = 0; i < 100; i++) {
      const v = r.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('reseed restores sequence', () => {
    const r = makeRng(7);
    const first = Array.from({ length: 5 }, () => r());
    r.reseed(7);
    const second = Array.from({ length: 5 }, () => r());
    expect(second).toEqual(first);
  });

  it('golden sequence for seed 12345 (T-DET anchor)', () => {
    const r = makeRng(12345);
    const got = Array.from({ length: 8 }, () => r());
    expect(got.map((x) => x.toFixed(10))).toEqual([
      '0.9797282678',
      '0.3067522645',
      '0.4842054215',
      '0.8179344125',
      '0.5094283693',
      '0.3474718605',
      '0.0737575418',
      '0.7663964673',
    ]);
  });
});

describe('hashStr', () => {
  it('is stable', () => {
    expect(hashStr('emberfall')).toBe(hashStr('emberfall'));
    expect(hashStr('a')).not.toBe(hashStr('b'));
  });
});
