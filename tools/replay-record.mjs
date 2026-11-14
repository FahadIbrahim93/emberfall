/**
 * P1-7 golden-replay helper.
 * Prefer: npx vite-node tools/replay-record.mjs --seed 42 --steps 2400 --out goldens/combat-42.json
 *
 * The goldens are recorded through packages/sim, which is now a facade over the
 * shipped inline core: a golden is the shipped simulation's own digest.
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
    const sim = await import('../packages/sim/src/index.ts');
    const { goldenInput } = await import('../packages/sim/host/goldens.mjs');
    return { sim, goldenInput };
  } catch (e) {
    console.error(e);
    return null;
  }
}

/* the running per-tick digest chain is part of the golden: comparing it names
   the tick a change first bites instead of only saying "the end differs" */
function play(sim, goldenInput, seed, steps) {
  const w = sim.createWorld({ seed, autoWave: true });
  let h = 2166136261 >>> 0;
  const tickChain = [];
  for (let i = 0; i < steps; i++) {
    sim.step(w, sim.STEP, goldenInput(i));
    const t = sim.endHash(w);
    for (let k = 0; k < t.length; k++) { h ^= t.charCodeAt(k); h = Math.imul(h, 16777619); }
    tickChain.push(('00000000' + (h >>> 0).toString(16)).slice(-8));
  }
  return { w, chain: ('00000000' + (h >>> 0).toString(16)).slice(-8), tickChain };
}

const loaded = await trySim();

if (args.out) {
  if (!loaded) process.exit(1);
  mkdirSync(dirname(args.out), { recursive: true });
  const { w, chain, tickChain } = play(loaded.sim, loaded.goldenInput, args.seed, args.steps);
  const meta = {
    version: 3,
    seed: args.seed,
    steps: args.steps,
    endHash: loaded.sim.endHash(w),
    chain,
    tickChain: tickChain.join(' '),
    score: w.score,
    kills: w.kills,
    grazes: w.grazes,
    wave: w.wave,
    note: 'Locked against the shipped core (packages/sim is a facade over index.html)',
  };
  writeFileSync(args.out, JSON.stringify(meta, null, 2) + '\n');
  console.log('locked', args.out, meta.endHash);
  process.exit(0);
}

if (args.verify) {
  if (!loaded) process.exit(1);
  const g = JSON.parse(readFileSync(args.verify, 'utf8'));
  const { w, chain, tickChain } = play(loaded.sim, loaded.goldenInput, g.seed, g.steps);
  const h = loaded.sim.endHash(w);
  const bad = (g.tickChain || []).findIndex((v, i) => v !== tickChain[i]);
  if (h !== g.endHash || chain !== g.chain || (g.tickChain && bad !== -1)) {
    console.error('MISMATCH', h, '!=', g.endHash, bad >= 0 ? `first divergent tick ${bad}` : '');
    process.exit(1);
  }
  console.log('OK', g.seed, h);
  process.exit(0);
}

console.log('Usage: --out path | --verify path  [--seed N] [--steps N]');
process.exit(1);
