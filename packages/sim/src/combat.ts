/**
 * Pure combat: spawn, fire, update entities, collide.
 * Side-effect free (no audio, particles, DOM).
 */
import { ARENA_W, ARENA_H } from './constants.ts';
import { FOES, DIFF, WEAPONS, MAX_WEAPON, OVER_RATE, OVER_DMG, BOLT_SPEED } from './catalog.ts';
import { clamp, lerp, multFor, TAU, PI } from './math.ts';
import { makeRng, type Rng } from './rng.ts';
import type { World, Foe, Bullet, InputFrame } from './types.ts';
import { updateBoss, killBoss, spawnBoss, bindBossRng } from './bosses.ts';

export const SHIP_SCALE = 1.3;
export const SHOT_SCALE = 1.18;
/* NOTE: the old flat PLAYER_FIRE_CD = 0.14 was fabricated — the live game
   has no such constant. Fire interval comes from the per-tier WEAPONS
   table (parity-tested against index.html in tests/golden.test.ts). */

function diff(world: World) {
  return DIFF[clamp(world.difficulty, 0, DIFF.length - 1)];
}

let _rng: Rng = makeRng(1);

function rng(_world: World): Rng {
  return _rng;
}

export function bindRng(seed: number): void {
  _rng = makeRng(seed >>> 0);
  bindBossRng(seed);
}

export function spawnFoe(
  world: World,
  type: string,
  opts: { x?: number; y?: number; tx?: number; ty?: number; elite?: boolean } = {},
): Foe | null {
  const S = FOES[type];
  if (!S) return null;
  const d = diff(world);
  const R = rng(world);
  const scale = 1 + (world.wave - 1) * 0.075;
  let hp = Math.max(1, Math.round(S.hp * scale * d.hp));
  let sc = S.sc;
  let r = S.r * SHIP_SCALE;
  let hitR = S.hit * SHIP_SCALE;
  const elite = !!opts.elite;
  if (elite) {
    hp = Math.round(hp * 2.1);
    sc = Math.round(sc * 2.4);
    r *= 1.18;
    hitR *= 1.18;
  }
  const sx = opts.x ?? R.range(40, ARENA_W - 40);
  const sy = opts.y ?? -40;
  const tx = opts.tx ?? sx;
  const ty = opts.ty ?? R.range(80, 200);
  const e: Foe = {
    id: world.nextId++,
    type,
    x: sx,
    y: sy,
    vx: 0,
    vy: 0,
    hp,
    maxHp: hp,
    r,
    hitR,
    sc,
    state: 'enter',
    t: 0,
    et: 0,
    ht: 0,
    ph: R.range(0, TAU),
    sx,
    sy,
    tx,
    ty,
    swa: 26,
    swf: 1.5,
    guns: !!S.guns,
    cd: (S.cd || 2) * d.fireRate * (elite ? 0.78 : 1),
    fireT: R.range(0.8, 2.1),
    bspd: clamp(250 + world.wave * 6, 250, 420) * d.bulletSpd,
    armored: !!S.armored,
    dead: false,
    elite,
  };
  world.foes.push(e);
  return e;
}

export function firePlayer(world: World): void {
  const p = world.player;
  if (!p.alive || p.fireCd > 0 || p.beam) return;
  const w = WEAPONS[clamp(p.weapon, 1, MAX_WEAPON)];
  if (!w) return;
  const over = p.overT > 0;
  /* live model (index.html firePrimary): per-tier lane table, per-tier rate
     and dmg mult, overdrive ×0.68 rate / ×1.15 dmg, bolt speed 1020 */
  const dmg = w.dmg * p.dmg * (over ? OVER_DMG : 1);
  for (const [dx, ang] of w.lanes) {
    world.playerBullets.push({
      x: p.x + dx * 0.9,
      y: p.y - p.r,
      vx: Math.sin(ang) * BOLT_SPEED,
      vy: -Math.cos(ang) * BOLT_SPEED,
      r: 4 * SHOT_SCALE,
      life: 2,
      dmg,
      kind: 'bolt',
      friendly: true,
    });
    world.shots++;
  }
  p.fireCd = w.rate * (over ? OVER_RATE : 1) * p.rateMul;
}

