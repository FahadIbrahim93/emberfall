/**
 * Backdrop — sky rendering: nebula, sun, planet, moon, fleet, debris, stars, Gate.
 *
 * Owns:
 * - nebLayers(tt, W, H): describes the three nebula planes for a given moment
 * - skyTime(t): reduced-motion time (0 when reduced motion is on)
 * - drawBackdrop(ctx, t, opts): the full backdrop draw for one frame
 *
 * Depends on (supplied by host each frame):
 * - ctx: the 2d context to draw into
 * - t: current game time
 * - W, H: canvas size
 * - nebA, nebB: the two nebula offscreen canvases
 * - planet: the gas giant { surf, shade, glow, storm, stormSpin, ring }
 * - moon: the moon { surf, shade, glow }
 * - stars: the current starfield
 * - derelicts: the drifting derelict silhouettes
 * - dust: the debris silhouettes
 * - fleet: the graveyard fleet (or null/empty)
 * - REDUCE: reduced-motion flag
 * - QUALITY: quality settings (streaks, debris)
 * - PAL: palette (tech, rare colours for the Gate)
 * - SPR: sprites (SPR.rare for the Gate glow)
 * - emitLocal: emissive draw helper
 * - TAU: 2π
 * - clamp, rgba: small math helpers
 *
 * Does NOT own:
 * - the game state (GAME, etc.)
 * - the render pipeline around it
 */

import type { QualityTier } from './render-core';

export interface BackdropPlanet {
  surf: HTMLCanvasElement;
  shade: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  storm: HTMLCanvasElement[] | null;
  stormSpin: number[];
  ring: (ctx: CanvasRenderingContext2D, back: boolean, tt: number) => void;
}

export interface BackdropMoon {
  surf: HTMLCanvasElement;
  shade: HTMLCanvasElement;
  glow: HTMLCanvasElement;
}

export interface BackdropDerelict {
  x: number;
  y: number;
  vy: number;
  rot: number;
  rotA: number;
  img: HTMLCanvasElement;
  s: number;
}

export interface BackdropDust {
  x: number;
  y: number;
  rot: number;
  vr: number;
  verts: [number, number][];
  a: number;
}

export interface BackdropFleet {
  on: boolean;
  x: number;
  y: number;
  dur: number;
  life: number;
  ships: Array<{
    ox: number;
    oy: number;
    rot: number;
    img: HTMLCanvasElement;
    a: number;
  }>;
  ember: number;
}

export interface BackdropStar {
  x: number;
  y: number;
  l: number;
  ph: number;
  tw: number;
  c: string;
}

export interface NebulaLayer {
  i: number;
  cx: number;
  cy: number;
  sc: number;
  a: number;
  rot: number;
}

export interface DrawBackdropOpts {
  ctx: CanvasRenderingContext2D;
  t: number;
  W: number;
  H: number;
  nebA: HTMLCanvasElement;
  nebB: HTMLCanvasElement;
  planet: BackdropPlanet;
  moon: BackdropMoon;
  stars: BackdropStar[];
  derelicts: BackdropDerelict[];
  dust: BackdropDust[];
  fleet: BackdropFleet | null;
  REDUCE: boolean;
  QUALITY: QualityTier;
  PAL: { tech: string; rare: string };
  SPR: { rare: HTMLCanvasElement };
  emitLocal: (
    ctx: CanvasRenderingContext2D,
    spr: HTMLCanvasElement,
    x: number,
    y: number,
    size: number,
    alpha: number,
  ) => void;
  TAU: number;
  clamp: (v: number, a: number, b: number) => number;
  rgba: (hex: string, a: number) => string;
}

export function skyTime(t: number, REDUCE: boolean): number {
  // reduced-motion: ambient drift frozen at frame zero
  return REDUCE ? 0 : t;
}

