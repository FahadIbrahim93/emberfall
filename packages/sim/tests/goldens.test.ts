import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createWorld, step, endHash, STEP } from '../src/index.ts';
import { goldenInput } from '../host/goldens.mjs';

type Golden = {
  seed: number;
  steps: number;
  endHash: string;
  chain: string;
  tickChain: string;
  score: number;
};

function load(name: string): Golden {
  return JSON.parse(readFileSync(new URL(`../../../goldens/${name}`, import.meta.url), 'utf8'));
}

const hex = (h: number): string => ('00000000' + (h >>> 0).toString(16)).slice(-8);

function replay(seed: number, steps: number) {
  const w = createWorld({ seed, autoWave: true });
  let h = 2166136261 >>> 0;
  const tickChain: string[] = [];
  for (let i = 0; i < steps; i++) {
    step(w, STEP, goldenInput(i));
    const t = endHash(w);
    for (let k = 0; k < t.length; k++) { h ^= t.charCodeAt(k); h = Math.imul(h, 16777619); }
    tickChain.push(hex(h));
  }
  return { end: endHash(w), chain: hex(h), tickChain };
}

describe('T-DET locked goldens', () => {
  for (const name of ['combat-12345.json', 'combat-99991.json', 'combat-42.json']) {
    it(`matches ${name}`, () => {
      const g = load(name);
      expect(g.endHash).toBeTruthy();
      const run = replay(g.seed, g.steps);
      expect(run.end).toBe(g.endHash);
      if (g.chain) expect(run.chain).toBe(g.chain);
      if (g.tickChain) {
        const want = String(g.tickChain).split(' ');
        const at = run.tickChain.findIndex((v, i) => v !== want[i]);
        expect(at, at >= 0 ? `golden drifted at tick ${at}` : 'golden tick-chain length differs').toBe(-1);
      }
    });
  }

  it('different seeds diverge', () => {
    const a = load('combat-12345.json');
    const b = load('combat-42.json');
    expect(a.endHash).not.toBe(b.endHash);
  });
});
