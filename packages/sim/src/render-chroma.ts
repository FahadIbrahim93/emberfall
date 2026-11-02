/**
 * Thin adapter (ADR 0003): the single-path chroma aberration runtime lives in
 * ../../../js/render-chroma.js — the exact file the client loads as a classic
 * script. This module owns NO blitting, NO filter strings, NO gate logic. The
 * side-effect import executes the live runtime, which self-registers as
 * `window.CH` in the browser and `globalThis.CH` under Node test runners —
 * so tests and goldens run the literal bytes the player executes.
 */
import '../../../js/render-chroma.js';

export interface RenderChromaHost {
  /** main canvas 2d context — the pass writes its ghosts here */
  ctx: CanvasRenderingContext2D;
  /** the main canvas element — the pass reads the finished frame from it */
  cv: HTMLCanvasElement;
  /** offscreen capture buffer (only .width/.height are touched) */
  chromaCv: { width: number; height: number };
  /** the capture buffer's 2d context */
  chromaCtx: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** the inline gate: CFG.flash && chromaRamp > .02 && CAN_FILTER && QUALITY.scale > .8 */
  enabled: boolean;
  /** CAM.chromaRamp — the current aberration strength */
  ramp: number;
}

interface CHInstance {
  apply(): void;
}

interface CHModule {
  make(host: {
    ctx: () => CanvasRenderingContext2D;
    cv: () => HTMLCanvasElement;
    chromaCv: () => { width: number; height: number };
    chromaCtx: () => CanvasRenderingContext2D;
    W: () => number; H: () => number;
    enabled: () => boolean;
    ramp: () => number;
  }): CHInstance;
}

const CH = (globalThis as unknown as { CH?: CHModule }).CH;
if (!CH) throw new Error('single-path wiring broken: js/render-chroma.js did not register CH');

function inst(h: RenderChromaHost): CHInstance {
  const rec = h as unknown as { __ch?: CHInstance };
  if (!rec.__ch) {
    rec.__ch = CH.make({
      ctx: () => h.ctx,
      cv: () => h.cv,
      chromaCv: () => h.chromaCv,
      chromaCtx: () => h.chromaCtx,
      W: () => h.W,
      H: () => h.H,
      enabled: () => h.enabled,
      ramp: () => h.ramp
    });
  }
  return rec.__ch;
}

export function applyChroma(h: RenderChromaHost): void { inst(h).apply(); }
