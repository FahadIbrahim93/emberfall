/**
 * Boss tests, reconciled to the shipped game.
 *
 * The old versions asserted a `bossId` field, `hp` on the boss body and
 * `state: 'enter'`. None of that exists: the shipped boss is a foe with
 * `boss: true`, `state: 'boss'`, and its health on its weak-point nodes. The
 * assertions below are the shipped shape, measured, not the copy's idea of it.
 */
import { describe, it, expect } from 'vitest';
import { createWorld, step, endHash, spawnBoss, startWave, BOSS_DEFS, STEP } from '../src/index.ts';
import type { InputFrame } from '../src/index.ts';

const idle: InputFrame = { mx: 0, my: 0, fire: false };

describe('BOSS_DEFS', () => {
  it('has 5 capitals matching live roster (incl. the rare Wardenfall)', () => {
    expect(BOSS_DEFS).toHaveLength(5);
    expect(BOSS_DEFS.map((b) => b.id)).toEqual([
      'dreadnought', 'matriarch', 'tyrant', 'gatewarden', 'wardenfall',
    ]);
  });

  it('wardenfall outstats the warden — the rare Sunday fight must be harder', () => {
    const fall = BOSS_DEFS.find((b) => b.id === 'wardenfall')!;
    const warden = BOSS_DEFS.find((b) => b.id === 'gatewarden')!;
    expect(fall.hp).toBeGreaterThan(warden.hp);
    expect(fall.sc).toBeGreaterThan(warden.sc);
  });
});

describe('spawnBoss', () => {
  it('places dreadnought on screen as a boss-state foe with weak-point nodes', () => {
    const w = createWorld({ seed: 50, autoWave: false });
    const b = spawnBoss(w, 0);
    expect(b).not.toBeNull();
    expect(b.boss).toBe(true);
    expect(b.state).toBe('boss');
    expect(Array.isArray(b.nodes) ? b.nodes.length : 0).toBeGreaterThan(0);
    expect(w.foes.filter((e) => e.boss)).toHaveLength(1);
    expect(w.boss).toBe(b);
  });
});

describe('boss combat', () => {
  it('fires orbs once it is engaged', () => {
    const w = createWorld({ seed: 51, autoWave: false });
    w.player.inv = 1e9;
    spawnBoss(w, 0);
    for (let i = 0; i < Math.ceil(6 / STEP); i++) step(w, STEP, idle);
    expect(w.shotsFired).toBeGreaterThan(0);
  });

  it('wave 5 queues a boss through startWave and puts it on screen', () => {
    const w = createWorld({ seed: 52, autoWave: false });
    w.player.inv = 1e9;
    w.wave = 5;
    startWave(w);
    for (let i = 0; i < Math.ceil(12 / STEP) && !w.foes.some((e) => e.boss); i++) step(w, STEP, idle);
    expect(w.foes.some((e) => e.boss)).toBe(true);
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
        });
      }
      return endHash(w);
    };
    expect(run(777)).toEqual(run(777));
  });
});
