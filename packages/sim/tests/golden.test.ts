/**
 * Golden parity — the live inline payload (index.html) is the source of
 * truth for every constant the sim package re-declares. These tests
 * EXTRACT from index.html the way tools/econsim.js does and compare
 * against the sim's copies, so any future edit that drifts one side
 * without the other fails CI with the exact divergent value.
 *
 * Covers: catalogs (FOES, WEAPONS, DIFF), combat math (elite multipliers,
 * wave scale, bolt speed, scale constants, combo bands, fire model) and
 * the deterministic core (makeRng sequence, hashStr, STEP/MAX_ACCUM).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { FOES, DIFF, WEAPONS, MAX_WEAPON, OVER_RATE, OVER_DMG, BOLT_SPEED } from '../src/catalog.ts';
import { SHIP_SCALE, SHOT_SCALE, firePlayer, spawnFoe, bindRng } from '../src/combat.ts';
import { multFor } from '../src/math.ts';
import { makeRng, hashStr } from '../src/rng.ts';
import { ARENA_W, ARENA_H, STEP, MAX_ACCUM, GRAZE_HEAT_DECAY } from '../src/constants.ts';
import type { World } from '../src/types.ts';

const here = fileURLToPath(import.meta.url);   /* …/packages/sim/tests/golden.test.ts */
const html = readFileSync(join(here, '..', '..', '..', '..', 'index.html'), 'utf8');

/** one live constant — fails with the drifted source text if absent */
const must = (re: RegExp, what: string): RegExpMatchArray => {
  const m = html.match(re);
  if (!m) throw new Error(`constant drifted out of index.html: ${what}`);
  return m;
};

/** the live FOES table, as `id -> {hp,r,hit,sc,guns,cd?,armored?}` */
function liveFoes(): Record<string, Record<string, number | boolean>> {
  const m = must(/const FOES = \{([\s\S]*?)\n\};/, 'FOES table');
  const out: Record<string, Record<string, number | boolean>> = {};
  for (const row of m[1].matchAll(/(\w+): \{ hp: ([\d.]+), r: ([\d.]+), hit: ([\d.]+), sc: ([\d.]+), guns: (\w+)(?:, cd: ([\d.]+))?(?:, armored: (\w+))? \}/g)) {
    out[row[1]] = {
      hp: +row[2], r: +row[3], hit: +row[4], sc: +row[5],
      guns: row[6] === 'true', cd: row[7] ? +row[7] : undefined,
      armored: row[8] === 'true',
    };
  }
  return out;
}

/** the live WEAPONS ladder, as `tier -> {rate,dmg,lanes:[[dx,ang]]}` */
function liveWeapons(): (Record<string, unknown> | null)[] {
  const m = must(/const WEAPONS = \[([\s\S]*?)\n\];/, 'WEAPONS table');
  const rows = m[1].split('\n').filter(l => l.includes('lanes:'));
  return [null, ...rows.map(line => {
    const rate = +line.match(/rate: ([\d.]+)/)![1];
    const dmg = +line.match(/dmg: ([\d.]+)/)![1];
    const lanes = [...line.matchAll(/\[(-?\d+), (-?\d*\.?\d+)\]/g)]
      .map(p => [+p[1], +p[2]] as [number, number]);
    return { lanes, rate, dmg };
  })];
}

/** the live DIFF table rows (name bulletSpd fireRate hp spawn score grace) */
function liveDiff(): Record<string, Record<string, number>> {
  const m = must(/const DIFF = \[([\s\S]*?)\n\];/, 'DIFF table');
  const out: Record<string, Record<string, number>> = {};
  for (const row of m[1].matchAll(/name: '(\w+)', bulletSpd: ([\d.]+), fireRate: ([\d.]+), hp: ([\d.]+), spawn: ([\d.]+), score: ([\d.]+), lives: (-?\d+), grace: ([\d.]+)/g)) {
    out[row[1]] = {
      bulletSpd: +row[2], fireRate: +row[3], hp: +row[4],
      spawn: +row[5], score: +row[6], lives: +row[7], grace: +row[8],
    };
  }
  return out;
}

function mkWorld(weapon: number, over = 0): World {
  return {
    wave: 1, difficulty: 2, nextId: 1,
    player: { x: 100, y: 100, r: 10, alive: true, fireCd: 0, weapon, dmg: 1, overT: over, rateMul: 1, beam: false },
    foes: [], playerBullets: [], foeBullets: [], shots: 0, hits: 0,
  } as unknown as World;
}

