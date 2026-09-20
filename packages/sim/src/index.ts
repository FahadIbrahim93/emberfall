export { makeRng, hashStr, type Rng } from './rng.ts';
export { sinLut, cosLut, TAU as TRIG_TAU, LUT_SIZE } from './trig.ts';
export { ARENA_W, ARENA_H, STEP, MAX_ACCUM, GRAZE_HEAT_DECAY } from './constants.ts';
export { clamp, lerp, angDiff, multFor, TAU, PI } from './math.ts';
export {
  HULLS, FOES, FOE_IDS, BOSSES, BOONS, DIFF,
  type HullDef, type FoeDef, type BossDef, type BoonDef, type DiffDef,
} from './catalog.ts';
export type { World, PlayerState, InputFrame, SimMode, Foe, Bullet } from './types.ts';
export { createWorld, type CreateOpts } from './world.ts';
export { step, applyGraze, endHash } from './step.ts';
export {
  spawnFoe, firePlayer, collide, updateCombat, startWave, bindRng,
  SHIP_SCALE, SHOT_SCALE,
} from './combat.ts';

export { spawnBoss, updateBoss, killBoss, BOSS_DEFS, type Boss, type BossDefPure } from './bosses.ts';
