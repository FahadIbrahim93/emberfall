import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.ts';
import { step, endHash } from '../src/step.ts';
import { spawnFoe, firePlayer } from '../src/combat.ts';
import { STEP } from '../src/constants.ts';
import type { InputFrame } from '../src/types.ts';

const fire: InputFrame = { mx: 0, my: 0, fire: true, dash: false, pulse: false };
const idle: InputFrame = { mx: 0, my: 0, fire: false, dash: false, pulse: false };

describe('spawnFoe', () => {
  it('creates a drone with scaled hp', () => {
    const w = createWorld({ seed: 11, autoWave: false });
    w.wave = 1;
    const e = spawnFoe(w, 'drone', { x: 200, y: -40, tx: 200, ty: 120 });
    expect(e).not.toBeNull();
    expect(e!.type).toBe('drone');
    expect(e!.hp).toBeGreaterThan(0);
    expect(w.foes).toHaveLength(1);
  });

  it('rejects unknown type', () => {
    const w = createWorld({ seed: 11, autoWave: false });
    expect(spawnFoe(w, 'not-a-foe')).toBeNull();
  });
});

describe('combat loop', () => {
  it('player fire creates bullets', () => {
    const w = createWorld({ seed: 22, autoWave: false });
    w.player.inv = 0;
    firePlayer(w);
    expect(w.playerBullets.length).toBeGreaterThan(0);
    expect(w.shots).toBeGreaterThan(0);
  });

  it('bullets damage and kill a drone', () => {
    const w = createWorld({ seed: 33, autoWave: false });
    w.player.inv = 0;
    w.player.x = 270;
    w.player.y = 800;
    const e = spawnFoe(w, 'drone', { x: 270, y: 700, tx: 270, ty: 700 })!;
    e.state = 'hold';
    e.et = 2;
    e.hp = e.maxHp = 2;
    for (let i = 0; i < 180; i++) {
      step(w, STEP, fire);
      if (w.kills > 0) break;
    }
    expect(w.kills).toBeGreaterThanOrEqual(1);
    expect(w.score).toBeGreaterThan(0);
  });

  it('wave director eventually spawns foes', () => {
    const w = createWorld({ seed: 44 });
    expect(w.wave).toBe(1);
    for (let i = 0; i < Math.ceil(3 / STEP); i++) step(w, STEP, idle);
    expect(w.foes.length + w.kills).toBeGreaterThan(0);
  });
});

describe('T-DET combat replay', () => {
  it('same seed + input script → identical endHash', () => {
    const script = (i: number): InputFrame => ({
      mx: Math.sin(i * 0.05) * 0.6,
      my: -0.2,
      fire: i % 4 === 0,
      dash: false,
      pulse: false,
    });
    const run = (seed: number) => {
      const w = createWorld({ seed, hullId: 'vesper', difficulty: 2 });
      for (let i = 0; i < 600; i++) step(w, STEP, script(i));
      return {
        hash: endHash(w),
        score: w.score,
        kills: w.kills,
        shots: w.shots,
        wave: w.wave,
      };
    };
    const a = run(99991);
    const b = run(99991);
    expect(a).toEqual(b);
  });

  it('different seeds diverge after combat', () => {
    const script = (i: number): InputFrame => ({
      mx: 0, my: 0, fire: true, dash: false, pulse: false,
    });
    const run = (seed: number) => {
      const w = createWorld({ seed });
      for (let i = 0; i < 480; i++) step(w, STEP, script(i));
      return endHash(w);
    };
    expect(run(1)).not.toEqual(run(2));
  });
});
