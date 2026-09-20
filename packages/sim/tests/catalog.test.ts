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

  it('has 14 foe types', () => {
    expect(FOE_IDS).toHaveLength(14);
    expect(FOES.drone.sc).toBe(50);
    expect(FOES.carrier.armored).toBe(true);
  });

  it('has 4 bosses', () => {
    expect(BOSSES).toHaveLength(4);
    expect(BOSSES.map((b) => b.id)).toEqual([
      'dreadnought', 'matriarch', 'tyrant', 'gatewarden',
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
