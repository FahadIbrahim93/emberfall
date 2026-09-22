/** Pure content catalogs — data only, no DOM / audio / render. */

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

export const HULLS: readonly HullDef[] = [
  {
    id: 'vesper', name: 'VESPER-01', cls: 'Interceptor', cost: 0,
    desc: 'The standard yard hull. Honest speed, honest guns, room to make mistakes.',
    lives: 3, speed: 1, hitbox: 1, dmg: 1, dash: 2, bombs: 2, grazeMul: 1, scoreMul: 1,
  },
  {
    id: 'halcyon', name: 'HALCYON', cls: 'Lance', cost: 1400,
    desc: 'Stripped to the spars for thrust. Hits harder and turns faster, but there is less of it to hit with.',
    lives: 2, speed: 1.2, hitbox: 0.82, dmg: 1.3, dash: 3, bombs: 1, grazeMul: 1.4, scoreMul: 1.15,
  },
  {
    id: 'atlas', name: 'ATLAS', cls: 'Bulwark', cost: 2600,
    desc: 'Yard tug plating welded over a gun platform. Slow, wide, and extremely hard to kill.',
    lives: 5, speed: 0.86, hitbox: 1.25, dmg: 0.92, dash: 1, bombs: 3, grazeMul: 0.8, scoreMul: 0.92,
    startShield: true,
  },
  {
    id: 'wraith', name: 'WRAITH', cls: 'Ghost', cost: 5200,
    desc: 'Recovered from the gate, not built. One hull point, a hitbox you can barely see, and it pays for nerve.',
    lives: 1, speed: 1.14, hitbox: 0.55, dmg: 1.1, dash: 4, bombs: 1, grazeMul: 3, scoreMul: 1.6,
  },
  {
    id: 'seraph', name: 'SERAPH', cls: 'Prism', cost: 7600,
    desc: 'Yard testbed with a prism lance — one continuous cutting beam instead of guns.',
    lives: 2, speed: 1.06, hitbox: 0.88, dmg: 1, dash: 3, bombs: 2, grazeMul: 1.2, scoreMul: 1.2,
    beam: true,
  },
];

export type FoeDef = {
  hp: number;
  r: number;
  hit: number;
  sc: number;
  guns: boolean;
  cd?: number;
  armored?: boolean;
};

export const FOES: Readonly<Record<string, FoeDef>> = {
  drone: { hp: 2, r: 13, hit: 11, sc: 50, guns: false },
  mini: { hp: 1, r: 9, hit: 8, sc: 30, guns: false },
  striker: { hp: 3, r: 14, hit: 12, sc: 110, guns: true, cd: 1.9 },
  weaver: { hp: 4, r: 14, hit: 12, sc: 140, guns: true, cd: 2.1 },
  splitter: { hp: 5, r: 15, hit: 13, sc: 120, guns: false },
  cruiser: { hp: 15, r: 24, hit: 21, sc: 360, guns: true, cd: 2.4, armored: true },
  lancer: { hp: 8, r: 18, hit: 15, sc: 280, guns: true, cd: 3.4 },
  orbiter: { hp: 4, r: 12, hit: 11, sc: 200, guns: true, cd: 0.9 },
  warden: { hp: 10, r: 16, hit: 14, sc: 320, guns: true, cd: 2.8, armored: true },
  minelayer: { hp: 7, r: 15, hit: 13, sc: 240, guns: true, cd: 2.2 },
  carrier: { hp: 20, r: 26, hit: 23, sc: 520, guns: true, cd: 3.2, armored: true },
  ram: { hp: 9, r: 16, hit: 13, sc: 230, guns: false },
  sniper: { hp: 5, r: 15, hit: 12, sc: 300, guns: true, cd: 3.6 },
  shieldbreaker: { hp: 8, r: 17, hit: 14, sc: 340, guns: true, cd: 3.2, armored: true },
  /* v4.0 — the second generation. Kept in parity with index.html's FOES by
     tests/golden.test.ts, which extracts the live table and fails loudly on
     drift (same discipline as tools/econsim.js). */
  hound: { hp: 4, r: 13, hit: 11, sc: 170, guns: false },
  weeper: { hp: 5, r: 15, hit: 13, sc: 260, guns: true, cd: 3.0 },
  tender: { hp: 6, r: 14, hit: 12, sc: 380, guns: true, cd: 2.6 },
  ravager: { hp: 12, r: 19, hit: 17, sc: 420, guns: true, cd: 2.2, armored: true },
  arbalest: { hp: 7, r: 17, hit: 15, sc: 350, guns: true, cd: 3.8 },
  mimic: { hp: 8, r: 16, hit: 14, sc: 400, guns: true, cd: 2.0 },
};

