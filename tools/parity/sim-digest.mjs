/* parity/sim-digest.mjs — the shared scenario through packages/sim.
 *
 * packages/sim is a facade over the shipped inline core, so this digest is not
 * a second opinion: it must equal the shipped digest exactly. The cross-sim
 * baseline records both sides, and they are the same value. If they ever
 * differ, parity has broken and packages/sim is no longer running the game.
 *
 * `node tools/parity/sim-digest.mjs` prints it; `--write` re-records BOTH sides
 * into cross-sim-baseline.json after checking they agree. */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TICKS, STEP, DIFFICULTY, SEED, inputAt } from '../../packages/sim/host/scenario.mjs';
import { runShipped } from './digest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CROSS_BASELINE = path.join(HERE, 'cross-sim-baseline.json');

export async function runSim() {
  const sim = await import('../../packages/sim/src/index.ts');
  const world = sim.createWorld({ seed: SEED, difficulty: DIFFICULTY, autoWave: true });
  for (let i = 0; i < TICKS; i++) {
    const k = inputAt(i);
    sim.step(world, STEP, { mx: k.mx, my: k.my, fire: k.fire });
  }
  const p = world.player;
  return {
    /* field order mirrors the shipped tuple so a failure reads as a diff */
    digest: [
      world.score | 0, world.wave, world.kills, world.grazes, world.deaths, world.lives,
      world.mult, world.maxMult, p.x.toFixed(3), p.y.toFixed(3),
      world.foes.length, world.playerBullets.length, world.foeBullets.length,
    ].join('|'),
    hash: sim.endHash(world),
    state: world.state,
    scenario: { ticks: TICKS, step: STEP, difficulty: DIFFICULTY, seed: SEED, mode: 'endless' },
  };
}

/* vite-node puts its own binary in argv[1], so the "am I the entry point"
   check has to accept the --write flag too */
if (process.argv.includes('--write') || (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)))) {
  const sim = await runSim();
  const shipped = runShipped();
  const agree = sim.digest === shipped.digest && sim.hash === shipped.digest;

  if (process.argv.includes('--write')) {
    if (!agree) {
      console.error('parity: REFUSING to record — the two paths disagree');
      console.error('  shipped:', shipped.digest);
      console.error('  sim    :', sim.digest);
      process.exit(1);
    }
    fs.writeFileSync(CROSS_BASELINE, JSON.stringify({
      note: 'Equal by construction: tools/parity/sim-digest.mjs runs packages/sim, which is a facade over the shipped inline core. Recorded deliberately when the seam closed (v2 format).',
      recorded: new Date().toISOString().slice(0, 10),
      shipped: { digest: shipped.digest, chain: shipped.chain, state: shipped.state },
      sim: { digest: sim.digest, hash: sim.hash, state: sim.state },
    }, null, 2) + '\n');
    console.log(`parity: cross-sim baseline written — both paths ${sim.digest}`);
  } else {
    console.log(JSON.stringify({ agree, shipped, sim }, null, 2));
    console.log(agree ? 'parity: the two paths agree' : 'parity: DISAGREEMENT');
  }
  process.exit(agree || process.argv.includes('--write') ? 0 : 1);
}