describe('golden parity: catalogs match the live payload', () => {
  it('FOES — every id, hp, r, hit, sc, guns, cd, armored', () => {
    const live = liveFoes();
    expect(Object.keys(live).sort()).toEqual(Object.keys(FOES).sort());
    for (const [id, L] of Object.entries(live)) {
      const S = FOES[id] as unknown as Record<string, unknown>;
      expect(S.hp, `${id}.hp`).toBe(L.hp);
      expect(S.r, `${id}.r`).toBe(L.r);
      expect(S.hit, `${id}.hit`).toBe(L.hit);
      expect(S.sc, `${id}.sc`).toBe(L.sc);
      expect(S.guns, `${id}.guns`).toBe(L.guns);
      if (L.cd !== undefined) expect(S.cd, `${id}.cd`).toBe(L.cd);
      expect(!!S.armored, `${id}.armored`).toBe(L.armored as boolean);
    }
  });

  it('WEAPONS — full ladder: lanes, rate, dmg, MAX_WEAPON', () => {
    const live = liveWeapons();
    expect(WEAPONS.length).toBe(live.length);
    expect(MAX_WEAPON).toBe(live.length - 1);
    live.forEach((L, i) => {
      if (!L) return;
      const W = WEAPONS[i]!;
      expect(W.lanes, `W${i} lanes`).toEqual(L.lanes);
      expect(W.rate, `W${i} rate`).toBe(L.rate);
      expect(W.dmg, `W${i} dmg`).toBe(L.dmg);
    });
  });

  it('DIFF — every tier stat', () => {
    const live = liveDiff();
    for (const [name, L] of Object.entries(live)) {
      const D = DIFF.find(d => d.name === name);
      expect(D, `${name} exists`).toBeTruthy();
      expect(D!.bulletSpd).toBe(L.bulletSpd);
      expect(D!.fireRate).toBe(L.fireRate);
      expect(D!.hp).toBe(L.hp);
      expect(D!.score).toBe(L.score);
      expect(D!.grace).toBe(L.grace);
    }
    expect(DIFF.length).toBe(5);
  });
});

