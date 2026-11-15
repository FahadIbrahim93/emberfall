/**
 * packages/sim — the simulation, and now the only one.
 *
 * THE SEAM IS CLOSED. This package used to be a 1,180-line TypeScript
 * re-implementation that the game never imported; the shipped inline core in
 * index.html was the real thing, and the two disagreed on the shared scenario.
 * The duplicate is gone. Everything below is a typed facade over the very bytes
 * the browser executes, loaded headlessly by ../../host/env.mjs. There is one
 *    simulation: js/sim.js. The game loads it as a classic script
 * (no build, file:// works); the tests import this module, which boots those
 * same bytes in a Node vm context.
 *
 * Consequences worth knowing:
 *   - The simulation's own state lives in the vm realm. `world` exposes live
 *     getters/setters onto the real `GAME`/`P`/`foes`/`pb`/`fb` objects rather
 *     than copying them, so a test that pokes `w.player.inv` is poking the
 *     shipped player.
 *   - Input is a two-axis sign plus a trigger, because that is what the shipped
 *     keyboard path consumes. Analog magnitudes are not simulated.
 *   - Each world boots a fresh context. `R`/`FX` are reseeded after startRun so
 *     the test seed, not Math.random, drives the run.
 *   - Behaviour here is whatever the game does, by construction. If a test
 *     disagrees with it, the test is describing a game that does not exist.
 */
import { loadShippedCore } from '../host/env.mjs';

export type InputFrame = {
  mx: number;
  my: number;
  fire: boolean;
  dash?: boolean;
  pulse?: boolean;
};

export type CreateOpts = {
  seed?: number;
  mode?: string;
  hullId?: string;
  difficulty?: number;
  autoWave?: boolean;
};

export const ARENA_W = 540;
export const ARENA_H = 960;
export const STEP = 1 / 120;
export const MAX_ACCUM = 5;
export const GRAZE_HEAT_DECAY = 1;
export const SHIP_SCALE = 1.3;
export const SHOT_SCALE = 1.18;

type Core = ReturnType<typeof loadShippedCore>;

/* one shared context for the read-only catalogs; worlds get their own */
let catalogCore: Core | null = null;
function catalogs(): Core {
  if (!catalogCore) catalogCore = loadShippedCore({ randomSeed: 0x5eed1234 });
  return catalogCore;
}

function read<T>(expr: string): T {
  return JSON.parse(catalogs().run(`JSON.stringify(${expr})`)) as T;
}

export const FOES = read<Record<string, Record<string, unknown>>>('FOES');
export const FOE_IDS = Object.keys(FOES);
export const WEAPONS = read<Array<Record<string, unknown> | null>>('WEAPONS');
export const DIFF = read<Array<Record<string, unknown>>>('DIFF');
export const HULLS = read<Array<Record<string, unknown>>>('HULLS');
export const BOSSES = read<Array<Record<string, any>>>('BOSSES');
export const BOONS = read<Array<Record<string, unknown>>>('BOONS');
export const STAGES = read<Array<Record<string, unknown>>>('STAGES');
export const TOUR_CUM = read<number[]>('TOUR_CUM');
export const TOUR_FINALE = read<number>('TOUR_FINALE');
export const MAX_WEAPON = WEAPONS.length - 1;

export const BOSS_DEFS = BOSSES.map((b) => ({
  id: b.id as string,
  hp: b.hp as number,
  r: b.r as number,
  hitR: b.hitR as number,
  sc: b.sc as number,
  nodes: (b.nodes ?? null) as { ox: number; oy: number; r: number; hp: number }[] | null,
}));

export const tourWorldsDone = (n: number): number => catalogs().run(`tourWorldsDone(${n})`);

const primitives = (() => {
  const core = catalogs();
  return {
    makeRng: core.run('makeRng') as (seed: number) => Rng,
    hashStr: core.run('hashStr') as (s: string) => number,
    multFor: core.run('multFor') as (c: number) => number,
  };
})();

export type Rng = (() => number) & {
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(items: T[]): T;
  chance(p: number): boolean;
  sign(): number;
  reseed(seed: number): void;
};

export const makeRng = (seed: number): Rng => primitives.makeRng(seed);
export const hashStr = (s: string): number => primitives.hashStr(s);
export const multFor = (c: number): number => primitives.multFor(c);

const STATE_KEYS = [
  'score', 'wave', 'kills', 'grazes', 'deaths', 'lives',
  'mult', 'maxMult', 'comboT', 'combo', 'shots', 'hits', 'state', 'runT',
] as const;

export type World = {
  seed: number;
  readonly player: any;
  readonly foes: any[];
  readonly playerBullets: any[];
  readonly foeBullets: any[];
  readonly boss: any;
  readonly shotsFired: number;
  readonly log: InputFrame[];
  readonly difficulty: number;
  grazeHeat: number;
  score: number;
  wave: number;
  kills: number;
  grazes: number;
  deaths: number;
  lives: number;
  mult: number;
  maxMult: number;
  comboT: number;
  combo: number;
  shots: number;
  hits: number;
  state: string;
  runT: number;
};

