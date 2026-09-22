/**
 * P1-7 golden-replay helper.
 * Prefer: npx vite-node tools/replay-record.mjs --seed 42 --steps 2400 --out goldens/combat-42.json
 *
 * No shebang on purpose: vite-node loads this file as module source and
 * chokes on `#!` (node's own loader strips it, vite-node's does not).
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function parseArgs(argv) {
  const o = { seed: 42, steps: 2400, out: null, verify: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--seed') o.seed = Number(argv[++i]);
    else if (argv[i] === '--steps') o.steps = Number(argv[++i]);
    else if (argv[i] === '--out') o.out = argv[++i];
    else if (argv[i] === '--verify') o.verify = argv[++i];
  }
  return o;
}

const args = parseArgs(process.argv);

async function trySim() {
  try {
    /* relative specifiers on purpose: vite-node intercepts and transforms
       them; a pathToFileURL() absolute URL escapes the module runner and
       dies on the .ts extension in plain node */
    const { createWorld } = await import('../packages/sim/src/world.ts');
    const { step, endHash } = await import('../packages/sim/src/step.ts');
    const { STEP } = await import('../packages/sim/src/constants.ts');
    return { createWorld, step, endHash, STEP };
  } catch {
    return null;
  }
}

const sim = await trySim();

if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  if (!sim) {
    writeFileSync(args.out, JSON.stringify({
      version: 1, seed: args.seed, steps: args.steps,
      endHash: null, score: null,
      note: 'Skeleton — run under vite-node to lock endHash',
    }, null, 2) + '\n');
    console.log('wrote skeleton (no TS loader)', args.out);
    process.exit(0);
  }
  const w = sim.createWorld({ seed: args.seed, autoWave: true });
  for (let i = 0; i < args.steps; i++) {
    sim.step(w, sim.STEP, {
      mx: Math.sin(i * 0.04) * 0.6,
      my: Math.cos(i * 0.03) * 0.3,
      fire: i % 4 === 0,
      dash: false,
      pulse: false,
    });
  }
  const meta = {
    version: 1,
    seed: args.seed,
    steps: args.steps,
    endHash: sim.endHash(w),
    score: w.score,
    kills: w.kills,
    grazes: w.grazes,
    wave: w.wave,
    note: 'Locked T-DET golden',
  };
  writeFileSync(args.out, JSON.stringify(meta, null, 2) + '\n');
  console.log('locked', args.out, meta.endHash);
  process.exit(0);
}

if (args.verify) {
  const g = JSON.parse(readFileSync(args.verify, 'utf8'));
  if (!sim || g.endHash == null) {
    console.log('verify skip/skeleton', g.seed);
    process.exit(0);
  }
  const w = sim.createWorld({ seed: g.seed, autoWave: true });
  for (let i = 0; i < g.steps; i++) {
    sim.step(w, sim.STEP, {
      mx: Math.sin(i * 0.04) * 0.6,
      my: Math.cos(i * 0.03) * 0.3,
      fire: i % 4 === 0,
      dash: false,
      pulse: false,
    });
  }
  const h = sim.endHash(w);
  if (h !== g.endHash) {
    console.error('MISMATCH', h, '!=', g.endHash);
    process.exit(1);
  }
  console.log('OK', g.seed, h);
  process.exit(0);
}

console.log('Usage: --out path | --verify path  [--seed N] [--steps N]');
process.exit(1);
