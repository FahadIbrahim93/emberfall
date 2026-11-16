/* parity/scenario.mjs — the one scenario both simulations are driven with.

   Kept in its own module so the shipped-core digest and the packages/sim
   comparison cannot drift apart by accident. Every value here is part of the
   committed baselines: changing one re-baselines both sides at once. */
'use strict';

export const TICKS = 900;          /* 7.5 s of fixed 120 Hz simulation */
export const STEP = 1 / 120;
export const DIFFICULTY = 2;       /* Pilot — the reference tier */
export const SEED = 0x5eed1234;    /* fixed Math.random, so "endless" is reproducible */

/** scripted keyboard path: a slow left/up weave, deterministic per tick */
export function inputAt(i) {
  const left = (i % 240) < 120;
  const up = (i % 180) < 90;
  return {
    KeyA: left,
    KeyW: up,
    /* packages/sim takes a vector, index.html reads INPUT.keys */
    mx: left ? -1 : 0,
    my: up ? -1 : 0,
    fire: true,
  };
}

/** the input table, precomputed for injection into the VM */
export function inputTable() {
  const out = [];
  for (let i = 0; i < TICKS; i++) out.push(inputAt(i));
  return out;
}
