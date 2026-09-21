/**
 * Pure boss combat — simplified patterns, fixed arena, seeded RNG only.
 * Full telegraph/beam fidelity stays in index.html until renderer reads sim.
 */
import { ARENA_W, ARENA_H } from './constants.ts';
import { DIFF } from './catalog.ts';
import { clamp, multFor, TAU, PI } from './math.ts';
import type { World, Foe } from './types.ts';
import { makeRng, type Rng } from './rng.ts';
import { SHIP_SCALE, SHOT_SCALE } from './combat.ts';

export type BossNode = { ox: number; oy: number; r: number; hp: number; maxHp: number };

export type Boss = Foe & {
  boss: true;
  bossId: string;
  name: string;
  phase: number;
  cycle: number;
  spin: number;
  nodes: BossNode[] | null;
  attackCd: number;
  ty: number;
};

export type BossDefPure = {
  id: string;
  name: string;
  hp: number;
  r: number;
  hitR: number;
  sc: number;
  nodes: { ox: number; oy: number; r: number; hp: number }[] | null;
};

export const BOSS_DEFS: readonly BossDefPure[] = [
  {
    id: 'dreadnought', name: 'Dreadnought',
    hp: 165, r: 56, hitR: 52, sc: 3000,
    nodes: [
      { ox: -64, oy: 4, r: 15, hp: 70 },
      { ox: 64, oy: 4, r: 15, hp: 70 },
    ],
  },
  {
    id: 'matriarch', name: 'Hive Matriarch',
    hp: 210, r: 74, hitR: 46, sc: 4200,
    nodes: null,
  },
  {
    id: 'tyrant', name: 'Solar Tyrant',
    hp: 260, r: 104, hitR: 42, sc: 5600,
    nodes: null,
  },
  {
    id: 'gatewarden', name: 'Gate Warden',
    hp: 340, r: 80, hitR: 50, sc: 7600,
    nodes: null,
  },
];

let _bossRng: Rng = makeRng(1);

export function bindBossRng(seed: number): void {
  _bossRng = makeRng((seed >>> 0) ^ 0xb055);
}

function dOf(world: World) {
  return DIFF[clamp(world.difficulty, 0, DIFF.length - 1)];
}

function pushOrb(world: World, x: number, y: number, ang: number, spd: number, r = 4.5): void {
  world.foeBullets.push({
    x: x + Math.cos(ang) * 20,
    y: y + Math.sin(ang) * 20,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    r: r * SHOT_SCALE,
    life: 8,
    grazed: false,
    kind: 'orb',
    ang,
    friendly: false,
  });
}

function fanFrom(world: World, x: number, y: number, base: number, count: number, spread: number, spd: number): void {
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? base : base + (i / (count - 1) - 0.5) * spread;
    pushOrb(world, x, y, a, spd);
  }
}

function ringFrom(world: World, x: number, y: number, count: number, offset: number, spd: number): void {
  for (let i = 0; i < count; i++) {
    pushOrb(world, x, y, offset + (i / count) * TAU, spd);
  }
}

function aimPlayer(world: World, x: number, y: number): number {
  return Math.atan2(world.player.y - y, world.player.x - x);
}

export function spawnBoss(world: World, index: number): Boss {
  const def = BOSS_DEFS[index % BOSS_DEFS.length];
  const d = dOf(world);
  const hp = Math.round(def.hp * d.hp);
  const b: Boss = {
    id: world.nextId++,
    type: '@boss',
    boss: true,
    bossId: def.id,
    name: def.name,
    x: ARENA_W / 2,
    y: -80,
    vx: 0,
    vy: 0,
    hp,
    maxHp: hp,
    r: def.r * SHIP_SCALE * 0.85,
    hitR: def.hitR * SHIP_SCALE * 0.85,
    sc: def.sc,
    state: 'enter',
    t: 0,
    et: 0,
    ht: 0,
    ph: 0,
    sx: ARENA_W / 2,
    sy: -80,
    tx: ARENA_W / 2,
    ty: 150,
    swa: 0,
    swf: 0,
    guns: true,
    cd: 1.5,
    fireT: 1.2,
    bspd: 280 * d.bulletSpd,
    armored: true,
    dead: false,
    elite: false,
    phase: 1,
    cycle: 0,
    spin: 0,
    nodes: def.nodes ? def.nodes.map((n) => ({ ...n, maxHp: n.hp })) : null,
    attackCd: 1.5,
  };
  world.foes.push(b);
  world.bossIndex = index;
  return b;
}

function isBoss(e: Foe): e is Boss {
  return (e as Boss).boss === true;
}

function phaseFor(b: Boss): number {
  const ratio = b.hp / b.maxHp;
  if (ratio <= 0.33) return 3;
  if (ratio <= 0.66) return 2;
  return 1;
}

