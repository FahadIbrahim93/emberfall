/**
 * Render core — canvas setup, bloom buffer, quality ladder, resize.
 *
 * Owns:
 * - the main canvas element reference and its 2d context
 * - the quarter-res bloom buffer and its context
 * - the chroma offscreen buffer (reads from main canvas, writes to main canvas)
 * - the quality ladder and auto-quality
 * - resize: canvas size, DPR, transforms, bloom/chroma buffer sizing
 *
 * Does NOT own:
 * - the scene content (backdrop, entities, effects)
 * - palette, settings, or game state
 * - sprite building (that lives beside this module)
 *
 * Contract:
 * - `cv` is the main canvas element (passed in by the host).
 * - `buildBackdrop` and `seedStars` are supplied by the host for resize side-effects.
 * - `PAL` and `CFG` are host-provided; this module only reads `CFG.quality`.
 */

export interface QualityTier {
  bloom: boolean;
  particles: number;
  maxParticles: number;
  streaks: boolean;
  scale: number;
  debris: boolean;
}

export interface RenderCoreOptions {
  /** The main canvas element ($('game')). */
  cv: HTMLCanvasElement;
  /** Palette used for sprite generation (read-only for this module). */
  pal: { hull: string; ally: string; foe: string; tech: string; good: string; rare: string; gold: string };
  /** Settings object; only CFG.quality is read. */
  cfg: { quality: number };
  /** Called on resize after buffers are sized. */
  buildBackdrop: () => void;
  /** Called on resize to reseed the starfield. */
  seedStars: () => void;
}

export interface RenderCoreState {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  bloomCv: HTMLCanvasElement;
  bctx: CanvasRenderingContext2D;
  chromaCv: HTMLCanvasElement;
  chromaCtx: CanvasRenderingContext2D;
  bloomCv2: HTMLCanvasElement;
  bctx2: CanvasRenderingContext2D;
  W: number;
  H: number;
  DPR: number;
  RSCALE: number;
  CAN_FILTER: boolean;
  QUALITY: QualityTier;
  BLOOM_DIV: number;
  autoLevel: number;
  qualityFor: (level: number) => QualityTier;
  applyQuality: () => void;
  resize: () => void;
}

export function createRenderCore(opts: RenderCoreOptions): RenderCoreState {
  const cv = opts.cv;
  const ctx = cv.getContext('2d', { alpha: false, desynchronized: true });
  const bloomCv = document.createElement('canvas');
  const bctx = bloomCv.getContext('2d');
  const CAN_FILTER = typeof bctx.filter === 'string';

  // offscreen buffer for the chroma aberration pass — drawing the main canvas
  // onto itself with a filter + lighter composite is unreliable across browsers
  // (Chrome in particular can drop or smear frames when src == dst). One extra
  // blit per flash frame, zero cost when there is no chroma active.
  const chromaCv = document.createElement('canvas');
  const chromaCtx = chromaCv.getContext('2d') as CanvasRenderingContext2D;

  let W = 1;
  let H = 1;
  let DPR = 1;
  let RSCALE = 1;

  const BLOOM_DIV = 3;

  const QUALITY: QualityTier = {
    bloom: true,
    particles: 1,
    maxParticles: 900,
    streaks: true,
    scale: 1,
    debris: true,
  };

  let autoLevel = 2;

  const bloomCv2 = document.createElement('canvas');
  const bctx2 = bloomCv2.getContext('2d');

  function qualityFor(level: number): QualityTier {
    if (level === 0) return { bloom: false, particles: 0.45, maxParticles: 260, streaks: false, scale: 0.68, debris: false };
    if (level === 1) return { bloom: CAN_FILTER, particles: 0.75, maxParticles: 520, streaks: true, scale: 0.85, debris: true };
    return { bloom: CAN_FILTER, particles: 1, maxParticles: 1000, streaks: true, scale: 1, debris: true };
  }

  function applyQuality() {
    const lvl = opts.cfg.quality === 3 ? autoLevel : opts.cfg.quality;
    Object.assign(QUALITY, qualityFor(lvl));
    resize();
  }

  function resize() {
    const r = cv.getBoundingClientRect();
    // The original inline code falls back to innerWidth/innerHeight when getBoundingClientRect
    // returns zero — preserve that behaviour so resize stays behaviour-compatible.
    const width = r.width || (typeof window !== 'undefined' ? window.innerWidth : 0);
    const height = r.height || (typeof window !== 'undefined' ? window.innerHeight : 0);
    W = Math.max(320, Math.round(width));
    H = Math.max(240, Math.round(height));
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio != null) ? window.devicePixelRatio : 1;
    DPR = Math.min(dpr, 2) * QUALITY.scale;
    RSCALE = DPR;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
    bloomCv.width = Math.max(1, Math.round(W / BLOOM_DIV));
    bloomCv.height = Math.max(1, Math.round(H / BLOOM_DIV));
    if (chromaCv.width !== W || chromaCv.height !== H) {
      chromaCv.width = W;
      chromaCv.height = H;
    }
    opts.buildBackdrop();
    opts.seedStars();
    const needRotate = H < 300 && W < 480;
    document.body.classList.toggle('needrotate', needRotate);
  }

  return {
    cv,
    ctx,
    bloomCv,
    bctx,
    chromaCv,
    chromaCtx,
    bloomCv2,
    bctx2,
    W,
    H,
    DPR,
    RSCALE,
    CAN_FILTER,
    QUALITY,
    BLOOM_DIV,
    autoLevel,
    qualityFor,
    applyQuality,
    resize,
  };
}

/**
 * Radial sprite generator — pure function, used by sprite building.
 */
export function radialSprite(rgb: string, size: number, coreStop?: number, coreAlpha?: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,' + (coreAlpha == null ? 1 : coreAlpha) + ')');
  g.addColorStop(coreStop || 0.22, 'rgba(' + rgb + ',.88)');
  g.addColorStop(0.62, 'rgba(' + rgb + ',.28)');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbOf(hex: string): string {
  return hexRgb(hex).join(',');
}