export function nebLayers(tt: number, W: number, H: number): NebulaLayer[] {
  const farH = 512 * 1.9;
  return [
    {
      i: 1,
      cx: W * 0.5,
      cy: ((tt * 3.1 + H * 0.30) % (H + farH)) - farH + 486,
      sc: 1.9,
      a: 0.24 + 0.05 * Math.sin(tt * 0.019 + 1.2),
      rot: -4.5e-4 * tt,
    },
    {
      i: 0,
      cx: W * 0.14 + 20,
      cy: ((tt * 7) % (H + 760)) - 620 + 320,
      sc: 1.25,
      a: 0.44 + 0.06 * Math.sin(tt * 0.031),
      rot: 6e-4 * tt,
    },
    {
      i: 1,
      cx: W * 0.72 + 50,
      cy: ((tt * 4.6 + H * 0.55) % (H + 860)) - 700 + 370,
      sc: 1.45,
      a: 0.33 + 0.05 * Math.sin(tt * 0.026 + 3.1),
      rot: 4.2e-4 * tt,
    },
  ];
}

export function drawBackdrop(o: DrawBackdropOpts): void {
  const ctx = o.ctx;
  const tt = skyTime(o.t, o.REDUCE);

  // nebula drift — three planes, differential parallax, breathing alpha
  for (const L of nebLayers(tt, o.W, o.H)) {
    const img = L.i ? o.nebB : o.nebA;
    const d = 512 * L.sc;
    ctx.save();
    ctx.globalAlpha = L.a;
    ctx.translate(L.cx, L.cy);
    ctx.rotate(L.rot);
    ctx.drawImage(img, -d / 2, -d / 2, d, d);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // derelict silhouettes, slow and deep
  for (const d of o.derelicts) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.scale(d.s, d.s);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(d.img, -d.img.width / 2, -d.img.height / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // the distant sun — a tight glare that justifies the light direction
  const sunX = o.W * 0.05;
  const sunY = o.H * 0.08;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 64);
  gg.addColorStop(0, 'rgba(255,244,224,0.42)');
  gg.addColorStop(0.3, 'rgba(255,244,224,0.09)');
  gg.addColorStop(1, 'rgba(255,244,224,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 64, 0, o.TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,244,224,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sunX - 110, sunY);
  ctx.lineTo(sunX + 110, sunY);
  ctx.moveTo(sunX, sunY - 110);
  ctx.lineTo(sunX, sunY + 110);
  ctx.stroke();
  ctx.restore();

  // the gas giant — huge, low-left, climbing with glacial parallax.
  const ps = Math.max(900, Math.min(o.W, o.H) * 1.5);
  const py = o.H * 1.06 - ((tt * 1.15) % (o.H * 3.2));
  const px = -ps * 0.44;
  ctx.globalAlpha = 0.92;
  o.planet.ring(ctx, true, tt); // far half
  ctx.drawImage(o.planet.surf, px, py);
  if (o.planet.storm) {
    // grand storm, creeping around the disc
    ctx.save();
    ctx.translate(px + ps / 2, py + ps / 2);
    ctx.rotate(tt * 0.0042);
    for (let i = 0; i < o.planet.storm.length; i++) {
      const spin = o.planet.stormSpin[i];
      ctx.save();
      ctx.rotate(spin * tt * 0.0042 * -0.35); // inner ovals counter-drift
      ctx.drawImage(o.planet.storm[i], -ps / 2, -ps / 2);
      ctx.restore();
    }
    ctx.restore();
  }
  const pl = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(o.planet.shade, px, py);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(o.planet.glow, px, py);
  ctx.globalCompositeOperation = pl;
  o.planet.ring(ctx, false, tt); // near half
  ctx.globalAlpha = 1;

  // the moon — a hemisphere arcing across the top third of the arena.
  const ms = Math.min(o.W, o.H) * 2.45;
  const mx = o.W * 0.56 + Math.sin(tt * 0.021) * o.W * 0.05;
  const my = o.H * 0.36 - ms + Math.sin(tt * 0.043) * o.H * 0.012;
  const termRot = tt * 0.00058;
  const moonMaps = (g: CanvasRenderingContext2D, mode: 'multiply' | 'lighter') => {
    g.save();
    g.globalCompositeOperation = mode;
    g.translate(mx, my + ms / 2); // moon surface centre, not its top-left
    g.rotate(termRot);
    g.drawImage(
      mode === 'multiply' ? o.moon.shade : o.moon.glow,
      -ms / 2,
      -ms / 2,
      ms,
      ms,
    );
    g.restore();
  };
  ctx.globalAlpha = 0.95;
  ctx.drawImage(o.moon.surf, mx - ms / 2, my, ms, ms);
  moonMaps(ctx, 'multiply');
  moonMaps(ctx, 'lighter');
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // the graveyard fleet — every few minutes a line of dead warships drifts
  // across the moon's limb.
  if (o.fleet && o.fleet.on) {
    const fc = o.fleet;
    const fa = Math.min(1, (fc.dur - fc.life) * 0.5, fc.life * 0.5); // slow ease
    for (const sh of fc.ships) {
      const sx = fc.x + sh.ox;
      const sy = fc.y + sh.oy;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(sh.rot);
      ctx.globalAlpha = fa * sh.a;
      ctx.drawImage(sh.img, -sh.img.width / 2, -sh.img.height / 2);
      ctx.restore();
    }
    if (fc.ember >= 0 && fc.ember < fc.ships.length) {
      const sh = fc.ships[fc.ember];
      const k = 0.5 + 0.5 * Math.sin(tt * 2.1 + fc.x);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ex = fc.x + sh.ox;
      const ey = fc.y + sh.oy;
      const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 10);
      eg.addColorStop(
        0,
        'rgba(255,120,60,' + (0.3 * fa * (0.5 + k * 0.5)).toFixed(3) + ')',
      );
      eg.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, ey, 10, 0, o.TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // debris silhouettes
  ctx.strokeStyle = 'rgba(150,170,210,0.5)';
  for (const d of o.dust) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.globalAlpha = d.a;
    ctx.fillStyle = '#0a1020';
    ctx.beginPath();
    ctx.moveTo(d.verts[0][0], d.verts[0][1]);
    for (let i = 1; i < d.verts.length; i++) {
      ctx.lineTo(d.verts[i][0], d.verts[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // stars
  for (const s of o.stars) {
    const L = STAR_LAYERS[s.l];
    ctx.globalAlpha = L.a * (0.6 + 0.4 * Math.sin(o.t * s.tw + s.ph));
    ctx.fillStyle = s.c;
    if (o.warp > 0.05 && s.l >= 2 && o.QUALITY.streaks) {
      ctx.fillRect(s.x, s.y, L.sz * 0.75, L.sz + L.sp * o.warp * 0.3);
    } else {
      ctx.fillRect(s.x, s.y, L.sz, L.sz);
    }
  }
  ctx.globalAlpha = 1;

  // the Gate — where the অপার্থিব came through
  const depth = o.clamp((o.GAME?.wave || 0) / 26, 0, 1);
  const gx = o.W / 2;
  const gy = -o.H * 0.1;
  const gR = o.H * (0.15 + 0.1 * depth) * (1 + Math.sin(o.t * 0.7) * 0.045);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(o.t * 0.12 * (i % 2 ? -0.7 : 1) * (1 + i * 0.35));
    ctx.strokeStyle = i === 1 ? o.rgba(o.PAL.tech, 0.3) : o.rgba(o.PAL.rare, 0.34 + 0.1 * i);
    ctx.lineWidth = Math.max(0.8, 2.2 - i * 0.5);
    ctx.setLineDash([gR * (0.8 + i * 0.5), gR * 0.7]);
    ctx.beginPath();
    ctx.arc(0, 0, gR * (1 - i * 0.18), 0, o.TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  o.emitLocal(ctx, o.SPR.rare, gx, gy + gR * 0.12, gR * 2.6, 0.2 + 0.07 * Math.sin(o.t * 0.9) + depth * 0.14);
  ctx.restore();
}

// star layer descriptors — kept here so the host can reuse the same layout
export const STAR_LAYERS = [
  { n: 90, sp: 11, sz: 0.9, a: 0.3 },
  { n: 58, sp: 27, sz: 1.5, a: 0.5 },
  { n: 34, sp: 58, sz: 2.3, a: 0.78 },
  { n: 16, sp: 104, sz: 3.1, a: 1 },
];
