/**
 * Thin adapter (ADR 0003): the single-path hazards runtime lives in
 * ../../../js/hazards.js — the exact file the client loads as a classic
 * script. This module owns NO physics, NO tables, NO behavior. The
 * side-effect import executes the live runtime, which self-registers as
 * `window.HZ` in the browser and `globalThis.HZ` under Node test runners —
 * so tests and goldens run the literal bytes the player executes.
 */
import '../../../js/hazards.js';

export interface StageLike {
  haz?: string;
  hazK?: number;
}

interface HZWell { x: number; y: number; k: number }
interface HZFlare { x: number; t: number; life: number; warn: number; w: number; y: number }
interface HZCloud { x: number; y: number; vx: number; w: number; a: number }

interface HazardsInstance {
  active: any;
  k: number;
  wl: HZWell[] | null;
  t: number;
  strikeT: number;
  strikeFlash: number;
  strikeX: number;
  nextStrike: number;
  flares: HZFlare[];
  clouds: HZCloud[];
  begin(): void;
  stop(): void;
  update(dt: number): void;
  pull(x: number, y: number, out: { ax: number; ay: number } | null): { ax: number; ay: number } | null;
  seekMul(): number;
  dashMul(): number;
  drawBack(): void;
  drawFront(): void;
}

interface HZModule {
  defs: Record<string, {
    name: string;
    tip: string;
    wells?: (st: StageLike, host: unknown) => HZWell[];
    strikeEvery?: (st: StageLike) => number;
    seekMul?: (st: StageLike) => number;
    dashMul: () => number;
  }>;
  make(host: {
    W: () => number; H: () => number; STAGE: () => StageLike | null; REDUCE: () => boolean;
    now: () => number; ctx: () => CanvasRenderingContext2D | null; PAL_tech: () => string;
    rnd: (lo: number, hi: number) => number;
    mode: () => string; school: () => boolean;
    canHit: () => boolean; pX: () => number; pY: () => number;
    showCodex: (key: string, title: string, body: string) => void;
    hurtPlayer: (src: { x: number; y: number; r: number }) => void;
  }): HazardsInstance;
  makeScratch(): { ax: number; ay: number };
}

const HZ: HZModule = (globalThis as unknown as { HZ: HZModule }).HZ;
if (!HZ) throw new Error('single-path wiring broken: js/hazards.js did not register HZ');

export const HAZARDS = HZ.defs;

export interface HazardsHost {
  STAGE: StageLike | null;
  GAME_mode: string;
  GAME_school: boolean;
  W: number;
  H: number;
  ctx: CanvasRenderingContext2D | null;
  PAL_tech: string;
  t: number;
  REDUCE: boolean;
  rnd: (lo: number, hi: number) => number;
  clamp: (v: number, lo: number, hi: number) => number;
  showCodex: (key: string, title: string, body: string) => void;
  canHit?: () => boolean;
  pX?: () => number;
  pY?: () => number;
  hurtPlayer?: (src: { x: number; y: number; r: number }) => void;
  /* attached by makeHost: the live module instance (state at top level) */
  inst: HazardsInstance;
}

export const makeHazardsScratch = () => HZ.makeScratch();

/* The client's shared pull scratch (index.html: `const HZPULL = {ax:0,ay:0}`) —
   one module-level vec, mutated in place, so per-bullet calls never allocate. */
export const HZPULL: { ax: number; ay: number } = makeHazardsScratch();

function inst(h: HazardsHost): HazardsInstance {
  const rec = h as unknown as { __hz?: HazardsInstance };
  if (!rec.__hz) {
    rec.__hz = HZ.make({
      W: () => h.W,
      H: () => h.H,
      STAGE: () => h.STAGE,
      REDUCE: () => h.REDUCE,
      now: () => h.t,
      ctx: () => h.ctx,
      PAL_tech: () => h.PAL_tech,
      rnd: h.rnd,
      mode: () => h.GAME_mode,
      school: () => h.GAME_school,
      canHit: () => (h.canHit ? h.canHit() : false),
      pX: () => (h.pX ? h.pX() : 0),
      pY: () => (h.pY ? h.pY() : 0),
      showCodex: (k, n, tip) => h.showCodex(k, n, tip),
      hurtPlayer: (src) => { if (h.hurtPlayer) h.hurtPlayer(src); }
    });
  }
  return rec.__hz;
}

export function makeHost(opts: Partial<HazardsHost> = {}): HazardsHost {
  const host = Object.assign(
    {
      STAGE: null,
      GAME_mode: '',
      GAME_school: false,
      W: 1920,
      H: 1080,
      ctx: null as CanvasRenderingContext2D | null,
      PAL_tech: '#ffffff',
      t: 0,
      REDUCE: false,
      rnd: () => 0,
      clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
      showCodex: () => {},
      canHit: undefined,
      pX: undefined,
      pY: undefined,
      hurtPlayer: undefined
    } as HazardsHost,
    opts,
  ) as HazardsHost;

  host.inst = inst(host);
  return host;
}

export function beginHazards(h: HazardsHost): void { inst(h).begin(); }
export function stopHazards(h: HazardsHost): void { inst(h).stop(); }
export function updateHazards(h: HazardsHost, dt: number): void { inst(h).update(dt); }
export function pullHazards(
  h: HazardsHost,
  x: number,
  y: number,
  out: { ax: number; ay: number } | null,
): { ax: number; ay: number } | null {
  return inst(h).pull(x, y, out);
}
export function seekMulHazards(h: HazardsHost): number { return inst(h).seekMul(); }
export function dashMulHazards(h: HazardsHost): number { return inst(h).dashMul(); }
export function drawBackHazards(h: HazardsHost): void { inst(h).drawBack(); }
export function drawFrontHazards(h: HazardsHost): void { inst(h).drawFront(); }
export function renderHazards(h: HazardsHost): void {
  inst(h).drawBack();
  inst(h).drawFront();
}
