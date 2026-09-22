#!/usr/bin/env node
/* econsim.js — EMBERFALL meta-economy simulator.
   Rules: (1) constants are EXTRACTED from source, so future tuning keeps
   this truthful — a drifted constant fails loudly instead of simulating
   a game that no longer exists; (2) the behavioural model is CALIBRATED
   against real server telemetry (60 verified runs: kills/wave, score/kill,
   seconds/wave) and validated against the live pilot anchor — 95 runs,
   lifetime ≈ 58,484 alloy (bank 23,134 + spend 35,360) → ~616/run.
   Run:  node tools/econsim.js            full report
         node tools/econsim.js --json     machine-readable */
'use strict';
const fs = require('fs');
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/* ── extract constants from source (drift = loud failure) ── */
const html = fs.readFileSync('index.html', 'utf8');
const skySrc = fs.readFileSync('js/sky.js', 'utf8');
const must = (re, what, src) => { const m = (src || html).match(re); if (!m) throw new Error('constant drifted: ' + what); return m; };

/* hull costs, release order: vesper(0), halcyon, atlas, wraith, seraph */
const hullCosts = [...html.matchAll(/cost: (\d+),\s*\n\s*desc/g)].map(m => +m[1]);
if (hullCosts.length !== 5) throw new Error('expected 5 hull costs, got ' + hullCosts.length);

/* v4.1 paint shop: cosmetic sinks extracted from source — tracked so the
   simulation reports total outstanding sink including personalization */
const paintCosts = [...html.matchAll(/hull: '#[0-9a-f]+', lit: '#[0-9a-f]+', cost: (\d+)/g)].map(m => +m[1]);
if (paintCosts.length !== 10) throw new Error('expected 10 paint costs, got ' + paintCosts.length);
/* yard starter + the two streak laurels are the only zero-cost paints —
   if that changes, the "laurels are earned, not bought" contract changed */
if (paintCosts.filter(c => c === 0).length !== 3) throw new Error('expected exactly 3 free paints (yard + 2 laurels), got ' + paintCosts.filter(c => c === 0).length);

/* v4.2 sigil bay: one worn sigil, power priced in weakness — alloy sinks
   extracted from source like every other (anchored on the tier field) */
const sigilCosts = [...html.matchAll(/tier: '\w+', cost: (\d+),/g)].map(m => +m[1]);
if (sigilCosts.length !== 5) throw new Error('expected 5 sigil costs, got ' + sigilCosts.length);

/* v4.5 yard donations: the audit's prestige sink (§5.1) — extracted so the
   honor ladder stays in the model like every other sink */
/* v4.8 daily gauntlet medals: a tested faucet, paid once per tier per UTC
   day (server-ledgered). Full house = 830/day; the deck also keeps six
   rolling snapshots, so the watermark survives vault restores. */
const DAILY_MEDAL_ALLOY = [120, 260, 450];   /* Crest / Crown / Eclipse */
const DAILY_SUNDAY_GUARD = 800;              /* v4.9 Solar Guard — Sundays only */
const DAILY_MEDAL_TOTAL = DAILY_MEDAL_ALLOY.reduce((a, c) => a + c, 0);
const donBlock = html.match(/const DONATIONS = \[([\s\S]*?)\n\];/);
if (!donBlock) throw new Error('constant drifted: DONATIONS table');
const donationTiers = [...donBlock[1].matchAll(/at: (\d+),\s*name: '(\w+)'/g)].map(m => ({ at: +m[1], name: m[2] }));
if (donationTiers.length !== 3 || donationTiers[0].name !== 'Patron')
  throw new Error('expected 3 donation tiers led by Patron, got ' + donationTiers.length);

