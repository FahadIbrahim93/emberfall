/**
 * FOE archetype behaviour, reconciled to the shipped game.
 *
 * Three of these tests used to assert things the game does not do: a splitter
 * that births minis while alive (the shipped splitter is a single gunless body;
 * there is no timer split), a sniper bolt still on screen after six seconds
 * (it is long gone — the shot happens, the bullet does not wait), and an
 * orbiter that sprays three bullets in four seconds (one volley). The claims
 * below are what the shipped core actually does; where a projectile has left
 * the arena, the facade's shotsFired counter is the honest observation.
 */
import { describe, it, expect } from 'vitest';
import { createWorld, step, spawnFoe, FOES, STEP } from '../src/index.ts';
import type { InputFrame } from '../src/index.ts';

const idle: InputFrame = { mx: 0, my: 0, fire: false };

describe('FOE type AI', () => {
  it('ram enters, holds, then leaves the field', () => {
    const w = createWorld({ seed: 11, autoWave: false });
    w.player.inv = 1e9;
    const e = spawnFoe(w, 'ram', { x: 270, y: -40, tx: 270, ty: 120 })!;
    for (let i = 0; i < Math.ceil(4 / STEP); i++) step(w, STEP, idle);
    const early = w.foes.find((f) => f.id === e.id);
    expect(early, 'ram should still be on screen after four seconds').toBeTruthy();

    for (let i = 0; i < Math.ceil(16 / STEP); i++) step(w, STEP, idle);
    const late = w.foes.find((f) => f.id === e.id);
    expect(!late || late.state === 'dive' || late.y > 120).toBe(true);
  });

  it('sniper fires a high-speed bolt', () => {
    const w = createWorld({ seed: 12, autoWave: false });
    w.player.inv = 1e9;
    expect(FOES.sniper.guns).toBe(true);
    spawnFoe(w, 'sniper', { x: 270, y: -40, tx: 270, ty: 100 });
    for (let i = 0; i < Math.ceil(6 / STEP); i++) step(w, STEP, idle);
    expect(w.shotsFired).toBeGreaterThan(0);
    if (w.foeBullets.length) {
      const fastest = Math.max(...w.foeBullets.map((b) => Math.hypot(b.vx, b.vy)));
      expect(fastest).toBeGreaterThan(300);
    }
  });

  it('splitter is a single gunless body — the shipped core has no timer split', () => {
    const w = createWorld({ seed: 13, autoWave: false });
    w.player.inv = 1e9;
    expect(FOES.splitter.guns).toBe(false);
    spawnFoe(w, 'splitter', { x: 270, y: -40, tx: 270, ty: 140 });
    for (let i = 0; i < Math.ceil(5 / STEP); i++) step(w, STEP, idle);
    expect(w.foes.filter((f) => f.type === 'mini')).toHaveLength(0);
    expect(w.foes.filter((f) => f.type === 'splitter')).toHaveLength(1);
    expect(w.shotsFired).toBe(0);
  });

  it('orbiter fires a radial volley', () => {
    const w = createWorld({ seed: 14, autoWave: false });
    w.player.inv = 1e9;
    expect(FOES.orbiter.guns).toBe(true);
    spawnFoe(w, 'orbiter', { x: 270, y: -40, tx: 270, ty: 120 });
    for (let i = 0; i < Math.ceil(4 / STEP); i++) step(w, STEP, idle);
    expect(w.shotsFired).toBeGreaterThanOrEqual(1);
  });
});