describe('golden parity: combat math matches the live formulas', () => {
  it('the live elite block is still the 2.1 / 2.4 / 1.18 / .78 model', () => {
    must(/e\.hp = e\.maxHp = Math\.round\(e\.hp \* 2\.1\);/, 'elite hp mult');
    must(/e\.sc = Math\.round\(e\.sc \* 2\.4\);/, 'elite sc mult');
    must(/e\.r \*= 1\.18; e\.hitR \*= 1\.18;/, 'elite size mult');
    must(/e\.cd \*= \.78;/, 'elite cd mult');
    /* and spawnFoe reproduces it numerically (striker W1 Pilot: cd 1.9·0.78) */
    bindRng(7);
    const w = mkWorld(1);
    const e = spawnFoe(w, 'striker', { x: 100, y: -40, elite: true })!;
    expect(e.hp).toBe(Math.round(3 * 2.1));            // 3 base hp × 2.1
    expect(e.sc).toBe(Math.round(110 * 2.4));          // 110 base sc × 2.4
    expect(e.cd).toBeCloseTo(1.9 * 0.78, 10);
  });

  it('spawnFoe applies the live wave scale (1 + (wave-1)*.075) on hp', () => {
    must(/const scale = 1 \+ \(GAME\.wave - 1\) \* \.075;/, 'live wave scale');
    bindRng(7);
    const world = mkWorld(1);
    world.wave = 5;
    const e = spawnFoe(world, 'drone', { x: 100, y: -40 })!;
    expect(e.hp).toBe(Math.max(1, Math.round(2 * (1 + 4 * 0.075)))); // drone hp 2 at wave 5
  });

  it('fire model: live constants (bolt 1020, over ×0.68/×1.15)', () => {
    must(/vx: Math\.sin\(ang\) \* 1020, vy: -Math\.cos\(ang\) \* 1020/, 'live bolt speed 1020');
    must(/P\.fireCd = w\.rate \* \(over \? \.68 : 1\) \* P\.rateMul/, 'live overdrive rate');
    must(/const dmg = w\.dmg \* P\.dmg \* \(over \? 1\.15 : 1\);/, 'live overdrive dmg');
    expect(BOLT_SPEED).toBe(1020);
    expect(OVER_RATE).toBe(0.68);
    expect(OVER_DMG).toBe(1.15);
  });

  it('firePlayer reproduces the live cadence and lane geometry per tier', () => {
    for (let tier = 1; tier <= MAX_WEAPON; tier++) {
      const live = liveWeapons()[tier]!;
      const w = mkWorld(tier);
      firePlayer(w);
      expect(w.playerBullets.length, `W${tier} lane count`).toBe(live.lanes.length);
      for (const b of w.playerBullets) {
        expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(1020, 6);
      }
      // the cooldown is the live per-tier rate — no fabricated 0.14
      expect(w.player.fireCd, `W${tier} fireCd`).toBeCloseTo(live.rate, 10);
      // overdrive: ×0.68 rate, ×1.15 dmg
      const wo = mkWorld(tier, 1);
      firePlayer(wo);
      expect(wo.player.fireCd).toBeCloseTo(live.rate * 0.68, 10);
      expect(wo.playerBullets[0].dmg).toBeCloseTo(live.dmg * 1.15, 10);
    }
  });

  it('scale constants', () => {
    must(/const SHIP_SCALE = 1\.3;/, 'SHIP_SCALE');
    must(/const SHOT_SCALE = 1\.18;/, 'SHOT_SCALE');
    expect(SHIP_SCALE).toBe(1.3);
    expect(SHOT_SCALE).toBe(1.18);
  });

  it('combo bands — sim matches the live ternary chain', () => {
    must(/function multFor\(c\) \{ return c >= 40 \? 5 : c >= 24 \? 4 : c >= 13 \? 3 : c >= 5 \? 2 : 1; \}/, 'multFor');
    for (const c of [0, 4, 5, 12, 13, 23, 24, 39, 40, 99]) {
      expect(multFor(c), `combo ${c}`).toBe(c >= 40 ? 5 : c >= 24 ? 4 : c >= 13 ? 3 : c >= 5 ? 2 : 1);
    }
  });
});

describe('golden parity: deterministic core', () => {
  it('makeRng produces the identical sequence as the live makeRng', () => {
    // eval the live function body verbatim — no transcription, no drift
    const src = must(/function makeRng\(seed\) \{[\s\S]*?\n\}/, 'makeRng source')[0];
    const liveMakeRng = new Function(`${src}; return makeRng;`)() as (s: number) => () => number;
    const live = liveMakeRng(0xC0FFEE);
    const sim = makeRng(0xC0FFEE);
    for (let i = 0; i < 1000; i++) {
      expect(sim(), `draw ${i}`).toBe(live());
    }
    // helper methods ride the same stream
    const live2 = liveMakeRng(42);
    const sim2 = makeRng(42);
    expect(sim2.range(3, 9)).toBe(live2.range(3, 9));
    expect(sim2.pick([1, 2, 3])).toBe(live2.pick([1, 2, 3]));
    expect(sim2.chance(0.9)).toBe(live2.chance(0.9));
    expect(sim2.sign()).toBe(live2.sign());
  });

  it('hashStr matches the live FNV-1a', () => {
    const src = must(/function hashStr\(s\) \{[\s\S]*?\n\}/, 'hashStr source')[0];
    const liveHash = new Function(`${src}; return hashStr;`)() as (s: string) => number;
    for (const s of ['', 'a', 'daily-2026-09-21', 'emberfall', 'x'.repeat(5000)]) {
      expect(hashStr(s)).toBe(liveHash(s));
    }
  });

  it('STEP / MAX_ACCUM / graze decay match the live loop', () => {
    must(/const STEP = 1 \/ 120;/, 'STEP');
    must(/while \(accumulator >= STEP && steps < 5\)/, '5-step ceiling');
    must(/GAME\.grazeHeat = Math\.max\(0, GAME\.grazeHeat - dt\);/, 'graze decay 1/s');
    expect(STEP).toBe(1 / 120);
    expect(MAX_ACCUM).toBe(5);
    expect(GRAZE_HEAT_DECAY).toBe(1);
  });

  it('logical arena is the documented T-ARENA abstraction', () => {
    expect(ARENA_W).toBe(540);
    expect(ARENA_H).toBe(960);
  });
});
