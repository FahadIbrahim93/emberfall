/* host/goldens.mjs — the committed golden replays.
 *
 * One definition, used by packages/sim/tests/goldens.test.ts (through the
 * facade) and by tools/replay-record.mjs. The endHash a golden records is the
 * shipped core's scored-state tuple, so a golden is a statement about the game,
 * not about a copy of it. */
'use strict';

export const GOLDEN_SEEDS = [42, 12345, 99991];
export const GOLDEN_TICKS = 2400;

/** the scripted flight path every golden replays */
export function goldenInput(i) {
  return {
    mx: Math.sin(i * 0.04) * 0.6,
    my: Math.cos(i * 0.03) * 0.3,
    fire: i % 4 === 0,
  };
}