function foeShot(world: World, e: Foe, ang: number, spd: number): void {
  world.foeBullets.push({
    x: e.x + Math.cos(ang) * e.r * 0.6,
    y: e.y + Math.sin(ang) * e.r * 0.6,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    r: 4.5 * SHOT_SCALE,
    life: 9,
    grazed: false,
    kind: 'orb',
    ang,
    friendly: false,
  });
}

function aimAt(e: Foe, world: World): number {
  return Math.atan2(world.player.y - e.y, world.player.x - e.x);
}

function gunControl(world: World, e: Foe, dt: number): void {
  if (!e.guns) return;
  e.fireT -= dt;
  if (e.fireT > 0) return;
  e.fireT = e.cd;
  foeShot(world, e, aimAt(e, world), e.bspd);
}

function updateFoe(world: World, e: Foe, dt: number): void {
  if (e.dead) return;
  e.t += dt;
  switch (e.state) {
    case 'enter': {
      e.et += dt;
      const k = Math.min(1, e.et / 1.15);
      const s = 1 - Math.pow(1 - k, 3);
      e.x = lerp(e.sx, e.tx, s);
      e.y = lerp(e.sy, e.ty, s);
      if (k >= 1) {
        e.state = 'hold';
        e.ht = 0;
      }
      break;
    }
    case 'hold': {
      e.ht += dt;
      e.x = e.tx + Math.sin(e.ht * e.swf + e.ph) * e.swa;
      e.y = e.ty + Math.sin(e.ht * 1.35 + e.ph) * 9;
      gunControl(world, e, dt);
      if (e.ht > 8) {
        e.state = 'dive';
        const ang = aimAt(e, world);
        e.vx = Math.cos(ang) * 220;
        e.vy = Math.sin(ang) * 220;
      }
      break;
    }
    case 'dive': {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.y > ARENA_H + 80 || e.x < -80 || e.x > ARENA_W + 80) e.dead = true;
      break;
    }
  }
}

function killFoe(world: World, e: Foe): void {
  if (e.dead) return;
  if (e.type === '@boss') {
    killBoss(world, e);
    return;
  }
  e.dead = true;
  e.state = 'dead';
  world.kills++;
  world.combo++;
  world.comboT = 3.2;
  world.mult = multFor(world.combo);
  if (world.mult > world.maxMult) world.maxMult = world.mult;
  const d = diff(world);
  world.score += Math.round(e.sc * world.mult * world.player.scoreMul * d.score);
}

function damageFoe(world: World, e: Foe, dmg: number): void {
  if (e.dead) return;
  e.hp -= dmg;
  if (e.hp <= 0) killFoe(world, e);
}

function hurtPlayer(world: World): void {
  const p = world.player;
  if (p.inv > 0 || !p.alive || world.state !== 'playing') return;
  if (p.shield > 0) {
    p.shield--;
    p.inv = 1.1;
    return;
  }
  world.lives--;
  world.deaths++;
  p.weapon = Math.max(1, p.weapon - 1);
  p.alive = false;
  if (world.lives <= 0) {
    world.endT = 1.7;
  } else {
    p.alive = true;
    p.inv = 2.0;
    p.x = ARENA_W * 0.5;
    p.y = ARENA_H * 0.82;
  }
}

