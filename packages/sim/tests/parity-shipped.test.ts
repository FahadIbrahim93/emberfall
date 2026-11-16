/**
 * Parity: the game and the tests run ONE simulation.
 *
 * packages/sim is a facade over the shipped inline core, so this is not a
 * comparison of two implementations — it is proof that the facade does not
 * alter the simulation. Two independent paths run the same golden:
 *
 *   1. the facade: createWorld / step / endHash, per tick;
 *   2. raw shipped bytes: loadShippedCore + a single scripted stepGame loop,
 *      with no facade code in the path at all.
 *
 * They must produce the same per-tick FNV chain and the same final digest for
 * every golden, exactly. There is no ratchet: if the chain differs, at least
 * one of the two is not running the shipped game.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { loadShippedCore } from '../host/env.mjs';
import { GOLDEN_SEEDS, GOLDEN_TICKS, goldenInput } from '../host/goldens.mjs';
import {
  createWorld, step, endHash, FOES, DIFF, WEAPONS, makeRng, hashStr, multFor,
  STEP, SHIP_SCALE, SHOT_SCALE,
} from '../src/index.ts';
import { runShipped, shippedPrimitives } from '../../../tools/parity/digest.mjs';
import { runSim } from '../../../tools/parity/sim-digest.mjs';

const here = fileURLToPath(import.meta.url);
const root = join(here, '..', '..', '..', '..');
const cross = JSON.parse(readFileSync(join(root, 'tools', 'parity', 'cross-sim-baseline.json'), 'utf8'));

const TUPLE = `[GAME.score, GAME.wave, GAME.kills, GAME.grazes, GAME.deaths, GAME.lives,
  GAME.mult, GAME.maxMult, P.x.toFixed(3), P.y.toFixed(3),
  foes.length, pb.length, fb.length].join('|')`;

const fnv = (h: number, s: string): number => {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const hex = (h: number): string => ('00000000' + (h >>> 0).toString(16)).slice(-8);

/** path 1 — through packages/sim */
function viaFacade(seed: number) {
  const w = createWorld({ seed });
  let h = 2166136261 >>> 0;
  const ticks: string[] = [];
  for (let i = 0; i < GOLDEN_TICKS; i++) {
    step(w, STEP, goldenInput(i));
    h = fnv(h, endHash(w));
    ticks.push(hex(h));
  }
  return { chain: hex(h), end: endHash(w), ticks };
}

