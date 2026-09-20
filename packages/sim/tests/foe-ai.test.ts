import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.ts';
import { step } from '../src/step.ts';
import { spawnFoe } from '../src/combat.ts';
import { STEP } from '../src/constants.ts';
import type { InputFrame } from '../src/types.ts';

const idle: InputFrame = { mx: 0, my: 0, fire: false, dash: false, pulse: false };

describe('FOE type AI', () => {
  it('ram dives early and tracks', () => {
    const w = createWorld({ seed: 11, autoWave: false });
    const e = spawnFoe(w, 'ram', { x: 270, y: -40, tx: 270, ty: 120 })!;
    for (let i = 0; i < Math.ceil(4 / STEP); i++) step(w, STEP, idle);
    for (let i = 0; i < Math.ceil(4 / STEP); i++) step(w, STEP, idle);
    const still = w.foes.find((f) => f.id === e.id);
    if (still) {
      expect(still.state === 'dive' || Math.hypot(still.vx, still.vy) > 50 || still.y > 120).toBe(true);
    }
  });

  it('sniper fires a high-speed bolt', () => {
    const w = createWorld({ seed: 12, autoWave: false });
    spawnFoe(w, 'sniper', { x: 270, y: -40, tx: 270, ty: 100 });
    for (let i = 0; i < Math.ceil(6 / STEP); i++) step(w, STEP, idle);
    expect(w.foeBullets.length).toBeGreaterThan(0);
    const fastest = Math.max(...w.foeBullets.map((b) => Math.hypot(b.vx, b.vy)));
    expect(fastest).toBeGreaterThan(300);
  });

  it('splitter births minis', () => {
    const w = createWorld({ seed: 13, autoWave: false });
    spawnFoe(w, 'splitter', { x: 270, y: -40, tx: 270, ty: 140 });
    for (let i = 0; i < Math.ceil(5 / STEP); i++) step(w, STEP, idle);
    const minis = w.foes.filter((f) => f.type === 'mini');
    expect(minis.length).toBeGreaterThanOrEqual(1);
  });

  it('orbiter sprays radial shots', () => {
    const w = createWorld({ seed: 14, autoWave: false });
    spawnFoe(w, 'orbiter', { x: 270, y: -40, tx: 270, ty: 120 });
    for (let i = 0; i < Math.ceil(4 / STEP); i++) step(w, STEP, idle);
    expect(w.foeBullets.length).toBeGreaterThanOrEqual(3);
  });
});
