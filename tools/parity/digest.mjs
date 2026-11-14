/* parity/digest.mjs — deterministic digests of the SHIPPED simulation.

   Runs the real inline core (packages/sim/host/env.mjs) with the shared scenario
   (packages/sim/host/scenario.mjs):
   900 fixed 120 Hz ticks, Pilot difficulty, a scripted keyboard path and a
   fixed Math.random so the run is reproducible. Produces:

     - `digest` : scored state after the last tick
     - `chain`  : FNV-1a over every tick's tuple — divergence fails at the tick
                  it happens, not only at the end
     - `state`  : GAME.state at the end (a run that ends early is a red flag)

   `node tools/parity/digest.mjs` prints it; `--write` records the baseline
   tools/parity.test.mjs gates on. Re-baseline deliberately, in the same commit
   as the gameplay change — that is the whole contract. */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShippedCore } from '../../packages/sim/host/env.mjs';
import { TICKS, STEP, DIFFICULTY, SEED, inputTable } from '../../packages/sim/host/scenario.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE = path.join(HERE, 'shipped-baseline.json');

/* the scored state tuple — only fields the simulation owns */
const TUPLE = `[
  GAME.score, GAME.wave, GAME.kills, GAME.grazes, GAME.deaths, GAME.lives,
  GAME.mult, GAME.maxMult, P.x.toFixed(3), P.y.toFixed(3),
  foes.length, pb.length, fb.length
].join('|')`;

export function runShipped() {
  const core = loadShippedCore({ randomSeed: SEED });
  core.run('resize();');
  /* The scenario contract: autofire OFF (the input table drives the trigger)
     and R/FX reseeded so the recorded seed, not Math.random, authors the run.
     packages/sim's facade does exactly this, which is what makes the two
     digests comparable instead of merely both recorded. */
  core.run(`INPUT.mode='kb'; CFG.diff=${DIFFICULTY}; CFG.autofire=false; INPUT.firing=true; startRun('endless'); R.reseed(${SEED}); FX.reseed(${SEED});`);

  const out = core.run(`(() => {
    const inputs = ${JSON.stringify(inputTable())};
    let h = 2166136261 >>> 0;
    const mix = s => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
    let first = '';
    /* the running hash after every tick: a divergence can be named by tick
       number instead of only by "the chain changed" */
    const tickChain = [];
    for (let i = 0; i < ${TICKS}; i++) {
      const k = inputs[i];
      INPUT.keys.KeyA = k.KeyA;
      INPUT.keys.KeyW = k.KeyW;
      INPUT.firing = k.fire;
      stepGame(${STEP});
      const t = ${TUPLE};
      if (i === 0) first = t;
      mix(t);
      tickChain.push(('00000000' + (h >>> 0).toString(16)).slice(-8));
    }
    return JSON.stringify({
      chain: ('00000000' + (h >>> 0).toString(16)).slice(-8),
      tickChain: tickChain.join(' '),
      digest: ${TUPLE},
      tick0: first,
      state: GAME.state,
    });
  })()`);

  const parsed = JSON.parse(out);
  return {
    ...parsed,
    scenario: { ticks: TICKS, step: STEP, difficulty: DIFFICULTY, seed: SEED, mode: 'endless' },
  };
}

/* the shipped core's copies of every primitive packages/sim re-declares.
   Read from the running code, not from a regex over the source. */
export function shippedPrimitives() {
  const core = loadShippedCore({ randomSeed: SEED });
  return JSON.parse(core.run(`JSON.stringify((() => {
    const rng = makeRng(0xC0FFEE);
    const draws = [];
    for (let i = 0; i < 200; i++) draws.push(rng());
    const combos = {};
    for (const c of [0, 4, 5, 12, 13, 23, 24, 39, 40, 99]) combos[c] = multFor(c);
    return {
      draws,
      range: makeRng(42).range(3, 9),
      pick: makeRng(42).pick(['a', 'b', 'c', 'd']),
      chance: makeRng(9).chance(0.25),
      hash: hashStr('emberfall-parity'),
      step: STEP,
      combos,
      foes: Object.fromEntries(Object.entries(FOES).map(([k, v]) => [k, {
        hp: v.hp, r: v.r, hit: v.hit, sc: v.sc, guns: !!v.guns,
        cd: v.cd === undefined ? null : v.cd, armored: !!v.armored,
      }])),
      weapons: WEAPONS.map(w => w ? { rate: w.rate, dmg: w.dmg, lanes: w.lanes } : null),
      diff: DIFF.map(d => ({
        name: d.name, bulletSpd: d.bulletSpd, fireRate: d.fireRate,
        hp: d.hp, spawn: d.spawn, score: d.score, grace: d.grace,
      })),
      shipScale: SHIP_SCALE,
      shotScale: SHOT_SCALE,
    };
  })())`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = runShipped();
  if (process.argv.includes('--write')) {
    result.note = 'Scenario contract since the seam closed: autofire OFF (input table drives the trigger) and R/FX reseeded to the scenario seed, so packages/sim\'s facade and this raw path are comparable. That is why the chain moved 007c6be8 -> ba9ab8b8 on 2026-11-14.';
    fs.writeFileSync(BASELINE, JSON.stringify(result, null, 2) + '\n');
    console.log(`parity: shipped baseline written (${result.scenario.ticks} ticks, chain ${result.chain})`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  /* note() schedules a 6.6 s element removal in the shipped core; the result is
     already printed and nothing here waits on it. */
  process.exit(0);
}
