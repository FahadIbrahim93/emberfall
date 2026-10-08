/**
 * Game loop — fixed-step simulation, variable-rate presentation.
 *
 * Owns:
 * - the main loop state: STEP, accumulator, lastFrame, fpsEMA, slowFrames,
 *   qualityCheckAt, capLast, SIM_STEPS
 * - stepGame: one fixed-step simulation tick
 * - frame: one display frame — polls input, runs the accumulator loop,
 *   updates effects, calls render, syncs HUD, and auto-quality-checks
 *
 * Does NOT own:
 * - the render function (that stays with the render layer)
 * - the player/entity world arrays (those are owned by the world/entities layer)
 * - input, audio, or network bootstrapping
 *
 * Contract:
 * - `render` and `syncHUD` are supplied by the host.
 * - `stepGame` may read/write GAME, P, GHOST, TELE, foes, fb, pb, parts, beams,
 *   mines, and the other global sim state — that state is intentionally shared
 *   with the rest of the game and is not privatized here.
 */

export const STEP = 1 / 120;

export interface GameLoopState {
  accumulator: number;
  lastFrame: number;
  slowFrames: number;
  qualityCheckAt: number;
  capLast: number;
  SIM_STEPS: number;
}

/**
 * One fixed-step simulation tick. Mutates global sim state directly.
 */
export function stepGame(
  dt: number,
  gameRunT: { value: number },
  gameState: { state: string },
  P: { alive: boolean },
  GHOST: { tickRecord: () => void; rival: unknown; rivalFrame: number; rivalBeat: boolean },
  TELE: { tick: () => void },
  getMove: () => unknown,
  updatePlayer: (dt: number, move: unknown) => void,
  updateDirector: (dt: number) => void,
  updateWorld: (dt: number) => void,
  collide: () => void,
  updateThreat: (dt: number) => void,
  DDA: { update: (dt: number) => void },
  SCHOOL: { tick: (dt: number) => void },
  RANGE: { tick: (dt: number) => void },
  GAME: {
    comboT: number;
    combo: number;
    mult: number;
    grazeHeat: number;
    lives: number;
    endT: number;
    state: string;
    rivals?: unknown;
  },
  endRun: () => void,
): void {
  gameRunT.value += dt;

  if (gameState.state === 'playing' && P.alive) GHOST.tickRecord();

  TELE.tick();

  /* duel race: the rival flies 60 positions per sim-second, regardless of
     display rate; outlast the whole recording to beat it */
  if (GHOST.rival && gameState.state === 'playing') {
    GHOST.rivalFrame = Math.floor(gameRunT.value * 60);
    if (GHOST.rivalFrame >= (GHOST.rival as { frames: unknown[] }).frames.length &&
      !GAME.rivalBeat && P.alive) {
      GAME.rivalBeat = true;
      const rv = (typeof DB !== 'undefined' && DB.get) ? DB.get('ghost.rival', null) : null;
      if (rv != null) {
        // note() is host-provided; we do not call it here directly to avoid
        // pulling in the whole UI surface into this module.
      }
    }
  }

  const move = getMove();
  updatePlayer(dt, move);
  updateDirector(dt);
  updateWorld(dt);
  collide();
  updateThreat(dt);
  DDA.update(dt);
  SCHOOL.tick(dt);
  RANGE.tick(dt);

  if (GAME.comboT > 0) {
    GAME.comboT -= dt;
    if (GAME.comboT <= 0 && GAME.combo > 0) { GAME.combo = 0; GAME.mult = 1; }
  }

  /* grazeHeat decays on its own clock, NOT inside the combo window */
  if (GAME.grazeHeat > 0) GAME.grazeHeat = Math.max(0, GAME.grazeHeat - dt);

  if (gameState.state === 'playing' && (GAME.lives <= 0 || GAME.endT > 0)) {
    GAME.endT = Math.max(0, GAME.endT - dt);
    if (GAME.endT <= 0) endRun();
  }
}

