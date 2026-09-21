/**
 * Golden parity, part 2 — the two data domains the first suite had not
 * yet mirrored: boss statlines and the Solar Tour stage registry.
 * Same discipline as golden.test.ts: the live payload is read at test
 * time and the sim's copies are pinned to it, field by field.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { BOSS_DEFS } from '../src/bosses.ts';
import { STAGES, TOUR_CUM, TOUR_FINALE, tourWorldsDone } from '../src/stages.ts';

const here = fileURLToPath(import.meta.url);
const html = readFileSync(join(here, '..', '..', '..', '..', 'index.html'), 'utf8');

const must = (re: RegExp, what: string): RegExpMatchArray => {
  const m = html.match(re);
  if (!m) throw new Error(`constant drifted out of index.html: ${what}`);
  return m;
};

/** live boss statlines: id -> {hp, r, hitR, sc, nodes|null} */
function liveBosses(): Record<string, Record<string, unknown>> {
  const block = must(/const BOSSES = \[([\s\S]*?)\n\];/, 'BOSSES table')[1];
  const out: Record<string, Record<string, unknown>> = {};
  for (const chunk of block.split("id: '").slice(1)) {
    const id = chunk.slice(0, chunk.indexOf("'"));
    const num = (k: string) => +chunk.match(new RegExp(k + ': ([\\d.]+)'))![1];
    const nodesM = chunk.match(/nodes: \[([^\]]*)\]/);
    const nodes = nodesM
      ? [...nodesM[1].matchAll(/\{ ox: (-?[\d.]+), oy: (-?[\d.]+), r: ([\d.]+), hp: ([\d.]+) \}/g)]
        .map(n => ({ ox: +n[1], oy: +n[2], r: +n[3], hp: +n[4] }))
      : null;
    out[id] = { hp: num('hp'), r: num('r'), hitR: num('hitR'), sc: num('sc'), nodes };
  }
  return out;
}

/** live STAGES rows: id -> full field set */
function liveStages(): Record<string, Record<string, unknown>> {
  const block = must(/const STAGES = \[([\s\S]*?)\n\];/, 'STAGES table')[1];
  const out: Record<string, Record<string, unknown>> = {};
  for (const chunk of block.split("id: '").slice(1)) {
    const id = chunk.slice(0, chunk.indexOf("'"));
    const num = (k: string) => {
      const m = chunk.match(new RegExp(k + ': (-?[\\d.]+)'));
      return m ? +m[1] : undefined;
    };
    out[id] = {
      name: chunk.match(/name: '([^']+)'/)![1],
      waves: num('waves')!,
      tint: num('tint')!, crater: num('crater')!, ring: num('ring')!,
      storm: num('storm')!, lights: num('lights')!,
      hue: num('hue')!, sat: num('sat')!, bri: num('bri')!,
      haz: (chunk.match(/haz: '(\w+)'/) || [])[1],
      hazK: num('hazK'),
    };
  }
  return out;
}

describe('golden parity 2: boss statlines match the live payload', () => {
  it('every boss id order, hp, r, hitR, sc, and weak-point nodes', () => {
    const live = liveBosses();
    expect(BOSS_DEFS.map(b => b.id)).toEqual(Object.keys(live));
    for (const b of BOSS_DEFS) {
      const L = live[b.id];
      expect(b.hp, `${b.id}.hp`).toBe(L.hp);
      expect(b.r, `${b.id}.r`).toBe(L.r);
      expect(b.hitR, `${b.id}.hitR`).toBe(L.hitR);
      expect(b.sc, `${b.id}.sc`).toBe(L.sc);
      expect(b.nodes, `${b.id}.nodes`).toEqual(L.nodes);
    }
  });
});

describe('golden parity 2: the Solar Tour registry matches the live payload', () => {
  it('every world in order with every structural field', () => {
    const live = liveStages();
    expect(STAGES.map(s => s.id)).toEqual(Object.keys(live));
    for (const s of STAGES) {
      const L = live[s.id] as Record<string, unknown>;
      expect(s.name, `${s.id}.name`).toBe(L.name);
      expect(s.waves, `${s.id}.waves`).toBe(L.waves);
      for (const k of ['tint', 'crater', 'ring', 'storm', 'lights', 'hue', 'sat', 'bri'] as const) {
        expect(s[k], `${s.id}.${k}`).toBe(L[k]);
      }
      expect(s.haz, `${s.id}.haz`).toBe(L.haz);
      expect(s.hazK, `${s.id}.hazK`).toBe(L.hazK);
    }
  });

  it('the derived campaign constants derive identically', () => {
    must(/const TOUR_CUM = STAGES\.reduce\(\(a, s\) => \(a\.push\(\(a\[a\.length - 1\] \|\| 0\) \+ s\.waves\), a\), \[\]\);/, 'TOUR_CUM derivation');
    const liveCum: number[] = [];
    for (const s of Object.values(liveStages())) liveCum.push((liveCum[liveCum.length - 1] || 0) + (s.waves as number));
    expect(TOUR_CUM).toEqual(liveCum);
    expect(TOUR_FINALE).toBe(liveCum[liveCum.length - 1]);
    must(/const TOUR_FINALE = TOUR_CUM\[TOUR_CUM\.length - 1\];/, 'TOUR_FINALE derivation');
  });

  it('tourWorldsDone agrees with the live function on the whole ladder', () => {
    for (let n = 1; n <= TOUR_FINALE + 2; n++) {
      expect(tourWorldsDone(n), `wave ${n}`).toBe(TOUR_CUM.filter(c => c < n).length);
    }
    expect(tourWorldsDone(1)).toBe(0);
    expect(tourWorldsDone(TOUR_FINALE)).toBe(7);
  });
});
