import { ARENA_W, ARENA_H } from './constants.ts';
import { HULLS } from './catalog.ts';
import type { World, PlayerState, SimMode } from './types.ts';
import { bindRng, startWave } from './combat.ts';

export type CreateOpts = {
  seed: number;
  mode?: SimMode;
  hullId?: string;
  difficulty?: number;
  autoWave?: boolean;
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
  bindRng(opts.seed);
  const world: World = {
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
    hits: 0,
    shots: 0,
    grazes: 0,
    deaths: 0,
    bombsUsed: 0,
    wave: 0,
    lives: hull.lives,
    grazeHeat: 0,
    endT: 0,
    player: basePlayer(hull.id),
    foes: [],
    playerBullets: [],
    foeBullets: [],
    nextId: 1,
    dirT: 0,
    dirPhase: 'rest',
    dirRestT: 0.5,
    spawnQueue: [],
    log: [],
  };
  if (opts.autoWave !== false && world.mode !== 'school') {
    world.wave = 1;
    startWave(world);
  }
  return world;
}
