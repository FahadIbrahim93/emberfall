/**
 * Minimal pure step — scoring clocks, arena clamp, movement.
 * Combat extract continues in follow-up PRs; this establishes the
 * deterministic surface T-DET will expand against.
 */
import { ARENA_W, ARENA_H, GRAZE_HEAT_DECAY } from './constants.ts';
import { clamp, multFor } from './math.ts';
import type { World, InputFrame } from './types.ts';

const BASE_SPEED = 320;

export function step(world: World, dt: number, input: InputFrame): void {
  if (world.state !== 'playing') return;

  world.runT += dt;
  world.log.push({ ...input });

  const p = world.player;
  if (!p.alive) {
    tickClocks(world, dt);
    return;
  }

  let mx = input.mx;
  let my = input.my;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  const spd = BASE_SPEED * p.speed * p.thrust;
  p.vx = mx * spd;
  p.vy = my * spd;
  p.x = clamp(p.x + p.vx * dt, p.r, ARENA_W - p.r);
  p.y = clamp(p.y + p.vy * dt, p.r, ARENA_H - p.r);

  if (p.inv > 0) p.inv = Math.max(0, p.inv - dt);
  if (p.dashT > 0) p.dashT = Math.max(0, p.dashT - dt);
  if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.fireCd > 0) p.fireCd = Math.max(0, p.fireCd - dt);

  tickClocks(world, dt);
}

function tickClocks(world: World, dt: number): void {
  if (world.comboT > 0) {
    world.comboT -= dt;
    if (world.comboT <= 0 && world.combo > 0) {
      world.combo = 0;
      world.mult = 1;
    }
  }
  // P0-3: grazeHeat decays outside the combo block
  if (world.grazeHeat > 0) {
    world.grazeHeat = Math.max(0, world.grazeHeat - GRAZE_HEAT_DECAY * dt);
  }
  if (world.endT > 0) {
    world.endT = Math.max(0, world.endT - dt);
    if (world.endT <= 0) world.state = 'ended';
  }
}

/** Apply a graze event — pure scoring path used by tests. */
export function applyGraze(world: World, base = 10): void {
  world.grazes += 1;
  world.grazeHeat = 3;
  world.combo += 1;
  world.comboT = 2.5;
  world.mult = multFor(world.combo);
  if (world.mult > world.maxMult) world.maxMult = world.mult;
  const p = world.player;
  const gain = Math.round(base * world.mult * p.scoreMul * p.grazeMul);
  world.score += gain;
}

/** Snapshot hashable end-state for T-DET. */
export function endHash(world: World): string {
  return [
    world.score | 0,
    world.wave,
    world.kills,
    world.grazes,
    world.deaths,
    world.lives,
    world.mult,
    world.maxMult,
    world.player.x.toFixed(3),
    world.player.y.toFixed(3),
  ].join('|');
}
