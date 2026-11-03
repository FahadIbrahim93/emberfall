/**
 * Thin adapter (ADR 0003): the content catalog lives in
 * ../../../js/catalog.js — the exact file the client loads as a classic
 * script (hulls, hostiles, the weapon ladder, boons, capitals, difficulty
 * tiers). This module owns NO tables and NO numbers. The side-effect import
 * executes the live runtime, which self-registers as `window.CATALOG` in
 * the browser and `globalThis.CATALOG` under Node test runners — so content
 * tests guard the literal bytes the player executes.
 *
 * Two projections are applied here, mirroring what index.html previously
 * held: BOONS entries are projected to {id, name, desc} and BOSSES to
 * {id, name, art}, because the live tables also carry the client's
 * apply()/attack()/onPhase() methods that bind runtime globals at call
 * time — a classic-script adapter exports identity, behavior stays with
 * the live payload (combat sim logic that mirrors it remains pending in
 * bosses.ts/combat.ts until their extraction).
 */
import '../../../js/catalog.js';

export type HullDef = {
  id: string;
  name: string;
  cls: string;
  cost: number;
  desc: string;
  lives: number;
  speed: number;
  hitbox: number;
  dmg: number;
  dash: number;
  bombs: number;
  grazeMul: number;
  scoreMul: number;
  startShield?: boolean;
  beam?: boolean;
};

export type FoeDef = {
  hp: number;
  r: number;
  hit: number;
  sc: number;
  guns: boolean;
  cd?: number;
  armored?: boolean;
};

export type WeaponTier = {
  lanes: readonly (readonly [number, number])[];
  rate: number;
  dmg: number;
};

export type BossDef = {
  id: string;
  name: string;
  art: string;
};

export type BoonDef = {
  id: string;
  name: string;
  desc: string;
};

export type DiffDef = {
  name: string;
  bulletSpd: number;
  fireRate: number;
  hp: number;
  spawn: number;
  score: number;
  lives: number;
  grace: number;
  cozy?: boolean;
};

interface CatalogModule {
  DIFF: DiffDef[];
  HULLS: HullDef[];
  BOONS: { id: string; name: string; desc: string; apply(): void }[];
  STAGES: readonly unknown[];
  TOUR_CUM: readonly number[];
  TOUR_FINALE: number;
  tourWorldsDone(n: number): number;
  WEAPONS: (WeaponTier | null)[];
  MAX_WEAPON: number;
  FOES: Record<string, FoeDef>;
  BOSSES: { id: string; name: string; art: string }[];
  OVER_RATE: number;
  OVER_DMG: number;
  BOLT_SPEED: number;
}

const C = (globalThis as unknown as { CATALOG?: CatalogModule }).CATALOG;
if (!C) throw new Error('single-path wiring broken: js/catalog.js did not register CATALOG');

/* live tables — the client's own object references, no copies */
export const DIFF: readonly DiffDef[] = C.DIFF;
export const HULLS: readonly HullDef[] = C.HULLS;
export const FOES: Readonly<Record<string, FoeDef>> = C.FOES;
export const FOE_IDS = Object.keys(C.FOES) as readonly string[];
export const WEAPONS: readonly (WeaponTier | null)[] = C.WEAPONS;
export const MAX_WEAPON: number = C.MAX_WEAPON;

/* identity projections — the live tables carry behavior beyond these keys */
export const BOSSES: readonly BossDef[] = C.BOSSES.map((b) => ({ id: b.id, name: b.name, art: b.art }));
export const BOONS: readonly BoonDef[] = C.BOONS.map((b) => ({ id: b.id, name: b.name, desc: b.desc }));

/* the live fire-model numerics — index.html firePrimary keeps the literals
   (over ×.68 rate / ×1.15 dmg, bolt speed 1020); golden parity compares
   these against the inline literals so neither side can drift silently */
export const OVER_RATE: number = C.OVER_RATE;
export const OVER_DMG: number = C.OVER_DMG;
export const BOLT_SPEED: number = C.BOLT_SPEED;
