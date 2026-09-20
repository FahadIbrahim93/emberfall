/** Pure sim types — no DOM. */

export type SimMode = 'endless' | 'daily' | 'rush' | 'tour' | 'school';

export type InputFrame = {
  /** Normalized move vector, length ≤ 1. */
  mx: number;
  my: number;
  fire: boolean;
  dash: boolean;
  pulse: boolean;
};

export type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  inv: number;
  r: number;
  fireCd: number;
  weapon: number;
  dashT: number;
  dashCd: number;
  charges: number;
  maxCharges: number;
  bombs: number;
  shield: number;
  shieldMax: number;
  overT: number;
  thrust: number;
  dmg: number;
  speed: number;
  grazeMul: number;
  scoreMul: number;
  rateMul: number;
  dashMul: number;
  alloyMul: number;
  magMul: number;
  beam: boolean;
  heat: number;
  boonIds: string[];
};

export type World = {
  seed: number;
  mode: SimMode;
  hullId: string;
  difficulty: number;
  state: 'playing' | 'ended' | 'boon';
  runT: number;
  score: number;
  combo: number;
  comboT: number;
  mult: number;
  maxMult: number;
  kills: number;
  grazes: number;
  deaths: number;
  bombsUsed: number;
  wave: number;
  lives: number;
  grazeHeat: number;
  endT: number;
  player: PlayerState;
  /** Ring buffer of input frames for replay (one per sim step). */
  log: InputFrame[];
};
