/** Deterministic trig via lookup tables. Scored math must use these, never Math.sin/cos. */

const LUT_SIZE = 4096;
const TAU = Math.PI * 2;
const SIN_LUT = new Float64Array(LUT_SIZE);
const COS_LUT = new Float64Array(LUT_SIZE);

for (let i = 0; i < LUT_SIZE; i++) {
  const a = (i / LUT_SIZE) * TAU;
  SIN_LUT[i] = Math.sin(a);
  COS_LUT[i] = Math.cos(a);
}

function index(angle: number): number {
  let t = angle / TAU;
  t = t - Math.floor(t);
  if (t < 0) t += 1;
  return (t * LUT_SIZE) | 0;
}

export function sinLut(angle: number): number {
  return SIN_LUT[index(angle)];
}

export function cosLut(angle: number): number {
  return COS_LUT[index(angle)];
}

export { TAU, LUT_SIZE };
