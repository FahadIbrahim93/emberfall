export const TAU = Math.PI * 2;
export const PI = Math.PI;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function angDiff(a: number, b: number): number {
  let d = b - a;
  while (d > PI) d -= TAU;
  while (d < -PI) d += TAU;
  return d;
}

/** Combo multiplier bands — matches index.html multFor. */
export function multFor(combo: number): number {
  if (combo >= 40) return 5;
  if (combo >= 24) return 4;
  if (combo >= 13) return 3;
  if (combo >= 5) return 2;
  return 1;
}
