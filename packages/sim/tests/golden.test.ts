/**
 * Golden parity — the live payload is the source of truth for every
 * constant the sim package re-declares. These tests EXTRACT from
 * index.html — and, for adapted modules, from the single-path runtime
 * files in js/ (ADR 0003) — the way tools/econsim.js does and compare
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
/* single-path runtime files (ADR 0003): adapted modules live in js/ —
   same extraction discipline, different payload */
const rngJs = readFileSync(join(here, '..', '..', '..', '..', 'js', 'rng.js'), 'utf8');
const mathJs = readFileSync(join(here, '..', '..', '..', '..', 'js', 'math.js'), 'utf8');
const catalogJs = readFileSync(join(here, '..', '..', '..', '..', 'js', 'catalog.js'), 'utf8');

/** one live constant — fails with the drifted source text if absent */
const must = (re: RegExp, what: string): RegExpMatchArray => {
  const m = html.match(re);
  if (!m) throw new Error(`constant drifted out of index.html: ${what}`);
  return m;
};

/** one live constant in a js/ runtime file — fails with the drifted text */
const mustIn = (src: string, re: RegExp, what: string): RegExpMatchArray => {
  const m = src.match(re);
  if (!m) throw new Error(`constant drifted out of the runtime file: ${what}`);
  return m;
};

/** the live FOES table, as `id -> {hp,r,hit,sc,guns,cd?,armored?}` —
    extracted from the single-path catalog runtime (ADR 0003) */
function liveFoes(): Record<string, Record<string, number | boolean>> {
  const m = mustIn(catalogJs, /const FOES = \{([\s\S]*?)\n\};/, 'FOES table');
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
  const m = mustIn(catalogJs, /const WEAPONS = \[([\s\S]*?)\n\];/, 'WEAPONS table');
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
  const m = mustIn(catalogJs, /const DIFF = \[([\s\S]*?)\n\];/, 'DIFF table');
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
  it('the tables are single-path: the client loads the runtime and forwards them', () => {
    must(/<script src="js\/catalog\.js"><\/script>/, 'client loads js/catalog.js');
    must(/const FOES = CATALOG\.FOES;/, 'FOES forwarder');
    must(/const WEAPONS = CATALOG\.WEAPONS;/, 'WEAPONS forwarder');
    must(/const MAX_WEAPON = CATALOG\.MAX_WEAPON;/, 'MAX_WEAPON forwarder');
    must(/const DIFF = CATALOG\.DIFF;/, 'DIFF forwarder');
    must(/const HULLS = CATALOG\.HULLS;/, 'HULLS forwarder');
    must(/const BOONS = CATALOG\.BOONS;/, 'BOONS forwarder');
    must(/const BOSSES = CATALOG\.BOSSES;/, 'BOSSES forwarder');
  });

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
    mustIn(catalogJs, /const OVER_RATE = \.68;/, 'overdrive rate mirror');
    mustIn(catalogJs, /const OVER_DMG = 1\.15;/, 'overdrive dmg mirror');
    mustIn(catalogJs, /const BOLT_SPEED = 1020;/, 'bolt speed mirror');
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

  it('combo bands — the live runtime keeps the 5-band ternary chain and the client wires it', () => {
    mustIn(mathJs, /multFor\(c\) \{ return c >= 40 \? 5 : c >= 24 \? 4 : c >= 13 \? 3 : c >= 5 \? 2 : 1; \}/, 'combo bands');
    must(/function multFor\(c\) \{ return MATHMOD\.multFor\(c\); \}/, 'multFor forwarder');
    for (const c of [0, 4, 5, 12, 13, 23, 24, 39, 40, 99]) {
      expect(multFor(c), `combo ${c}`).toBe(c >= 40 ? 5 : c >= 24 ? 4 : c >= 13 ? 3 : c >= 5 ? 2 : 1);
    }
  });
});

describe('golden parity: deterministic core', () => {
  it('makeRng — single-path wiring and the live runtime bytes agree 1000 draws deep', () => {
    // the client loads the runtime and forwards the hot paths verbatim
    must(/<script src="js\/rng\.js"><\/script>/, 'client loads js/rng.js');
    must(/function makeRng\(seed\) \{ return RNGMOD\.makeRng\(seed\); \}/, 'makeRng forwarder');
    // the runtime file keeps the mulberry32 core verbatim
    mustIn(rngJs, /a = \(a \+ 0x6D2B79F5\) >>> 0;/, 'mulberry32 adder');
    mustIn(rngJs, /t = Math\.imul\(t \^ \(t >>> 15\), t \| 1\);/, 'mulberry32 mix 1');
    mustIn(rngJs, /t \^= t \+ Math\.imul\(t \^ \(t >>> 7\), t \| 61\);/, 'mulberry32 mix 2');
    mustIn(rngJs, /f\.range = \(lo, hi\) => lo \+ f\(\) \* \(hi - lo\);/, 'range');
    mustIn(rngJs, /f\.reseed = seed => \{ a = seed >>> 0; \};/, 'reseed');
    // the exact deterministic sequence is pinned in rng.test.ts (T-DET seed 12345);
    // here the adapter and a FRESH eval of the runtime file must agree deep out:
    const liveModule = new Function(`${rngJs}; return RNGMOD;`)();
    const live = liveModule.makeRng(0xC0FFEE);
    const sim = makeRng(0xC0FFEE);
    for (let i = 0; i < 1000; i++) {
      expect(sim(), `draw ${i}`).toBe(live());
    }
    // helper methods ride the same stream
    const live2 = liveModule.makeRng(42);
    const sim2 = makeRng(42);
    expect(sim2.range(3, 9)).toBe(live2.range(3, 9));
    expect(sim2.pick([1, 2, 3])).toBe(live2.pick([1, 2, 3]));
    expect(sim2.chance(0.9)).toBe(live2.chance(0.9));
    expect(sim2.sign()).toBe(live2.sign());
  });

  it('hashStr — the live FNV-1a the adapter runs agrees with a fresh eval of the runtime', () => {
    must(/function hashStr\(s\) \{ return RNGMOD\.hashStr\(s\); \}/, 'hashStr forwarder');
    mustIn(rngJs, /h = Math\.imul\(h, 16777619\);/, 'FNV-1a prime');
    const liveHash = new Function(`${rngJs}; return RNGMOD;`)().hashStr as (s: string) => number;
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