export const FOE_IDS = Object.keys(FOES) as readonly string[];

/* ── the pilot's weapon ladder — the live fire model ──
   Parity source: index.html `WEAPONS` (tests/golden.test.ts extracts the
   table and compares). `lanes` are [dx, ang] pairs: muzzle offset in
   logical px, angle in radians (0 = straight, positive = right).
   `rate` is the fire interval in seconds; `dmg` multiplies the pilot's
   damage stat. The prism lance (seraph) is a separate continuous-beam
   model and intentionally absent here. */
export type WeaponTier = {
  lanes: readonly (readonly [number, number])[];
  rate: number;
  dmg: number;
};

export const WEAPONS: readonly (WeaponTier | null)[] = [
  null,
  { lanes: [[0, 0]], rate: 0.155, dmg: 1 },
  { lanes: [[-7, 0], [7, 0]], rate: 0.15, dmg: 1 },
  { lanes: [[0, 0], [-10, -0.07], [10, 0.07]], rate: 0.145, dmg: 1 },
  { lanes: [[-5, 0], [5, 0], [-13, -0.13], [13, 0.13]], rate: 0.135, dmg: 1.05 },
  { lanes: [[0, 0], [-7, -0.05], [7, 0.05], [-15, -0.17], [15, 0.17]], rate: 0.128, dmg: 1.1 },
  { lanes: [[0, 0], [-6, -0.03], [6, 0.03], [-13, -0.13], [13, 0.13], [-20, -0.26], [20, 0.26]], rate: 0.12, dmg: 1.15 },
];

export const MAX_WEAPON = WEAPONS.length - 1;

/* overdrive multipliers — index.html firePrimary: rate ×0.68, dmg ×1.15 */
export const OVER_RATE = 0.68;
export const OVER_DMG = 1.15;
/** player bolt speed (logical px/s) — index.html firePrimary */
export const BOLT_SPEED = 1020;

export type BossDef = {
  id: string;
  name: string;
  art: string;
};

/** Boss identity table — pattern logic stays in step until full extract. */
export const BOSSES: readonly BossDef[] = [
  { id: 'dreadnought', name: 'Dreadnought', art: 'dreadnought' },
  { id: 'matriarch', name: 'Hive Matriarch', art: 'matriarch' },
  { id: 'tyrant', name: 'Solar Tyrant', art: 'tyrant' },
  { id: 'gatewarden', name: 'Gate Warden', art: 'gatewarden' },
  { id: 'wardenfall', name: 'Wardenfall', art: 'wardenfall' },
];

export type BoonDef = {
  id: string;
  name: string;
  desc: string;
};

export const BOONS: readonly BoonDef[] = [
  { id: 'coils', name: 'Overcharged coils', desc: 'Fire 18% faster for the rest of the run.' },
  { id: 'plating', name: 'Nano plating', desc: 'One more hull, right now.' },
  { id: 'phase', name: 'Phase engine', desc: 'Dash charges rebuild 30% faster.' },
  { id: 'salvage', name: 'Salvage rig', desc: '+30% alloy from everything this run.' },
  { id: 'volatile', name: 'Volatile rounds', desc: 'All guns hit 25% harder.' },
  { id: 'aegis', name: 'Aegis cache', desc: 'A shield now — and it rebuilds itself if lost.' },
  { id: 'magnetics', name: 'Magnetics', desc: 'Salvage reaches you from much further out.' },
  { id: 'cache', name: 'Ember cache', desc: 'Two nova pulses, immediately.' },
  { id: 'graze', name: 'Kill instinct', desc: 'Grazes score three times as much.' },
];

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

export const DIFF: readonly DiffDef[] = [
  { name: 'Cozy', bulletSpd: 0.74, fireRate: 1.8, hp: 0.78, spawn: 0.72, score: 0.7, lives: 1, grace: 1.9, cozy: true },
  { name: 'Cadet', bulletSpd: 0.82, fireRate: 1.35, hp: 0.82, spawn: 0.85, score: 0.8, lives: 1, grace: 1.5 },
  { name: 'Pilot', bulletSpd: 1, fireRate: 1, hp: 1, spawn: 1, score: 1, lives: 0, grace: 1 },
  { name: 'Ace', bulletSpd: 1.14, fireRate: 0.8, hp: 1.22, spawn: 1.18, score: 1.35, lives: 0, grace: 0.8 },
  { name: 'Nightmare', bulletSpd: 1.3, fireRate: 0.64, hp: 1.5, spawn: 1.4, score: 1.9, lives: -1, grace: 0.62 },
];