/** the first tick two chains disagree on, or -1 */
function firstDivergence(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

/** path 2 — the shipped bytes, driven by hand, no facade involvement */
function viaShippedBytes(seed: number) {
  const core = loadShippedCore({ randomSeed: seed });
  core.run('resize();');
  core.run(`INPUT.mode='kb'; CFG.diff=2; CFG.autofire=false; startRun('endless'); R.reseed(${seed}); FX.reseed(${seed});`);
  const inputs = Array.from({ length: GOLDEN_TICKS }, (_, i) => goldenInput(i));
  const out = core.run(`(() => {
    const inputs = ${JSON.stringify(inputs)};
    let h = 2166136261 >>> 0;
    const mix = s => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
    const ticks = [];
    for (let i = 0; i < ${GOLDEN_TICKS}; i++) {
      const k = inputs[i];
      INPUT.keys.KeyA = k.mx < -0.05; INPUT.keys.KeyD = k.mx > 0.05;
      INPUT.keys.KeyW = k.my < -0.05; INPUT.keys.KeyS = k.my > 0.05;
      INPUT.firing = k.fire;
      stepGame(${STEP});
      mix(${TUPLE});
      ticks.push(('00000000' + (h >>> 0).toString(16)).slice(-8));
    }
    return JSON.stringify({
      chain: ('00000000' + (h >>> 0).toString(16)).slice(-8),
      end: ${TUPLE},
      ticks,
    });
  })()`);
  return JSON.parse(out) as { chain: string; end: string; ticks: string[] };
}

function golden(seed: number) {
  return JSON.parse(readFileSync(join(root, 'goldens', `combat-${seed}.json`), 'utf8'));
}

describe('parity: goldens run through the shipped stepGame, tick for tick', () => {
  for (const seed of GOLDEN_SEEDS) {
    it(`golden ${seed}: facade and raw shipped bytes produce identical per-tick digests`, () => {
      const facade = viaFacade(seed);
      const shipped = viaShippedBytes(seed);
      const at = firstDivergence(facade.ticks, shipped.ticks);
      expect(at, at >= 0 ? `facade and stepGame diverged at tick ${at} (seed ${seed})` : `tick-chain length differs (seed ${seed})`).toBe(-1);
      expect(facade.end, `final digest diverged (seed ${seed})`).toBe(shipped.end);
    });

    it(`golden ${seed}: the committed chain and endHash are the shipped ones`, () => {
      const g = golden(seed);
      const facade = viaFacade(seed);
      const shipped = viaShippedBytes(seed);
      const at = firstDivergence(facade.ticks, String(g.tickChain || '').split(' '));
      expect(at, at >= 0 ? `shipped gameplay drifted from the golden at tick ${at} (seed ${seed})` : `golden tick-chain length differs (seed ${seed})`).toBe(-1);
      expect(facade.chain).toBe(g.chain);
      expect(facade.end).toBe(g.endHash);
      expect(shipped.end).toBe(g.endHash);
    });
  }
});

describe('parity: primitives exposed by the facade are the running shipped values', () => {
  const live = shippedPrimitives();

  it('the RNG stream is identical for 200 draws', () => {
    const rng = makeRng(0xC0FFEE);
    for (let i = 0; i < live.draws.length; i++) {
      expect(rng(), `draw ${i}`).toBe(live.draws[i]);
    }
  });

  it('RNG helpers (range, pick, chance) ride the same stream', () => {
    expect(makeRng(42).range(3, 9)).toBe(live.range);
    expect(makeRng(42).pick(['a', 'b', 'c', 'd'])).toBe(live.pick);
    expect(makeRng(9).chance(0.25)).toBe(live.chance);
  });

  it('hashStr is the shipped FNV-1a', () => {
    expect(hashStr('emberfall-parity')).toBe(live.hash);
  });

  it('STEP is the shipped fixed step', () => {
    expect(STEP).toBe(live.step);
    expect(STEP).toBe(1 / 120);
  });

  it('combo bands match the shipped multFor', () => {
    for (const [combo, mult] of Object.entries(live.combos as Record<string, number>)) {
      expect(multFor(Number(combo)), `combo ${combo}`).toBe(mult);
    }
  });

  it('every FOES row matches (hp, r, hit, sc, guns, cd, armored)', () => {
    expect(Object.keys(FOES).sort()).toEqual(Object.keys(live.foes).sort());
    for (const [id, L] of Object.entries(live.foes as Record<string, Record<string, unknown>>)) {
      const S = FOES[id] as unknown as Record<string, unknown>;
      for (const key of ['hp', 'r', 'hit', 'sc']) expect(S[key], `${id}.${key}`).toBe(L[key]);
      expect(!!S.guns, `${id}.guns`).toBe(!!L.guns);
      expect(!!S.armored, `${id}.armored`).toBe(!!L.armored);
      if (L.cd !== null) expect(S.cd, `${id}.cd`).toBe(L.cd);
    }
  });

  it('the WEAPONS ladder matches (lanes, rate, dmg)', () => {
    expect(WEAPONS.length).toBe(live.weapons.length);
    live.weapons.forEach((L: { rate: number; dmg: number; lanes: number[][] } | null, i: number) => {
      if (!L) return;
      expect(WEAPONS[i]!.lanes, `W${i} lanes`).toEqual(L.lanes);
      expect(WEAPONS[i]!.rate, `W${i} rate`).toBe(L.rate);
      expect(WEAPONS[i]!.dmg, `W${i} dmg`).toBe(L.dmg);
    });
  });

  it('the DIFF tiers match the shipped table', () => {
    expect(DIFF.length).toBe(live.diff.length);
    live.diff.forEach((L: Record<string, number | string>, i: number) => {
      const D = DIFF[i]!;
      expect(D.name, `tier ${i} name`).toBe(L.name);
      for (const key of ['bulletSpd', 'fireRate', 'hp', 'spawn', 'score', 'grace'] as const) {
        expect(D[key], `tier ${i}.${key}`).toBe(L[key]);
      }
    });
  });

  it('render scale constants match', () => {
    expect(SHIP_SCALE).toBe(live.shipScale);
    expect(SHOT_SCALE).toBe(live.shotScale);
  });
});

describe('parity: the shared scenario has ONE digest', () => {
  it('the shipped digest and the cross-sim digest are the same recorded value', () => {
    expect(cross.sim.digest).toBe(cross.shipped.digest);
    expect(cross.sim.hash).toBe(cross.shipped.digest);
  });

  it('both paths still produce that value now', async () => {
    const shipped = runShipped();
    const sim = await runSim();
    expect(shipped.digest).toBe(cross.shipped.digest);
    expect(shipped.chain).toBe(cross.shipped.chain);
    expect(sim.digest).toBe(shipped.digest);
    expect(sim.hash).toBe(shipped.digest);
  });
});
