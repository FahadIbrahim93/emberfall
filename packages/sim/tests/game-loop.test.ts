import { describe, it, expect } from 'vitest';
import { STEP, createGameLoopState, stepGame, type GameLoopState } from '../src/game-loop';

describe('game-loop constants', () => {
  it('STEP is 1/120', () => {
    expect(STEP).toBeCloseTo(1 / 120, 10);
  });
});

describe('createGameLoopState', () => {
  it('returns zeroed state with a real lastFrame', () => {
    const s = createGameLoopState();
    expect(s.accumulator).toBe(0);
    expect(s.slowFrames).toBe(0);
    expect(s.qualityCheckAt).toBe(0);
    expect(s.capLast).toBe(0);
    expect(s.SIM_STEPS).toBe(0);
    expect(typeof s.lastFrame).toBe('number');
    expect(s.lastFrame).toBeGreaterThan(0);
  });
});

describe('stepGame contract', () => {
  // stepGame is a thin orchestration layer over the real sim; we test that
  // the orchestration calls the right pieces rather than reimplementing
  // the whole game.

  it('decays comboT and resets combo when comboT reaches zero', () => {
    const gameRunT = { value: 0 };
    const gameState = { state: 'playing' };
    const P = { alive: true };
    const GHOST = { tickRecord: () => {}, rival: null, rivalFrame: 0, rivalBeat: false };
    const TELE = { tick: () => {} };
    const getMove = () => ({});
    const updatePlayer = () => {};
    const updateDirector = () => {};
    const updateWorld = () => {};
    const collide = () => {};
    const updateThreat = () => {};
    const DDA = { update: () => {} };
    const SCHOOL = { tick: () => {} };
    const RANGE = { tick: () => {} };
    const GAME: any = {
      comboT: 0.1,
      combo: 5,
      mult: 2,
      grazeHeat: 0,
      lives: 3,
      endT: 0,
      state: 'playing',
      rivalBeat: false,
    };
    let endRunCalled = false;
    const endRun = () => { endRunCalled = true; };

    // dt smaller than comboT: nothing resets
    stepGame(
      0.01, gameRunT, gameState, P, GHOST, TELE, getMove,
      updatePlayer, updateDirector, updateWorld, collide, updateThreat,
      DDA, SCHOOL, RANGE,
      GAME, endRun,
    );
    expect(GAME.comboT).toBeCloseTo(0.1 - 0.01, 6);
    expect(GAME.combo).toBe(5);

    // dt that brings comboT to zero (use a value large enough to overcome
    // floating-point noise from the first subtraction)
    stepGame(
      0.1, gameRunT, gameState, P, GHOST, TELE, getMove,
      updatePlayer, updateDirector, updateWorld, collide, updateThreat,
      DDA, SCHOOL, RANGE,
      GAME, endRun,
    );
    expect(GAME.combo).toBe(0);
    expect(GAME.mult).toBe(1);
    expect(endRunCalled).toBe(false);
  });

  it('decays grazeHeat independently of combo', () => {
    const gameRunT = { value: 0 };
    const gameState = { state: 'playing' };
    const P = { alive: true };
    const GHOST = { tickRecord: () => {}, rival: null, rivalFrame: 0, rivalBeat: false };
    const TELE = { tick: () => {} };
    const getMove = () => ({});
    const updatePlayer = () => {};
    const updateDirector = () => {};
    const updateWorld = () => {};
    const collide = () => {};
    const updateThreat = () => {};
    const DDA = { update: () => {} };
    const SCHOOL = { tick: () => {} };
    const RANGE = { tick: () => {} };
    const GAME: any = {
      comboT: 0,
      combo: 0,
      mult: 1,
      grazeHeat: 3,
      lives: 3,
      endT: 0,
      state: 'playing',
      rivalBeat: false,
    };
    const endRun = () => {};

    stepGame(
      1, gameRunT, gameState, P, GHOST, TELE, getMove,
      updatePlayer, updateDirector, updateWorld, collide, updateThreat,
      DDA, SCHOOL, RANGE,
      GAME, endRun,
    );
    expect(GAME.grazeHeat).toBe(2);
  });

  it('ends the run when endT reaches zero', () => {
    const gameRunT = { value: 0 };
    const gameState = { state: 'playing' };
    const P = { alive: true };
    const GHOST = { tickRecord: () => {}, rival: null, rivalFrame: 0, rivalBeat: false };
    const TELE = { tick: () => {} };
    const getMove = () => ({});
    const updatePlayer = () => {};
    const updateDirector = () => {};
    const updateWorld = () => {};
    const collide = () => {};
    const updateThreat = () => {};
    const DDA = { update: () => {} };
    const SCHOOL = { tick: () => {} };
    const RANGE = { tick: () => {} };
    const GAME: any = {
      comboT: 0,
      combo: 0,
      mult: 1,
      grazeHeat: 0,
      lives: 3,
      endT: 0.2,
      state: 'playing',
      rivalBeat: false,
    };
    let endRunCalled = false;
    const endRun = () => { endRunCalled = true; };

    stepGame(
      0.1, gameRunT, gameState, P, GHOST, TELE, getMove,
      updatePlayer, updateDirector, updateWorld, collide, updateThreat,
      DDA, SCHOOL, RANGE,
      GAME, endRun,
    );
    expect(GAME.endT).toBeCloseTo(0.1, 6);
    expect(endRunCalled).toBe(false);

    stepGame(
      0.1, gameRunT, gameState, P, GHOST, TELE, getMove,
      updatePlayer, updateDirector, updateWorld, collide, updateThreat,
      DDA, SCHOOL, RANGE,
      GAME, endRun,
    );
    expect(GAME.endT).toBe(0);
    expect(endRunCalled).toBe(true);
  });
});
