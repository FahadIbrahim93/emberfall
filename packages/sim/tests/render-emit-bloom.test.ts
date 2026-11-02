import { describe, it, expect } from 'vitest';
import {
  emit,
  bloomBegin,
  bloomComposite,
  isDirty,
  type EmitBloomHost,
} from '../src/render-emit-bloom';
import type { QualityTier } from '../src/render-core';

/* These tests run through the thin adapter over js/render-emit-bloom.js —
   the file the live client loads (ADR 0003). Expectations here are the
   CLIENT's truth; CI fails if the client and the package ever diverge.

   The runtime itself is DOM-free: contexts and canvases arrive through the
   host accessors, so plain recording stubs are enough — no document needed
   and every branch below actually executes under Node. */

interface Op { kind: string; args: unknown[]; filter: string; alpha: number }
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
  const c: StubCtx = {
    canvas: null,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    ops: [],
    drawImage(...args: unknown[]) { c.ops.push({ kind: 'drawImage', args, filter: c.filter, alpha: c.globalAlpha }); },
    setTransform(...args: unknown[]) { c.ops.push({ kind: 'setTransform', args, filter: c.filter, alpha: c.globalAlpha }); },
    clearRect(...args: unknown[]) { c.ops.push({ kind: 'clearRect', args, filter: c.filter, alpha: c.globalAlpha }); },
    save() { c.ops.push({ kind: 'save', args: [], filter: c.filter, alpha: c.globalAlpha }); },
    restore() { c.ops.push({ kind: 'restore', args: [], filter: c.filter, alpha: c.globalAlpha }); }
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

const FULL: QualityTier = { bloom: true, particles: 1, maxParticles: 1000, streaks: true, scale: 1, debris: true };
const NOBLOOM: QualityTier = { bloom: false, particles: 1, maxParticles: 1000, streaks: true, scale: 1, debris: true };

function makeHost(over: Partial<EmitBloomHost> = {}) {
  const bloomCv = stubCanvas();
  bloomCv.width = 640; bloomCv.height = 360;
  const host: EmitBloomHost = Object.assign(
    {
      QUALITY: FULL,
      BLOOM_DIV: 3,
      CAN_FILTER: true,
      W: 1920,
      H: 1080,
      ctx: stubCtx() as CanvasRenderingContext2D,
      bctx: stubCtx() as CanvasRenderingContext2D,
      bloomCv,
      makeCanvas: stubCanvas
    },
    over,
  ) as EmitBloomHost;
  /* the runtime reads b.canvas for the buffer geometry (index.html wires
     bctx to bloomCv the same way) */
  (host.bctx as unknown as StubCtx).canvas = bloomCv;
  return host;
}

describe('single-path emit+bloom — wiring', () => {
  it('the live runtime registered EB on this scope', () => {
    expect(typeof (globalThis as { EB?: { make?: unknown } }).EB).toBe('object');
    expect(typeof (globalThis as { EB?: { make?: unknown } }).EB!.make).toBe('function');
  });
});

describe('single-path emit+bloom — emit', () => {
  it('draws to the main canvas and the quarter buffer scaled by BLOOM_DIV', () => {
    const h = makeHost();
    const spr = stubCanvas();
    emit(h, spr, 100, 100, 32, 0.6);

    const main = draws(h.ctx as unknown as StubCtx);
    expect(main.length).toBe(1);
    expect(main[0].args).toEqual([spr, 84, 84, 32, 32]);
    expect(h.ctx.globalAlpha).toBe(1);

    const k = 1 / 3;                                        /* BLOOM_DIV */
    const buf = draws(h.bctx as unknown as StubCtx);
    expect(buf.length).toBe(1);
    expect(buf[0].args).toEqual([spr, 84 * k, 84 * k, 32 * k, 32 * k]);
    expect(buf[0].alpha).toBe(0.85 * 0.6);
    expect(isDirty(h)).toBe(true);
  });

  it('bloom off: only the main canvas is touched, the buffer stays clean', () => {
    const h = makeHost({ QUALITY: NOBLOOM });
    emit(h, stubCanvas(), 100, 100, 32, 0.6);
    expect(draws(h.ctx as unknown as StubCtx).length).toBe(1);
    expect(draws(h.bctx as unknown as StubCtx).length).toBe(0);
    expect(isDirty(h)).toBe(false);
  });
});

describe('single-path emit+bloom — bloomBegin', () => {
  it('clears the buffer at its natural size, switches to lighter, resets the flag', () => {
    const h = makeHost();
    emit(h, stubCanvas(), 50, 50, 20, 1);
    bloomBegin(h);

    const cleared = (h.bctx as unknown as StubCtx).ops.find((o) => o.kind === 'clearRect');
    expect(cleared!.args).toEqual([0, 0, 640, 360]);
    expect(h.bctx.globalCompositeOperation).toBe('lighter');
    expect(isDirty(h)).toBe(false);
  });

  it('bloom off is a full no-op: the buffer context is never touched', () => {
    const h = makeHost({ QUALITY: NOBLOOM });
    bloomBegin(h);
    expect((h.bctx as unknown as StubCtx).ops.length).toBe(0);
    expect(isDirty(h)).toBe(false);
  });
});

describe('single-path emit+bloom — bloomComposite gating', () => {
  it('no-op when the buffer is not dirty: the main canvas gets nothing', () => {
    const h = makeHost();
    bloomComposite(h);
    expect((h.ctx as unknown as StubCtx).ops.length).toBe(0);
  });

  it('no-op when bloom is off even if the buffer was dirtied previously', () => {
    const h = makeHost({ QUALITY: NOBLOOM });
    emit(h, stubCanvas(), 0, 0, 10, 1);          /* draws, but never dirties */
    bloomComposite(h);
    expect((h.ctx as unknown as StubCtx).ops.length).toBe(1);
  });
});

describe('single-path emit+bloom — two-stage composite (CAN_FILTER)', () => {
  it('tight core at .5, wide halo at .28, exact blur radii, saved state restored', () => {
    const h = makeHost();                            /* BLOOM_DIV 3 → 3.5px and 14px */
    emit(h, stubCanvas(), 0, 0, 10, 1);
    const base = draws(h.ctx as unknown as StubCtx).length;   /* emit's own main-canvas draw */
    bloomComposite(h);
    const ctx = h.ctx as unknown as StubCtx;

    const d = draws(ctx);
    expect(d.length).toBe(base + 2);
    const [core, halo] = d.slice(base);
    expect(core.filter).toBe('blur(3.5px)');
    expect(core.alpha).toBe(0.5);
    expect(core.args).toEqual([h.bloomCv, 0, 0, h.W, h.H]);
    expect(halo.filter).toBe('blur(14.0px)');   /* (14/3*3).toFixed(1) — what the client actually emits */
    expect(halo.alpha).toBe(0.28);
    expect(ctx.filter).toBe('none');
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.ops.some((o) => o.kind === 'save')).toBe(true);
    expect(ctx.ops.some((o) => o.kind === 'restore')).toBe(true);
  });

  it('the first stage composites from the quarter buffer, the second from the half-size cut', () => {
    const created: StubCanvas[] = [];
    const h = makeHost({ makeCanvas: () => { const c = stubCanvas(); created.push(c); return c; } });
    emit(h, stubCanvas(), 0, 0, 10, 1);
    const base2 = draws(h.ctx as unknown as StubCtx).length;
    bloomComposite(h);

    expect(created.length).toBe(1);
    expect(created[0].width).toBe(320);
    expect(created[0].height).toBe(180);
    const d0 = draws(h.ctx as unknown as StubCtx).slice(base2);
    expect(d0.length).toBe(2);
    expect((d0[0].args[0] as unknown) === h.bloomCv).toBe(true);
    expect((d0[1].args[0] as unknown) === created[0]).toBe(true);

    /* the second stage drew a 2px-blurred copy of the full buffer at that size */
    const d2 = draws(created[0].ctx);
    expect(d2.length).toBe(1);
    expect(d2[0].args).toEqual([h.bloomCv, 0, 0, 320, 180]);
    expect(d2[0].filter).toBe('blur(2px)');
    expect(created[0].ctx.filter).toBe('none');  /* filter cleared after the pass */
  });

  it('resizes the second canvas when buffer geometry changes, reuses it otherwise', () => {
    const created: StubCanvas[] = [];
    const h = makeHost({ makeCanvas: () => { const c = stubCanvas(); created.push(c); return c; } });
    emit(h, stubCanvas(), 0, 0, 10, 1);
    bloomComposite(h);
    created[0].width = 320; created[0].height = 180;   /* already matches */
    bloomBegin(h);
    emit(h, stubCanvas(), 0, 0, 10, 1);
    bloomComposite(h);
    expect(created.length).toBe(1);                    /* same single canvas reused */
  });
});

describe('single-path emit+bloom — no-filter fallback', () => {
  it('stacks both halo passes on the same buffer at .55 / .28 with no canvas filters', () => {
    const h = makeHost({ CAN_FILTER: false });
    emit(h, stubCanvas(), 0, 0, 10, 1);
    const base3 = draws(h.ctx as unknown as StubCtx).length;   /* emit's own draw */
    bloomComposite(h);
    const ctx = h.ctx as unknown as StubCtx;

    const d = draws(ctx);
    expect(d.length).toBe(base3 + 2);
    const [first, second] = d.slice(base3);
    expect(first.args).toEqual([h.bloomCv, 0, 0, h.W, h.H]);
    expect(first.alpha).toBe(0.55);
    expect(second.args).toEqual([h.bloomCv, 0, 0, h.W, h.H]);
    expect(second.alpha).toBe(0.28);
    expect(d.every((x) => x.filter === 'none')).toBe(true);
    expect(ctx.filter).toBe('none');
  });
});
