/**
 * Thin adapter (ADR 0003): the single-path shared math runtime lives in
 * ../../../js/math.js — the exact file the client loads as a classic script
 * (scalars + the combo multiplier bands). This module owns NO tables and NO
 * scoring numbers. The side-effect import executes the live runtime, which
 * self-registers as `window.MATHMOD` in the browser and `globalThis.MATHMOD`
 * under Node test runners — so scored-math tests guard the live path.
 */
import '../../../js/math.js';

interface MATHModule {
  TAU: number;
  PI: number;
  clamp(v: number, a: number, b: number): number;
  lerp(a: number, b: number, k: number): number;
  angDiff(a: number, b: number): number;
  multFor(c: number): number;
}

const M = (globalThis as unknown as { MATHMOD?: MATHModule }).MATHMOD;
if (!M) throw new Error('single-path wiring broken: js/math.js did not register MATHMOD');

export const TAU: number = M.TAU;
export const PI: number = M.PI;

export function clamp(v: number, lo: number, hi: number): number {
  return M.clamp(v, lo, hi);
}

export function lerp(a: number, b: number, t: number): number {
  return M.lerp(a, b, t);
}

export function angDiff(a: number, b: number): number {
  return M.angDiff(a, b);
}

export function multFor(combo: number): number {
  return M.multFor(combo);
}
