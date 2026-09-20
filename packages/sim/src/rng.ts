/** Mulberry32 PRNG — bit-identical to the inline makeRng in index.html. */

export type Rng = (() => number) & {
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  sign(): -1 | 1;
  reseed(seed: number): void;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const f = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(f.range(lo, hi + 1));
  f.pick = <T,>(arr: readonly T[]) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.reseed = (s) => {
    a = s >>> 0;
  };
  return f;
}

/** FNV-1a 32-bit string hash — matches index.html hashStr. */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
