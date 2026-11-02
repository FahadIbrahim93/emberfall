/**
 * Thin adapter (ADR 0003): the single-path render post-FX runtime lives in
 * ../../../js/render-emit-bloom.js — the exact file the client loads as a
 * classic script (emissive emit + two-stage bloom). This module owns NO
 * drawing, NO blur numbers, NO quality tables. The side-effect import
 * executes the live runtime, which self-registers as `window.EB` in the
 * browser and `globalThis.EB` under Node test runners — so tests and
 * goldens run the literal bytes the player executes.
 */
import '../../../js/render-emit-bloom.js';
import type { QualityTier } from './render-core';

export interface EmitBloomHost {
  QUALITY: QualityTier;
  BLOOM_DIV: number;
  CAN_FILTER: boolean;
  W: number;
  H: number;
  ctx: CanvasRenderingContext2D;
  bctx: CanvasRenderingContext2D;
  /** the quarter-res bloom canvas; host-owned, only .width/.height are read */
  bloomCv: { width: number; height: number };
  /** DOM factory for the instance-owned half-size second-stage canvas */
  makeCanvas: () => HTMLCanvasElement;
}

interface EBInstance {
  emit(spr: HTMLCanvasElement, x: number, y: number, size: number, alpha: number): void;
  bloomBegin(): void;
  bloomComposite(): void;
  isDirty(): boolean;
}

interface EBModule {
  make(host: {
    ctx: () => CanvasRenderingContext2D;
    bctx: () => CanvasRenderingContext2D;
    bloomCv: () => { width: number; height: number };
    W: () => number; H: () => number;
    QUALITY: () => QualityTier;
    BLOOM_DIV: () => number;
    CAN_FILTER: () => boolean;
    makeCanvas: () => HTMLCanvasElement;
  }): EBInstance;
}

const EB = (globalThis as unknown as { EB?: EBModule }).EB;
if (!EB) throw new Error('single-path wiring broken: js/render-emit-bloom.js did not register EB');

function inst(h: EmitBloomHost): EBInstance {
  const rec = h as unknown as { __eb?: EBInstance };
  if (!rec.__eb) {
    rec.__eb = EB.make({
      ctx: () => h.ctx,
      bctx: () => h.bctx,
      bloomCv: () => h.bloomCv,
      W: () => h.W,
      H: () => h.H,
      QUALITY: () => h.QUALITY,
      BLOOM_DIV: () => h.BLOOM_DIV,
      CAN_FILTER: () => h.CAN_FILTER,
      makeCanvas: () => h.makeCanvas()
    });
  }
  return rec.__eb;
}

export function emit(h: EmitBloomHost, spr: HTMLCanvasElement, x: number, y: number, size: number, alpha: number): void {
  inst(h).emit(spr, x, y, size, alpha);
}
export function bloomBegin(h: EmitBloomHost): void { inst(h).bloomBegin(); }
export function bloomComposite(h: EmitBloomHost): void { inst(h).bloomComposite(); }
export function isDirty(h: EmitBloomHost): boolean { return inst(h).isDirty(); }
