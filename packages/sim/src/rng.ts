/**
 * Thin adapter (ADR 0003): the single-path deterministic RNG runtime lives in
 * ../../../js/rng.js — the exact file the client loads as a classic script
 * (mulberry32 + FNV-1a). This module owns NO state, NO tables. The
 * side-effect import executes the live runtime, which self-registers as
 * `window.RNGMOD` in the browser and `globalThis.RNGMOD` under Node test
 * runners — so the determinism goldens run the literal bytes the player
 * executes.
 */
import '../../../js/rng.js';

export type Rng = (() => number) & {
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  sign(): -1 | 1;
  reseed(seed: number): void;
};

interface RNGModule {
  makeRng(seed: number): Rng;
  hashStr(s: string): number;
}

const RNGMOD = (globalThis as unknown as { RNGMOD?: RNGModule }).RNGMOD;
if (!RNGMOD) throw new Error('single-path wiring broken: js/rng.js did not register RNGMOD');

export function makeRng(seed: number): Rng {
  return RNGMOD.makeRng(seed);
}

export function hashStr(s: string): number {
  return RNGMOD.hashStr(s);
}
