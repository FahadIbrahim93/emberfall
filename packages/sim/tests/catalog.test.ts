import { describe, it, expect } from 'vitest';
import { HULLS, FOES, FOE_IDS, BOSSES, BOONS, DIFF } from '../src/catalog.ts';

describe('content catalogs (live counts — G-CONTENT grows later)', () => {
  it('has 5 hulls including seraph prism', () => {
    expect(HULLS).toHaveLength(5);
    expect(HULLS.map((h) => h.id)).toEqual([
      'vesper', 'halcyon', 'atlas', 'wraith', 'seraph',
    ]);
    expect(HULLS.find((h) => h.id === 'seraph')?.beam).toBe(true);
    expect(HULLS[0].cost).toBe(0);
  });

  it('has 20 foe types (14 launch + 6 gen-2 v4.0 — parity with index.html)', () => {
    expect(FOE_IDS).toHaveLength(20);
    expect(FOES.drone.sc).toBe(50);
    expect(FOES.carrier.armored).toBe(true);
  });

  it('has 5 bosses (incl. the rare Wardenfall)', () => {
    expect(BOSSES).toHaveLength(5);
    expect(BOSSES.map((b) => b.id)).toEqual([
      'dreadnought', 'matriarch', 'tyrant', 'gatewarden', 'wardenfall',
    ]);
  });

  it('has 9 boons', () => {
    expect(BOONS).toHaveLength(9);
  });

  it('has 5 difficulty tiers', () => {
    expect(DIFF).toHaveLength(5);
    expect(DIFF[0].name).toBe('Cozy');
    expect(DIFF[4].name).toBe('Nightmare');
  });
});