export function collide(world: World): void {
  const p = world.player;
  for (let i = world.playerBullets.length - 1; i >= 0; i--) {
    const b = world.playerBullets[i];
    let hit = false;
    for (const e of world.foes) {
      if (e.dead) continue;
      const dx = b.x - e.x;
      const dy = b.y - e.y;
      const rr = e.hitR + b.r;
      if (dx * dx + dy * dy < rr * rr) {
        world.hits++;
        damageFoe(world, e, b.dmg ?? 12);
        hit = true;
        break;
      }
    }
    if (hit) world.playerBullets.splice(i, 1);
  }

  if (!p.alive) return;
  const grazeR = 30 + (world.hullId === 'wraith' ? 14 : 0);

  for (let i = world.foeBullets.length - 1; i >= 0; i--) {
    const b = world.foeBullets[i];
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d2 = dx * dx + dy * dy;
    const hitR = b.r + p.r;
    if (p.inv <= 0 && d2 < hitR * hitR) {
      world.foeBullets.splice(i, 1);
      hurtPlayer(world);
      continue;
    }
    if (!b.grazed && d2 < grazeR * grazeR) {
      b.grazed = true;
      world.grazes++;
      world.grazeHeat = 3;
      world.comboT = Math.max(world.comboT, 1.4);
      world.score += Math.round(12 * p.grazeMul * world.mult * p.scoreMul);
    }
  }

  if (p.inv <= 0) {
    for (const e of world.foes) {
      if (e.dead) continue;
      const rr = e.hitR + p.r * 1.6;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy < rr * rr) {
        damageFoe(world, e, 6 * p.dmg);
        hurtPlayer(world);
        break;
      }
    }
  }
}

function updateBullets(world: World, dt: number): void {
  for (let i = world.playerBullets.length - 1; i >= 0; i--) {
    const b = world.playerBullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || b.y < -40 || b.x < -40 || b.x > ARENA_W + 40) {
      world.playerBullets.splice(i, 1);
    }
  }
  for (let i = world.foeBullets.length - 1; i >= 0; i--) {
    const b = world.foeBullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || b.y > ARENA_H + 80 || b.x < -80 || b.x > ARENA_W + 80) {
      world.foeBullets.splice(i, 1);
    }
  }
}

export function updateDirector(world: World, dt: number): void {
  if (world.mode === 'school') return;
  if (world.dirPhase === 'rest') {
    world.dirRestT -= dt;
    if (world.dirRestT <= 0) {
      world.wave++;
      startWave(world);
    }
    return;
  }
  world.dirT += dt;
  while (world.spawnQueue.length && world.spawnQueue[0].t <= world.dirT) {
    const s = world.spawnQueue.shift()!;
    spawnFoe(world, s.type, { x: s.x, y: -40, tx: s.x, ty: s.y });
  }
  const live = world.foes.some((e) => !e.dead);
  if (!world.spawnQueue.length && !live && world.player.alive) {
    world.dirPhase = 'rest';
    world.dirRestT = 1.5;
    world.score += 260 * Math.max(1, world.wave);
  }
}

export function startWave(world: World): void {
  world.dirPhase = 'combat';
  world.dirT = 0;
  world.spawnQueue = [];
  if (world.wave > 0 && world.wave % 5 === 0) {
    spawnBoss(world, Math.floor(world.wave / 5 - 1));
    return;
  }
  const R = rng(world);
  const n = 3 + Math.min(8, world.wave);
  const types = ['drone', 'mini', 'striker', 'weaver'] as const;
  for (let i = 0; i < n; i++) {
    const type = types[Math.min(types.length - 1, Math.floor(i / 2) % types.length)];
    world.spawnQueue.push({
      t: 0.3 + i * 0.45,
      type: world.wave >= 3 && i === n - 1 ? 'cruiser' : type,
      x: R.range(50, ARENA_W - 50),
      y: R.range(90, 180),
    });
  }
}

export function updateCombat(world: World, dt: number, input: InputFrame): void {
  const p = world.player;
  if (input.fire) firePlayer(world);
  updateDirector(world, dt);
  for (const e of world.foes) {
    if (e.type === '@boss') updateBoss(world, e, dt);
    else updateFoe(world, e, dt);
  }
  world.foes = world.foes.filter((e) => !e.dead);
  updateBullets(world, dt);
  collide(world);
  if (p.fireCd > 0) p.fireCd = Math.max(0, p.fireCd - dt);
  if (p.overT > 0) p.overT = Math.max(0, p.overT - dt);
}