/* refit ladders: cost: l => A + l * B, five levels each */
const refitTables = [...html.matchAll(/id: '(\w+)', name: '[^']+', max: 5, cost: l => (\d+) \+ l \* (\d+)/g)]
  .map(m => ({ id: m[1], a: +m[2], b: +m[3] }));
if (refitTables.length !== 6) throw new Error('expected 6 refits, got ' + refitTables.length);
const refitTotal = id => { const t = refitTables.find(r => r.id === id); let s = 0; for (let l = 0; l < 5; l++) s += t.a + l * t.b; return s; };
const refitGrand = refitTables.reduce((s, r) => s + refitTotal(r.id), 0);

/* run-end formula: earned = (alloyRun + score/DIV + wave*WAVE_MULT) * (1 + fortune*.05) */
const fm = must(/bonusMul = 1 \+ refit\('fortune'\) \* \.05;\s*\n\s*const earned = Math\.round\(\(GAME\.alloyRun \+ GAME\.score \/ (\d+) \+ GAME\.wave \* (\d+)\) \* bonusMul\)/, 'run-end formula');
const SCORE_DIV = +fm[1], WAVE_MULT = +fm[2];

/* v3.8 elite income: elites (wave ≥ 10, chance .16) pay 2.4× score and roll
   one extra alloy drop — constants extracted from source like every other */
const eg = must(/const elite = n >= (\d+) && R\.chance\((\.\d+)\);/, 'elite gating');
const ELITE_MIN_WAVE = +eg[1], ELITE_P = +eg[2];
const ELITE_SC = +must(/e\.sc = Math\.round\(e\.sc \* (\d\.\d+)\);/, 'elite score mult')[1];

/* kill alloy drops: chance = (.135 + fortune*.022), pity +.5 after 12 dry kills; amt = 4 + floor(wave*.7) */
must(/const chance = \(\.135 \+ refit\('fortune'\) \* \.022\) \+ \(dropPity > 12 \? \.5 : 0\);/, 'drop chance');
const DROP_P = .135, PITY_AFTER = 12, PITY_BONUS = .5;
const ALLOY_PICK = w => 4 + Math.floor(w * .7);

/* wave clear pay and boss pay */
const wcm = must(/GAME\.alloyRun \+= 12 \+ DIRECTOR\.wave \* (\d+);/, 'wave clear pay');
const WAVE_CLEAR_BASE = 12, WAVE_CLEAR_W = +wcm[1], BOSS_PAY = 120;

/* comet income (js/sky.js): (15 + wave*2) * (gold?10:1) * style(1..2) * chart(1|1.5) */
const cm = must(/\(15 \+ GAME\.wave \* (\d+)\) \* \(c\.gold \? 10 : 1\) \* style \* chart/, 'comet bonus', skySrc);
const COMET_BASE = 15, COMET_WAVE = +cm[1];
const GOLD_P = must(/c\.gold = FX\.chance\((\.\d+)\);/, 'golden chance', skySrc).slice(1).map(Number)[0];
const COMET_GAP_S = 100;                       // skyDelay(100, 20) at standard f=1

/* ── behaviour, calibrated on real telemetry (60 verified runs) ──
   kills per wave:      1.66 * w^1.09   — fits w5 (23≈24), w12 (177…296 over
                        the bucket), w32 (1103≈1130) simultaneously
   score per kill:      -0.86w² + 58.8w - 45.7 (min 60) — combo-inflated,
                        concave: 123@w4, 536@w12, 954@w32 (actual averages)
   seconds per wave:    35 (actual: 417s/12w, 480s/17w, 1140s/32w)          */
const KILLS_PER_WAVE = w => 1.66 * Math.pow(w, 1.09);
const SCORE_PER_KILL = w => Math.max(60, -0.86 * w * w + 58.8 * w - 45.7);
const SECONDS_PER_WAVE = 35;
const COMET_BANK_P = SECONDS_PER_WAVE / COMET_GAP_S * .9;   // crossing overlaps a wave

/* ── run model ── p.waves = the wave DIED ON (DB semantics): waves 1..w-1
   are fully cleared, the death wave pays half its kills and no clear bonus. */
function simRun(p) {
  const waves = p.waves;
  let alloyRun = 0, score = 0, kills = 0, dry = 0, comets = 0, cometPay = 0;
  for (let w = 1; w <= waves; w++) {
    const dead = w === waves;
    const n = Math.round(KILLS_PER_WAVE(w) * (dead ? .5 : 1));
    for (let k = 0; k < n; k++) {
      kills++;
      const eliteK = w >= ELITE_MIN_WAVE && rnd() < ELITE_P;
      const chance = DROP_P + p.fortune * .022 + (dry > PITY_AFTER ? PITY_BONUS : 0);
      if (rnd() < chance) { dry = 0; alloyRun += ALLOY_PICK(w); } else dry++;
      if (eliteK && rnd() < chance) alloyRun += ALLOY_PICK(w);   // the extra elite roll
      score += SCORE_PER_KILL(w) * (eliteK ? ELITE_SC : 1);
    }
    if (!dead) {
      alloyRun += WAVE_CLEAR_BASE + w * WAVE_CLEAR_W;
      if (w % 5 === 0) alloyRun += BOSS_PAY;
    }
    if (rnd() < COMET_BANK_P) {
      comets++;
      const gold = rnd() < GOLD_P;
          /* style ~ the in-game grazeHeat multiplier (x1..x2). NOTE (P0-3 fix):
         grazeHeat used to FREEZE at its last value once the combo expired, so
         historical telemetry paid the max x2 on nearly every comet — the
       anchor below was calibrated against bug-inflated income. Post-fix the
       multiplier decays 1/s from the last graze, so real style averages
       below 1.5; uniform(1,2) here now slightly over-predicts the FIXED
       game, i.e. the anchor drift is even less favourable-looking than the
       raw -15.4% suggests. See docs/economy-audit.md §5. */
    const style = 1 + rnd();
      const chart = (p.careerComets + comets) >= 10 ? 1.5 : 1;
      const pay = Math.round((COMET_BASE + w * COMET_WAVE) * (gold ? 10 : 1) * style * chart);
      cometPay += pay; alloyRun += pay;
    }
  }
  const bonusMul = 1 + p.fortune * .05;
  const earned = Math.round((alloyRun + score / SCORE_DIV + waves * WAVE_MULT) * bonusMul);
  return { earned, kills: Math.round(kills), score: Math.round(score), comets, cometPay, waves };
}

/* ── anchor validation: replay the pilot's actual run history ──
   Derived from the live server DB (59 submitted runs, bucketed by death
   wave) plus 36 pre-netcode runs assumed early and short. Fortune tracks
   the purchase era (Scavenger was bought mid-career, maxed late).
   Actual lifetime = 58,484 (bank 23,134 + spend 35,350). */
const ANCHOR = { runs: 95, lifetime: 58484 };
const RUN_MIX = [
  { n: 36, waves: 3, fortune: 0, careerComets: 0 },     // pre-netcode era
  { n: 44, waves: 4, fortune: 0, careerComets: 1 },     // the wave 0-4 bucket
  { n: 6, waves: 7, fortune: 1, careerComets: 3 },      // wave 5-9 bucket
  { n: 4, waves: 10, fortune: 1, careerComets: 8 },     // early mid-tier
  { n: 1, waves: 12, fortune: 2, careerComets: 14 },
  { n: 2, waves: 15, fortune: 3, careerComets: 30 },
  { n: 1, waves: 17, fortune: 4, careerComets: 45 },
  { n: 1, waves: 32, fortune: 5, careerComets: 100 }    // the wave-32 deep run
];
function anchorCheck() {
  let total = 0, detail = [];
  for (const seg of RUN_MIX) {
    seed = 7;
    let s = 0;
    for (let i = 0; i < seg.n; i++) s += simRun(seg).earned;
    detail.push({ waves: seg.waves, n: seg.n, avg: Math.round(s / seg.n) });
    total += s;
  }
  return { simulated: total, actual: ANCHOR.lifetime, drift: +((total / ANCHOR.lifetime - 1) * 100).toFixed(1), detail };
}

/* ── steady-state income by wave depth (death wave = target depth) ── */
function incomeCurve(N) {
  const out = [];
  for (const waves of [4, 8, 12, 16, 20, 26, 32]) {
    const fortune = waves >= 26 ? 5 : waves >= 16 ? 3 : waves >= 8 ? 1 : 0;
    const careerComets = waves * 3;
    seed = 99;
    let sum = 0, cp = 0, sc = 0;
    for (let i = 0; i < N; i++) {
      const r = simRun({ waves, fortune, careerComets });
      sum += r.earned; cp += r.cometPay; sc += r.score;
    }
    out.push({ waves, mean: Math.round(sum / N), cometShare: +(cp / sum * 100).toFixed(1), scoreShare: +(sc / SCORE_DIV / sum * 100).toFixed(1), perMin: Math.round(sum / N / (waves * SECONDS_PER_WAVE / 60)) });
  }
  return out;
}

/* ── progression: ONE career, greedy spend, skill ramp, three waypoints ── */
function career(profile) {
  let bank = 0, careerComets = 0, run = 0;
  const costs = hullCosts.filter(c => c > 0);
  const owned = new Set();
  const refitLeft = new Map(refitTables.map(r => [r.id, 5]));
  const nextCost = () => {
    let best = null;
    for (const c of costs) if (!owned.has(c) && (best === null || c < best)) best = c;
    for (const r of refitTables) {
      if (refitLeft.get(r.id) > 0) {
        const c = r.a + (5 - refitLeft.get(r.id)) * r.b;
        if (best === null || c < best) best = c;
      }
    }
    return best;
  };
  const marks = { firstHull: 0, seraph: 0, all: 0, peakBank: 0 };
  while (run < 900) {
    run++;
    /* skill ramps with play: deeper waves over the first ~60 runs,
       fortune refits arrive as the bank allows (greedy buy is modelled) */
    const waves = Math.min(profile.waves, 3 + Math.round(run * profile.waves / 70));
    const fortune = Math.min(5, Math.floor(run / 14));
    const r = simRun({ waves, fortune, careerComets });
    bank += r.earned;
    careerComets += r.comets;
    while (true) {
      const cost = nextCost();
      if (cost === null || bank < cost) break;
      bank -= cost;
      if (costs.includes(cost) && !owned.has(cost)) owned.add(cost);
      else for (const rt of refitTables) {
        if (refitLeft.get(rt.id) > 0 && rt.a + (5 - refitLeft.get(rt.id)) * rt.b === cost) { refitLeft.set(rt.id, refitLeft.get(rt.id) - 1); break; }
      }
    }
    if (!marks.firstHull && owned.size >= 1) marks.firstHull = run;
    if (!marks.seraph && owned.size === costs.length) marks.seraph = run;
    if (!marks.all && owned.size === costs.length && [...refitLeft.values()].every(v => v === 0)) { marks.all = run; marks.peakBank = bank; break; }
  }
  return marks;
}

function median(arr) { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

function main() {
  const out = {
    extracted: { hullCosts, refitGrand, SCORE_DIV, WAVE_MULT, DROP_P, COMET_GAP_S, GOLD_P, KILLS_MODEL: '1.66*w^1.09', SECONDS_PER_WAVE },
    anchor: anchorCheck(),
    incomeCurve: incomeCurve(3000),
    milestones: null,
    spend: { hulls: hullCosts.reduce((a, c) => a + c, 0), refits: refitGrand, grandTotal: hullCosts.reduce((a, c) => a + c, 0) + refitGrand,
      paints: paintCosts.reduce((a, c) => a + c, 0), sigils: sigilCosts.reduce((a, c) => a + c, 0),
      donationsCeiling: donationTiers[donationTiers.length - 1].at,
      allIn: hullCosts.reduce((a, c) => a + c, 0) + refitGrand + paintCosts.reduce((a, c) => a + c, 0) + sigilCosts.reduce((a, c) => a + c, 0) }
  };
  const seeds = [];
  for (let s = 0; s < 21; s++) {
    seed = 5000 + s * 13;
    seeds.push(career({ waves: 26 }));
  }
  out.milestones = {
    firstHull: median(seeds.map(s => s.firstHull)),
    seraphOwned: median(seeds.map(s => s.seraph)),
    fullCompletion: median(seeds.map(s => s.all)),
    leftoverBank: median(seeds.map(s => s.peakBank))
  };

  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log('EMBERFALL economy audit — constants extracted from source, behaviour calibrated on live telemetry\n');
  console.log('Extracted: hulls ' + hullCosts.join('/') + ' · refit grand ' + refitGrand +
    ' · score/' + SCORE_DIV + ' + wave*' + WAVE_MULT + ' · drop ' + (DROP_P * 100) + '%+pity · comet gap ' + COMET_GAP_S + 's · gold ' + (GOLD_P * 100) + '%');
  console.log('Calibrated: kills/wave = 1.66·w^1.09 · score/kill = -0.86w²+58.8w-45.7 · ' + SECONDS_PER_WAVE + 's/wave\n');

  console.log('Anchor check (95-run replay vs actual lifetime):');
  console.log('  simulated ' + out.anchor.simulated + ' vs actual ' + out.anchor.actual + '  →  drift ' + out.anchor.drift + '%');
  for (const d of out.anchor.detail) console.log('   · ' + d.n + '× wave-' + d.waves + ' runs ≈ ' + d.avg + ' alloy each');

  console.log('\nIncome curve (steady-state pilot at each depth):');
  for (const c of out.incomeCurve) {
    console.log('  wave ' + String(c.waves).padStart(2) + ' → ' + String(c.mean).padStart(5) + '/run (' + String(c.perMin).padStart(3) + '/min)' +
      '  · comets ' + c.cometShare + '% · score ' + c.scoreShare + '%');
  }

  console.log('\nProgression milestones (median of 21 sims, skill ramp):');
  console.log('  first hull:      run ~' + out.milestones.firstHull);
  console.log('  all hulls owned: run ~' + out.milestones.seraphOwned);
  console.log('  full completion: run ~' + out.milestones.fullCompletion);
  console.log('  grand total to own everything: ' + out.spend.grandTotal + ' (hulls ' + out.spend.hulls + ' + refits ' + out.spend.refits + ')');

  console.log('\nDaily gauntlet faucet (v4.8, server-ledgered, once per tier per day):');
  console.log('  weekday full house: ' + DAILY_MEDAL_TOTAL + '/day · Sunday with the honor guard: ' +
    (DAILY_MEDAL_TOTAL + DAILY_SUNDAY_GUARD) + '/day · Crest-only: ' + DAILY_MEDAL_ALLOY[0] +
    '/day · over a 30-day month (4 Sundays): ' + (DAILY_MEDAL_TOTAL * 30 + DAILY_SUNDAY_GUARD * 4) +
    ' (≈' + ((DAILY_MEDAL_TOTAL * 30 + DAILY_SUNDAY_GUARD * 4) / out.spend.grandTotal * 100).toFixed(1) +
    '% of the full-collection price)');
}
main();
