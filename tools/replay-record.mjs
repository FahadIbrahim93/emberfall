#!/usr/bin/env node
/**
 * P1-7 golden-replay helper (headless).
 * Usage:
 *   node tools/replay-record.mjs --seed 42 --steps 600 --out goldens/seed42.json
 *   node tools/replay-record.mjs --verify goldens/seed42.json
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function parseArgs(argv) {
  const o = { seed: 42, steps: 600, out: null, verify: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--seed') o.seed = Number(argv[++i]);
    else if (argv[i] === '--steps') o.steps = Number(argv[++i]);
    else if (argv[i] === '--out') o.out = argv[++i];
    else if (argv[i] === '--verify') o.verify = argv[++i];
  }
  return o;
}

const args = parseArgs(process.argv);
const meta = {
  version: 1,
  seed: args.seed,
  steps: args.steps,
  note: 'Golden skeleton — lock endHash via vitest T-DET tests.',
  endHash: null,
  score: null,
};

if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(meta, null, 2) + '\n');
  console.log('wrote skeleton golden', args.out);
  process.exit(0);
}
if (args.verify) {
  const g = JSON.parse(readFileSync(args.verify, 'utf8'));
  console.log('verify:', g.seed, g.steps, g.endHash == null ? 'skeleton' : 'locked');
  process.exit(0);
}
console.log('Usage: --out path | --verify path');
process.exit(1);