/**
 * One display frame. Calls the host's render + syncHUD.
 */
export function frame(
  now: number,
  state: GameLoopState,
  real: number,
  rawDt: number,
  fpsEMA: { value: number },
  PROF: {
    on: boolean;
    ring: number[];
    head: number;
    filled: number;
    simMs: number;
    steps: number;
    clamped: boolean;
  },
  pollGamepad: () => void,
  resolveFiring: () => void,
  GAME: {
    slowT: number;
    slowV: number;
    state: string;
    paused: boolean;
    quality: number;
  },
  damp: (a: number, b: number, rate: number, dt: number) => number,
  warpRef: { value: number },
  updateBackdrop: (real: number) => void,
  updateCam: (real: number) => void,
  P: { overT: number; dashT: number },
  stepGameFn: (dt: number) => void,
  updateEffects: (scaledReal: number) => void,
  render: () => void,
  syncHUD: (real: number) => void,
  applyQuality: () => void,
  autoLevel: { value: number },
): GameLoopState {
  // battery cap: hold the target frame rate by skipping whole frames
  if (GAME.quality > 0 && now - state.capLast < (1000 / GAME.quality) - 1.2) {
    return state;
  }
  state.capLast = now;  const dtRaw = Math.min(250, now - state.lastFrame);
  const dtSec = Math.min(0.05, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  fpsEMA.value = fpsEMA.value * 0.92 + (1 / Math.max(0.0005, dtSec)) * 0.08;

  if (PROF.on) {
    PROF.ring[PROF.head] = rawDt;
    PROF.head = (PROF.head + 1) % PROF.ring.length;
    PROF.filled = Math.min(PROF.filled + 1, PROF.ring.length);
  }

  pollGamepad();
  resolveFiring();

  let scale = 1;
  if (GAME.slowT > 0) { GAME.slowT -= dtSec; scale = GAME.slowV; }
  warpRef.value = damp(warpRef.value, (GAME.state === 'playing' && (P.overT > 0 || P.dashT > 0)) ? 1 : 0, 6, dtSec);

  if (!GAME.paused) {
    updateBackdrop(dtSec);
    updateCam(dtSec);

    if (GAME.state === 'playing') {
      if (GAME.hitstop > 0) {
        GAME.hitstop -= dtSec;
      } else {
        state.accumulator += dtSec * scale;
        let steps = 0;
        const simT0 = PROF.on ? performance.now() : 0;
        while (state.accumulator >= STEP && steps < 5) {
          stepGameFn(STEP);
          state.SIM_STEPS++;
          state.accumulator -= STEP;
          steps++;
        }
        if (steps >= 5) state.accumulator = 0;
        if (PROF.on) {
          PROF.simMs = performance.now() - simT0;
          PROF.steps = steps;
          PROF.clamped = steps >= 5;
        }
      }
      updateEffects(dtSec * scale);
    } else {
      updateEffects(dtSec);
      state.accumulator = 0;
    }
    GAME.t += dtSec;
  }

  render();
  if (GAME.state === 'playing') syncHUD(real);

  // auto quality: three seconds of sustained low frame rate steps it down
  if (GAME.quality === 3) {
    if (fpsEMA.value < 46) state.slowFrames++; else state.slowFrames = Math.max(0, state.slowFrames - 2);
    if (now > state.qualityCheckAt && state.slowFrames > 150 && autoLevel.value > 0) {
      autoLevel.value--;
      state.slowFrames = 0;
      state.qualityCheckAt = now + 6000;
      applyQuality();
    }
  }

  return state;
}

/**
 * Create initial loop state.
 */
export function createGameLoopState(): GameLoopState {
  return {
    accumulator: 0,
    lastFrame: performance.now(),
    slowFrames: 0,
    qualityCheckAt: 0,
    capLast: 0,
    SIM_STEPS: 0,
  };
}
