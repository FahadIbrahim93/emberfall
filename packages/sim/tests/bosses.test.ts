import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.ts';
import { step, endHash } from '../src/step.ts';
import { spawnBoss, BOSS_DEFS } from '../src/bosses.ts';
import { startWave } from '../src/combat.ts';
import { STEP } from '../src/constants.ts';
import type { InputFrame } from '../src/types.ts';

const idle: InputFrame = { mx: 0, my: 0, fire: false, dash: false, pulse: false };

describe('BOSS_DEFS', () => {
  it('has 5 capitals matching live roster (incl. the rare Wardenfall)', () => {
    expect(BOSS_DEFS).toHaveLength(5);
    expect(BOSS_DEFS.map((b) => b.id)).toEqual([
      'dreadnought', 'matriarch', 'tyrant', 'gatewarden', 'wardenfall',
    ]);
  });

  it('wardenfall outstats the warden — the rare Sunday fight must be harder', () => {
    const fall = BOSS_DEFS.find((b) => b.id === 'wardenfall');
    const warden = BOSS_DEFS.find((b) => b.id === 'gatewarden');
    expect(fall.hp).toBeGreaterThan(warden.hp);
    expect(fall.sc).toBeGreaterThan(warden.sc);
  });
});

describe('spawnBoss', () => {
  it('places dreadnought in enter state', () => {
    const w = createWorld({ seed: 50, autoWave: false });
    const b = spawnBoss(w, 0);
    expect(b.bossId).toBe('dreadnought');
    expect(b.hp).toBeGreaterThan(100);
    expect(b.state).toBe('enter');
    expect(w.foes).toHaveLength(1);
  });
});

describe('boss combat', () => {
  it('fires orbs after enter completes', () => {
    const w = createWorld({ seed: 51, autoWave: false });
    spawnBoss(w, 0);
    for (let i = 0; i < Math.ceil(4 / STEP); i++) step(w, STEP, idle);
    expect(w.foeBullets.length).toBeGreaterThan(0);
  });

  it('wave 5 auto-spawns a boss via startWave', () => {
    const w = createWorld({ seed: 52, autoWave: false });
    w.wave = 5;
    startWave(w);
    expect(w.foes.some((e) => e.type === '@boss')).toBe(true);
  });
});

describe('T-DET boss replay', () => {
  it('same seed through boss wave is stable', () => {
    const run = (seed: number) => {
      const w = createWorld({ seed, autoWave: false });
      w.wave = 5;
      startWave(w);
      for (let i = 0; i < 720; i++) {
        step(w, STEP, {
          mx: Math.sin(i * 0.03) * 0.5,
          my: 0.1,
          fire: i % 5 === 0,
          dash: false,
          pulse: false,
        });
      }
      return endHash(w);
    };
    expect(run(777)).toEqual(run(777));
  });
});
