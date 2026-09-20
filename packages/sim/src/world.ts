import { ARENA_W, ARENA_H } from './constants.ts';
import { HULLS } from './catalog.ts';
import type { World, PlayerState, SimMode } from './types.ts';
import { makeRng } from './rng.ts';

export type CreateOpts = {
  seed: number;
  mode?: SimMode;
  hullId?: string;
  difficulty?: number;
};

function basePlayer(hullId: string): PlayerState {
  const hull = HULLS.find((h) => h.id === hullId) ?? HULLS[0];
  return {
    x: ARENA_W * 0.5,
    y: ARENA_H * 0.82,
    vx: 0,
    vy: 0,
    alive: true,
    inv: 2.0,
    r: 5 * hull.hitbox,
    fireCd: 0,
    weapon: 1,
    dashT: 0,
    dashCd: 0,
    charges: hull.dash,
    maxCharges: hull.dash,
    bombs: hull.bombs,
    shield: hull.startShield ? 1 : 0,
    shieldMax: hull.startShield ? 1 : 0,
    overT: 0,
    thrust: 1,
    dmg: hull.dmg,
    speed: hull.speed,
    grazeMul: hull.grazeMul,
    scoreMul: hull.scoreMul,
    rateMul: 1,
    dashMul: 1,
    alloyMul: 1,
    magMul: 1,
    beam: !!hull.beam,
    heat: 0,
    boonIds: [],
  };
}

export function createWorld(opts: CreateOpts): World {
  const hullId = opts.hullId ?? 'vesper';
  const hull = HULLS.find((h) => h.id === hullId) ?? HULLS[0];
  makeRng(opts.seed);
  return {
    seed: opts.seed >>> 0,
    mode: opts.mode ?? 'endless',
    hullId: hull.id,
    difficulty: opts.difficulty ?? 2,
    state: 'playing',
    runT: 0,
    score: 0,
    combo: 0,
    comboT: 0,
    mult: 1,
    maxMult: 1,
    kills: 0,
    grazes: 0,
    deaths: 0,
    bombsUsed: 0,
    wave: 0,
    lives: hull.lives,
    grazeHeat: 0,
    endT: 0,
    player: basePlayer(hull.id),
    log: [],
  };
}
