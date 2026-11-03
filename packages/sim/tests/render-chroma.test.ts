import { describe, it, expect } from 'vitest';
import { applyChroma, type RenderChromaHost } from '../src/render-chroma';

/* These tests run through the thin adapter over js/render-chroma.js — the
   file the live client loads (ADR 0003). Expectations here are the CLIENT's
   truth; CI fails if the client and the package ever diverge.

   The runtime is DOM-free: contexts and canvases arrive through the host
   accessors, so plain recording stubs are enough and every branch executes
   under Node. */

interface Op { kind: string; args: unknown[]; filter: string; alpha: number; composite: string }
interface StubCtx {
  canvas: unknown;
  globalAlpha: number;
  globalCompositeOperation: string;
  filter: string;
  ops: Op[];
  drawImage(...args: unknown[]): void;
  setTransform(...args: unknown[]): void;
  clearRect(...args: unknown[]): void;
  save(): void;
  restore(): void;
}

function stubCtx(): StubCtx {
  /* save/restore ACTUALLY restore state — like a real canvas context — so
     post-restore assertions assert client behavior, not stub amnesia. */
  const stack: { filter: string; alpha: number; composite: string }[] = [];
  const c: StubCtx = {
    canvas: null,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    ops: [],
    drawImage(...args: unknown[]) {
      c.ops.push({ kind: 'drawImage', args, filter: c.filter, alpha: c.globalAlpha, composite: c.globalCompositeOperation });
    },
    setTransform(...args: unknown[]) { c.ops.push({ kind: 'setTransform', args, filter: c.filter, alpha: c.globalAlpha, composite: c.globalCompositeOperation }); },
    clearRect(...args: unknown[]) { c.ops.push({ kind: 'clearRect', args, filter: c.filter, alpha: c.globalAlpha, composite: c.globalCompositeOperation }); },
    save() {
      stack.push({ filter: c.filter, alpha: c.globalAlpha, composite: c.globalCompositeOperation });
      c.ops.push({ kind: 'save', args: [], filter: c.filter, alpha: c.globalAlpha, composite: c.globalCompositeOperation });
    },
    restore() {
      const s = stack.pop();
      if (s) { c.filter = s.filter; c.globalAlpha = s.alpha; c.globalCompositeOperation = s.composite; }
      c.ops.push({ kind: 'restore', args: [], filter: c.filter, alpha: c.globalAlpha, composite: c.globalCompositeOperation });
    }
  };
  return c;
}

type StubCanvas = HTMLCanvasElement & { ctx: StubCtx };
function stubCanvas(): StubCanvas {
  const c = { width: 0, height: 0 } as StubCanvas;
  const ctx = stubCtx();
  ctx.canvas = c;
  c.getContext = (() => ctx) as unknown as StubCanvas['getContext'];
  c.ctx = ctx;
  return c;
}

const draws = (c: StubCtx) => c.ops.filter((o) => o.kind === 'drawImage');

function makeHost(over: Partial<RenderChromaHost> & { enabled?: boolean; W?: number; H?: number } = {}) {
  const cv = stubCanvas();
  const chromaCv = stubCanvas();
  cv.width = 1920; cv.height = 1080;
  const h: RenderChromaHost = Object.assign(
    {
      ctx: stubCtx() as CanvasRenderingContext2D,
      cv,
      chromaCv,
      chromaCtx: (chromaCv as any).ctx as CanvasRenderingContext2D,
      W: 1920,
      H: 1080,
      enabled: true,
      ramp: 0.3
    },
    over,
  ) as RenderChromaHost;
  (h.chromaCtx as unknown as StubCtx).canvas = chromaCv;
  return h;
}

describe('single-path chroma — wiring', () => {
  it('the live runtime registered CH on this scope', () => {
    expect(typeof (globalThis as { CH?: { make?: unknown } }).CH).toBe('object');
    expect(typeof (globalThis as { CH?: { make?: unknown } }).CH!.make).toBe('function');
  });
});

describe('single-path chroma — gating', () => {
  it('disabled pass does absolutely nothing: no reads, no writes, no ops', () => {
    const h = makeHost({ enabled: false });
    applyChroma(h);
    expect((h.ctx as unknown as StubCtx).ops.length).toBe(0);
    expect((h.chromaCtx as unknown as StubCtx).ops.length).toBe(0);
    expect(h.chromaCv.width).toBe(0);          /* buffer untouched */
  });
});

describe('single-path chroma — the pass', () => {
  it('captures the finished frame, then overlays two channel-split ghosts', () => {
    const h = makeHost({ ramp: 0.25 });        /* k = 0.55 */
    applyChroma(h);
    const ctx = h.ctx as unknown as StubCtx;
    const cap = (h.chromaCv as StubCanvas).ctx;

    /* capture: identity transform, clear, blit main canvas at natural size */
    const capOps = cap.ops;
    expect(capOps.some((o) => o.kind === 'setTransform' && o.args[0] === 1)).toBe(true);
    expect(capOps.some((o) => o.kind === 'clearRect' && o.args[2] === 1920 && o.args[3] === 1080)).toBe(true);
    const capDraw = draws(cap);
    expect(capDraw.length).toBe(1);
    expect(capDraw[0].args).toEqual([h.cv, 0, 0]);
    expect(capDraw[0].composite).toBe('source-over');

    /* output: save, lighter, two sepia ghosts at ±k, restore */
    expect(ctx.ops.some((o) => o.kind === 'save')).toBe(true);
    expect(ctx.ops.some((o) => o.kind === 'restore')).toBe(true);
    const out = draws(ctx);
    expect(out.length).toBe(2);
    expect(out[0].composite).toBe('lighter');
    expect(out[0].alpha).toBeCloseTo(0.22, 12);  /* min(.5, 0.55*.4) — float rounding */
    expect(out[0].filter).toBe('sepia(1) saturate(6) hue-rotate(-25deg)');
    expect(out[0].args).toEqual([h.chromaCv, -0.55, 0, 1920, 1080]);
    expect(out[1].filter).toBe('sepia(1) saturate(6) hue-rotate(140deg)');
    expect(out[1].args).toEqual([h.chromaCv, 0.55, 0, 1920, 1080]);
    expect(ctx.filter).toBe('none');           /* cleared after the pass */
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.globalAlpha).toBe(1);
  });

  it('ghost alpha clamps at .5 for strong ramps', () => {
    const h = makeHost({ ramp: 1.5 });         /* k = 3.3 → k*.4 = 1.32 */
    applyChroma(h);
    expect(draws(h.ctx as unknown as StubCtx)[0].alpha).toBe(0.5);
  });

  it('resizes the capture buffer only when the frame geometry changed', () => {
    const h = makeHost({ W: 800, H: 600 });
    h.chromaCv.width = 800; h.chromaCv.height = 600;   /* already matches */
    applyChroma(h);
    expect(h.chromaCv.width).toBe(800);

    const h2 = makeHost({ W: 800, H: 600 });           /* 0×0 → must resize */
    applyChroma(h2);
    expect(h2.chromaCv.width).toBe(800);
    expect(h2.chromaCv.height).toBe(600);
  });
});
