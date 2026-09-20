/** Pure sim types — no DOM. */

export type SimMode = 'endless' | 'daily' | 'rush' | 'tour' | 'school';

export type InputFrame = {
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

export type Foe = {
  id: number;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  r: number;
  hitR: number;
  sc: number;
  state: 'enter' | 'hold' | 'dive' | 'dead';
  t: number;
  et: number;
  ht: number;
  ph: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  swa: number;
  swf: number;
  guns: boolean;
  cd: number;
  fireT: number;
  bspd: number;
  armored: boolean;
  dead: boolean;
  elite: boolean;
};

export type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  dmg?: number;
  grazed?: boolean;
  kind: string;
  ang?: number;
  friendly: boolean;
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
  hits: number;
  shots: number;
  grazes: number;
  deaths: number;
  bombsUsed: number;
  wave: number;
  lives: number;
  grazeHeat: number;
  endT: number;
  player: PlayerState;
  foes: Foe[];
  playerBullets: Bullet[];
  foeBullets: Bullet[];
  nextId: number;
  dirT: number;
  dirPhase: 'combat' | 'rest';
  dirRestT: number;
  spawnQueue: { t: number; type: string; x: number; y: number }[];
  log: InputFrame[];
};
