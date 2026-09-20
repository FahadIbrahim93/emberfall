import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createWorld } from '../src/world.ts';
import { step, endHash } from '../src/step.ts';
import { STEP } from '../src/constants.ts';

type Golden = {
  seed: number;
  steps: number;
  endHash: string;
  score: number;
};

function load(name: string): Golden {
  return JSON.parse(readFileSync(new URL(`../../../goldens/${name}`, import.meta.url), 'utf8'));
}

function replay(seed: number, steps: number): string {
  const w = createWorld({ seed, autoWave: true });
  for (let i = 0; i < steps; i++) {
    step(w, STEP, {
      mx: Math.sin(i * 0.04) * 0.6,
      my: Math.cos(i * 0.03) * 0.3,
      fire: i % 4 === 0,
      dash: false,
      pulse: false,
    });
  }
  return endHash(w);
}

describe('T-DET locked goldens', () => {
  for (const name of ['combat-12345.json', 'combat-99991.json', 'combat-42.json']) {
    it(`matches ${name}`, () => {
      const g = load(name);
      expect(g.endHash).toBeTruthy();
      expect(replay(g.seed, g.steps)).toBe(g.endHash);
    });
  }

  it('different seeds diverge', () => {
    const a = load('combat-12345.json');
    const b = load('combat-42.json');
    expect(a.endHash).not.toBe(b.endHash);
  });
});