function attackBoss(world: World, b: Boss): number {
  b.cycle++;
  const ph = b.phase;
  const spd = b.bspd;
  const id = b.bossId;

  if (id === 'dreadnought') {
    if (b.cycle % 4 === 0) {
      const n = ph >= 3 ? 24 : ph === 2 ? 20 : 15;
      ringFrom(world, b.x, b.y, n, b.spin, (ph >= 2 ? 285 : 250) * (spd / 280));
      b.spin = (b.spin + 0.42) % TAU;
      return ph >= 2 ? 1.55 : 2.0;
    }
    const n = ph >= 3 ? 9 : ph === 2 ? 7 : 5;
    fanFrom(world, b.x, b.y, aimPlayer(world, b.x, b.y), n, 0.68, (ph >= 2 ? 320 : 290) * (spd / 280));
    return ph >= 2 ? 1.2 : 1.65;
  }

  if (id === 'matriarch') {
    const mod = b.cycle % 3;
    if (mod === 0) {
      const n = ph >= 3 ? 30 : 24;
      const gap = _bossRng.int(0, n - 1);
      const gapW = ph >= 3 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        if (Math.abs(i - gap) < gapW) continue;
        pushOrb(world, b.x, b.y, (i / n) * TAU + b.spin, 215 * (spd / 280), 5);
      }
      b.spin += 0.3;
      return ph >= 2 ? 1.7 : 2.1;
    }
    if (mod === 1) {
      const n = ph >= 3 ? 5 : 3;
      const base = aimPlayer(world, b.x, b.y);
      for (let i = 0; i < n; i++) {
        pushOrb(world, b.x, b.y, base + (i - (n - 1) / 2) * 0.4, 165 * (spd / 280), 6);
      }
      return 1.9;
    }
    fanFrom(world, b.x, b.y, aimPlayer(world, b.x, b.y), 7, 0.9, 250 * (spd / 280));
    return 2.5;
  }

  if (id === 'tyrant') {
    const mod = b.cycle % 4;
    if (mod === 0) {
      for (let i = 0; i < 4; i++) {
        fanFrom(world, b.x, b.y, b.spin + (i / 4) * TAU, 3, 0.25, spd);
      }
      return 2.8;
    }
    if (mod === 2) {
      const rows = ph >= 3 ? 9 : 7;
      for (let i = 0; i < rows; i++) {
        const y = ARENA_H * 0.18 + i * ((ARENA_H * 0.55) / rows);
        pushOrb(world, 0, y, 0, 200 * (spd / 280));
        pushOrb(world, ARENA_W, y, PI, 200 * (spd / 280));
      }
      return 2.2;
    }
    ringFrom(world, b.x, b.y, ph >= 2 ? 16 : 12, b.spin, spd);
    b.spin += 0.2;
    return 1.8;
  }

  if (b.cycle % 2 === 0) {
    ringFrom(world, b.x, b.y, ph >= 2 ? 18 : 12, b.spin, spd * 0.95);
    b.spin += 0.35;
    return 2.0;
  }
  fanFrom(world, b.x, b.y, aimPlayer(world, b.x, b.y), ph >= 3 ? 11 : 7, 0.8, spd);
  return 1.6;
}

export function updateBoss(world: World, e: Foe, dt: number): void {
  if (!isBoss(e) || e.dead) return;
  const b = e;
  b.t += dt;
  const newPh = phaseFor(b);
  if (newPh > b.phase) b.phase = newPh;

  if (b.state === 'enter') {
    b.et += dt;
    const k = Math.min(1, b.et / 1.6);
    const s = 1 - Math.pow(1 - k, 3);
    b.y = -80 + (b.ty + 80) * s;
    b.x = ARENA_W / 2;
    if (k >= 1) b.state = 'hold';
    return;
  }

  if (b.bossId === 'dreadnought') {
    b.x = ARENA_W / 2 + Math.sin(b.t * 0.95) * (ARENA_W * 0.5 - 150) * 0.62;
    b.y = b.ty + Math.sin(b.t * 1.8) * 13;
  } else if (b.bossId === 'matriarch') {
    b.x = ARENA_W / 2 + Math.sin(b.t * 0.62) * (ARENA_W * 0.5 - 130) * 0.55;
    b.y = b.ty + Math.cos(b.t * 0.9) * 30;
  } else if (b.bossId === 'tyrant') {
    b.spin += dt * (b.phase >= 2 ? 0.85 : 0.5);
    b.x = ARENA_W / 2 + Math.sin(b.t * 0.5) * (ARENA_W * 0.5 - 150) * 0.5;
    b.y = b.ty + Math.sin(b.t * 1.1) * 20;
  } else {
    b.x = ARENA_W / 2 + Math.sin(b.t * 0.4) * 80;
    b.y = b.ty + Math.sin(b.t * 0.7) * 18;
  }

  b.attackCd -= dt;
  if (b.attackCd <= 0) {
    b.attackCd = attackBoss(world, b);
  }
}

export function killBoss(world: World, e: Foe): void {
  if (!isBoss(e) || e.dead) return;
  e.dead = true;
  e.state = 'dead';
  world.kills++;
  world.bossesKilled = (world.bossesKilled || 0) + 1;
  world.combo++;
  world.comboT = 3.2;
  world.mult = multFor(world.combo);
  if (world.mult > world.maxMult) world.maxMult = world.mult;
  const d = dOf(world);
  world.score += Math.round(e.sc * world.mult * world.player.scoreMul * d.score);
  world.dirPhase = 'rest';
  world.dirRestT = 3.0;
}
