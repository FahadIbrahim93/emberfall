/** Fixed logical arena — independent of viewport (T-ARENA). Renderer letterboxes. */
export const ARENA_W = 540;
export const ARENA_H = 960;

/** Fixed sim step (120 Hz). */
export const STEP = 1 / 120;

/** Max accumulated steps per frame (death-spiral guard). */
export const MAX_ACCUM = 5;

/** Graze heat decay rate: 1 heat/sec (a graze sets ~3 → ~3s window). */
export const GRAZE_HEAT_DECAY = 1;