export function createWorld(opts: CreateOpts = {}): World {
  const seed = (opts.seed ?? 1) >>> 0;
  const hullId = opts.hullId ?? 'vesper';
  const difficulty = opts.difficulty ?? 2;
  const mode = opts.mode ?? 'endless';

  const core = loadShippedCore({ randomSeed: seed });
  core.run('resize();');
  core.run(`CFG.diff=${difficulty}; CFG.autofire=false; CFG.ghost=false; META.ship=${JSON.stringify(hullId)};`);
  core.run(`startRun(${JSON.stringify(mode)});`);
  /* the shipped run seeds itself from Math.random; make the test seed the
     author of the run instead, without touching the game's own code path */
  core.run(`R.reseed(${seed}); FX.reseed(${seed});`);

  if (opts.autoWave === false) {
    /* park the director so a test can put one foe on an empty screen */
    core.run(`DIRECTOR.phase='idle'; DIRECTOR.queue.length=0; DIRECTOR.restT=1e9; DIRECTOR.t=0; DIRECTOR.wave=0;
      GAME.wave=0; foes.length=0; pb.length=0; fb.length=0; picks.length=0; mines.length=0; boss=null;`);
  }

  /* count hostile projectiles as they are emitted: a bullet that has already
     left the arena is gone from fb, so a "did it shoot" assertion needs this */
  core.run(`window.__shotsFired = 0;
    (function(){ const emit = foeShot; foeShot = function(a,b,c,d){ window.__shotsFired++; return emit(a,b,c,d); }; })();`);

  const P = core.run('P');
  const GAME = core.run('GAME');
  const CFG = core.run('CFG');
  const foes = core.run('foes');
  const pb = core.run('pb');
  const fb = core.run('fb');

  const stepFn = core.run(`(function(dt, mx, my, fire){
    INPUT.mode='kb';
    INPUT.keys.KeyA = mx < -0.05; INPUT.keys.KeyD = mx > 0.05;
    INPUT.keys.KeyW = my < -0.05; INPUT.keys.KeyS = my > 0.05;
    INPUT.firing = !!fire;
    stepGame(dt);
  })`);
  const hashFn = core.run(`(function(){
    return [GAME.score, GAME.wave, GAME.kills, GAME.grazes, GAME.deaths, GAME.lives,
      GAME.mult, GAME.maxMult, P.x.toFixed(3), P.y.toFixed(3),
      foes.length, pb.length, fb.length].join('|');
  })`);
  const shotsFn = core.run('(function(){ return window.__shotsFired; })');
  const spawnFn = core.run('(function(t, o){ try { return spawnFoe(t, o); } catch (e) { return null; } })');
  const fireFn = core.run('(function(){ firePrimary(); })');
  const collideFn = core.run('(function(){ collide(); })');
  const waveFn = core.run('(function(n){ startWave(n); })');
  const bossFn = core.run('(function(i){ spawnBoss(i); return boss || foes.filter(function(f){ return f.boss; })[0] || null; })');

  const world: Record<string, unknown> = {
    seed,
    log: [] as InputFrame[],
    _core: core,
    _step: stepFn,
    _hash: hashFn,
    _spawn: spawnFn,
    _fire: fireFn,
    _collide: collideFn,
    _wave: waveFn,
    _boss: bossFn,
    _nextId: 0,
  };

  for (const key of STATE_KEYS) {
    Object.defineProperty(world, key, {
      enumerable: true,
      get: () => GAME[key],
      set: (v: unknown) => { GAME[key] = v; },
    });
  }
  /* graze heat is GAME.grazeHeat in the shipped core, created lazily on the
     first graze — hence the typeof guard rather than a direct read */
  Object.defineProperty(world, 'grazeHeat', {
    enumerable: true,
    get: () => (typeof GAME.grazeHeat === 'number' ? GAME.grazeHeat : 0),
    set: (v: number) => { GAME.grazeHeat = v; },
  });
  Object.defineProperty(world, 'difficulty', { enumerable: true, get: () => CFG.diff });
  Object.defineProperty(world, 'player', { enumerable: true, get: () => P });
  Object.defineProperty(world, 'foes', { enumerable: true, get: () => foes });
  Object.defineProperty(world, 'playerBullets', { enumerable: true, get: () => pb });
  Object.defineProperty(world, 'foeBullets', { enumerable: true, get: () => fb });
  Object.defineProperty(world, 'boss', { enumerable: true, get: () => core.run('boss') });
  Object.defineProperty(world, 'shotsFired', { enumerable: true, get: () => shotsFn() });

  return world as unknown as World;
}

export function step(world: World, dt: number, input: InputFrame): void {
  const w = world as unknown as { _step: (dt: number, mx: number, my: number, fire: boolean) => void; log: InputFrame[] };
  w._step(dt, input.mx ?? 0, input.my ?? 0, !!input.fire);
  w.log.push({ ...input });
}

/** scored-state digest: what two simulations must agree on, tick for tick */
export function endHash(world: World): string {
  return (world as unknown as { _hash: () => string })._hash();
}

/** test-driver helper: put graze heat on the player (the game sets it on graze) */
export function applyGraze(world: World, heat = 3): void {
  world.grazeHeat = heat;
  world.grazes += 1;
}

export function spawnFoe(world: World, type: string, opts: Record<string, unknown> = {}): any | null {
  const w = world as unknown as { _spawn: (t: string, o: unknown) => any; _nextId: number };
  const e = w._spawn(type, opts);
  if (!e) return null;
  w._nextId += 1;
  e.id = w._nextId;
  return e;
}

export function firePlayer(world: World): void {
  (world as unknown as { _fire: () => void })._fire();
}

export function collide(world: World): void {
  (world as unknown as { _collide: () => void })._collide();
}

/** start the world's current wave through the shipped director */
export function startWave(world: World): void {
  (world as unknown as { _wave: (n: number) => void })._wave(world.wave);
}

export function spawnBoss(world: World, index = 0): any | null {
  return (world as unknown as { _boss: (i: number) => any })._boss(index) ?? null;
}

export type { World as SimWorld } from './types.ts';
