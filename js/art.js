/* ══════════════════════════════════════════════════════════════════════
   ART v3 — steel-and-carapace renderer: materials, hulls, hostiles,
   capitals, pickups. Extracted verbatim from the core (d63a471).
   Load-time pure: declares only — no DOM access, no event listeners.
   Palette reactivity arrives later via buildBackdrop()/palette switch.
   ══════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════
   ART v3 — "steel and carapace"
   Every ship is still pure path work, so it stays crisp at any density and
   recolours instantly when the palette changes. Three rules hold the look
   together:
     · one light, from above and slightly left — lit rim on top, deep
       shadow along the belly, on every hull in the game
     · friendlies are cold machined steel with ember accents; hostiles are
       black chassis under crimson carapace plate with a lit core
     · silhouette first. Every model has to read as itself at 20px on a
       phone, in one colour, before any detail is layered on.
   Gradients are built once and cached per context: a CanvasGradient is
   painted through the live transform, so one object serves every ship at
   every scale. That is what pays for the extra detail.
   ══════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────── geometry ─────────────────────────── */
function poly(g, pts, close) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close !== false) g.closePath();
}
/* half-hull in, symmetric hull out — every ship is authored as one side */
function mirrorPoly(g, half) {
  g.beginPath();
  g.moveTo(half[0][0], half[0][1]);
  for (let i = 1; i < half.length; i++) g.lineTo(half[i][0], half[i][1]);
  for (let i = half.length - 1; i >= 0; i--) g.lineTo(-half[i][0], half[i][1]);
  g.closePath();
}
function lines(g, segs, col, w, alpha) {
  g.strokeStyle = col; g.lineWidth = w == null ? 1 : w;
  if (alpha != null) g.globalAlpha = alpha;
  g.beginPath();
  for (const s of segs) { g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); }
  g.stroke();
  if (alpha != null) g.globalAlpha = 1;
}
function disc(g, x, y, r, col) {
  g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function ringPath(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }

/* ─────────────────────────── colour ─────────────────────────── */
const RGB_MEMO = {};
function rgb3(hex) {
  let v = RGB_MEMO[hex];
  if (!v) v = RGB_MEMO[hex] = hexRgb(hex);
  return v;
}
function rgba(hex, a) {
  const c = rgb3(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}
/* toward white */
function lit(hex, k, a) {
  const c = rgb3(hex);
  return 'rgba(' + Math.round(c[0] + (255 - c[0]) * k) + ',' +
    Math.round(c[1] + (255 - c[1]) * k) + ',' +
    Math.round(c[2] + (255 - c[2]) * k) + ',' + (a == null ? 1 : a) + ')';
}
/* toward the void, so shadows keep the hull's hue instead of going flat grey */
function dark(hex, k, a) {
  const c = rgb3(hex);
  return 'rgba(' + Math.round(c[0] * (1 - k) + 4 * k) + ',' +
    Math.round(c[1] * (1 - k) + 6 * k) + ',' +
    Math.round(c[2] * (1 - k) + 14 * k) + ',' + (a == null ? 1 : a) + ')';
}

/* ─────────────────────── cached gradients ─────────────────────── */
/* Keyed per context so the hangar/codex canvases keep their own set. */
let ART_GRAD = new WeakMap();
function clearArtCache() { ART_GRAD = new WeakMap(); }
function gradFor(g, key, make) {
  let m = ART_GRAD.get(g);
  if (!m) { m = new Map(); ART_GRAD.set(g, m); }
  let v = m.get(key);
  if (!v) { v = make(g); m.set(key, v); }
  return v;
}
function vgrad(g, key, y0, y1, stops) {
  return gradFor(g, key, c => {
    const gr = c.createLinearGradient(0, y0, 0, y1);
    for (const s of stops) gr.addColorStop(s[0], s[1]);
    return gr;
  });
}
function rgrad(g, key, x, y, r0, r1, stops) {
  return gradFor(g, key, c => {
    const gr = c.createRadialGradient(x, y, r0, x, y, r1);
    for (const s of stops) gr.addColorStop(s[0], s[1]);
    return gr;
  });
}

/* ─────────────────────────── materials ─────────────────────────── */
/* friendly hull: machined steel, cold, lit from the nose-left */
const STEEL = {
  lit: '#f0f5ff', hi: '#ccd6ea', mid: '#93a1bb', low: '#4a5570',
  deep: '#222b40', line: '#141b2b', black: '#0a0f1c'
};
function steelFill(g, key, y0, y1) {
  g.fillStyle = vgrad(g, 'st' + key, y0, y1, [
    [0, STEEL.lit], [.24, STEEL.hi], [.52, STEEL.mid], [.84, STEEL.low], [1, STEEL.deep]
  ]);
  g.fill();
}
function steelEdge(g, w) {
  g.lineWidth = w == null ? 1.1 : w; g.strokeStyle = STEEL.line; g.stroke();
}
/* the thin bright catchlight along the top edge that sells "metal" */
function rimLight(g, pts, a) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(210,228,255,' + (a == null ? .5 : a) + ')';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
  g.restore();
}
/* hostile hull: black structural chassis under crimson carapace plate */
function carapace(g, e, y0, y1) {
  if (e.col === '#fff') {
    g.fillStyle = '#fff'; g.fill();
    g.lineWidth = 1.3; g.strokeStyle = '#fff'; g.stroke();
    return;
  }
  /* The mass of a hostile is near-black so it holds a silhouette against the
     starfield. All of the colour lives on the edges and in the core — that is
     what makes eleven crimson ships tell each other apart at 20px. */
  const k = 'cp' + e.col + '|' + y0 + '|' + y1;
  g.fillStyle = vgrad(g, k, y0, y1, [
    [0, dark(e.col, .5)], [.3, dark(e.col, .7)], [.72, dark(e.col, .85)], [1, dark(e.col, .92)]
  ]);
  g.fill();
  /* narrow specular band along the lit (trailing) edge — a highlight, not a coat */
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = vgrad(g, 'sh' + k, y0, y1, [
    [0, rgba(e.col, .3)], [.14, rgba(e.col, .06)], [.5, rgba(e.col, 0)], [1, rgba(e.col, 0)]
  ]);
  g.fill();
  g.restore();
  g.lineWidth = 1.2; g.strokeStyle = lit(e.col, .14, .92); g.stroke();
}
function chassis(g, e) {
  g.fillStyle = e.col === '#fff' ? 'rgba(255,255,255,.8)' : dark(e.col, .84);
  g.fill();
}
/* bright trim — each hostile gets two or three, and they are its signature */
function trim(g, e, segs, w) {
  g.save();
  if (e.col !== '#fff') g.globalCompositeOperation = 'lighter';
  lines(g, segs, e.col === '#fff' ? '#fff' : lit(e.col, .45, .9), w == null ? 1.6 : w);
  g.restore();
}
/* recessed panel seams: a dark groove with a catch-light on its lit lip */
function seams(g, e, segs) {
  if (e.col === '#fff') { lines(g, segs, 'rgba(255,255,255,.5)', 1); return; }
  lines(g, segs, dark(e.col, .97, .8), 1.5);
  lines(g, segs.map(v => [v[0] - .8, v[1] - .8, v[2] - .8, v[3] - .8]), rgba(e.col, .3), .9);
}
/* louvre vents: cheap, and they make flat plate look engineered */
function vents(g, e, x, y, w, h, n) {
  const col = e.col === '#fff' ? 'rgba(255,255,255,.6)' : dark(e.col, .94, .9);
  g.fillStyle = col;
  const step = h / n;
  for (let i = 0; i < n; i++) g.fillRect(x, y + i * step, w, step * .55);
}
/* the sensor eye — every hostile has exactly one, and it is the tell */
function eye(g, e, x, y, r, col) {
  const t = e.t || 0, ph = e.ph || 0;
  const lift = .5 + .5 * Math.sin(t * 4 + ph);
  const c = col || e.col;
  if (c !== '#fff') {
    g.fillStyle = rgrad(g, 'ey' + c, 0, 0, 0, 1, [
      [0, lit(c, .9, .95)], [.45, rgba(c, .7)], [1, rgba(c, 0)]
    ]);
    g.save(); g.translate(x, y); g.scale(r * 2.6, r * 2.6);
    g.globalAlpha = .45 + .4 * lift;
    g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
    g.restore();
    g.globalAlpha = 1;
  }
  disc(g, x, y, r, c === '#fff' ? '#fff' : lit(c, .25, .75 + .25 * lift));
  disc(g, x, y, r * .44, '#fff');
}
/* hostile engine wash — hostiles fly nose-down, so exhaust vents upward */
function exhaust(g, e, x, y, w, len, k) {
  if (e.col === '#fff') return;
  const l = len * (.85 + Math.random() * .24) * (k == null ? 1 : k);
  g.save();
  g.globalCompositeOperation = 'lighter';
  emitLocal(g, SPR.foe, x, y - l * .22, l * 1.5, .22);
  g.translate(x, y);
  g.scale(w * .85, -l);
  g.fillStyle = vgrad(g, 'fx' + e.col, 0, 1, [
    [0, rgba(e.col, .5)], [.45, rgba(e.col, .14)], [1, rgba(e.col, 0)]
  ]);
  g.beginPath();
  g.moveTo(-1, 0); g.quadraticCurveTo(-.35, .55, 0, 1); g.quadraticCurveTo(.35, .55, 1, 0);
  g.closePath(); g.fill();
  g.restore();
}

/* ───────────────────── friendly propulsion ───────────────────── */
/* Unit-space flame, scaled into place. One cached gradient per state. */
function thruster(g, x, y, w, len, boost) {
  const flick = .84 + Math.random() * .32;
  const l = len * (boost ? 1.95 : 1) * flick;
  g.save();
  g.translate(x, y);
  g.scale(w, l);
  g.fillStyle = vgrad(g, boost ? 'thB' : 'thA', 0, 1, boost ? [
    [0, 'rgba(226,248,255,.96)'], [.28, 'rgba(90,205,255,.72)'],
    [.68, 'rgba(60,120,255,.3)'], [1, 'rgba(40,80,255,0)']
  ] : [
    [0, 'rgba(255,240,214,.96)'], [.3, 'rgba(255,164,64,.74)'],
    [.7, 'rgba(255,96,24,.3)'], [1, 'rgba(255,70,12,0)']
  ]);
  g.beginPath();
  g.moveTo(-1, 0); g.quadraticCurveTo(-.62, .55, 0, 1); g.quadraticCurveTo(.62, .55, 1, 0);
  g.closePath(); g.fill();
  /* shock diamonds in the core — only visible while boosting */
  g.fillStyle = boost ? 'rgba(236,252,255,.95)' : 'rgba(255,250,236,.92)';
  g.beginPath();
  g.moveTo(-.4, 0); g.quadraticCurveTo(-.22, .3, 0, .62); g.quadraticCurveTo(.22, .3, .4, 0);
  g.closePath(); g.fill();
  g.restore();
  if (boost) {
    g.save(); g.globalCompositeOperation = 'lighter';
    emitLocal(g, SPR.tech, x, y + l * .3, l * 1.5, .3);
    g.restore();
  }
}
/* engine bell the flame comes out of */
function nozzle(g, x, y, w, h) {
  g.fillStyle = STEEL.black;
  poly(g, [[x - w, y - h], [x + w, y - h], [x + w * .78, y], [x - w * .78, y]]);
  g.fill();
  g.strokeStyle = STEEL.low; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(255,190,120,.5)';
  g.fillRect(x - w * .72, y - 1.6, w * 1.44, 1.6);
}
/* armoured glass, lit from the same side as everything else */
function canopy(g, x, y, rx, ry) {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fillStyle = vgrad(g, 'cn' + rx + ry + y, y - ry, y + ry, [
    [0, 'rgba(206,238,255,.95)'], [.35, rgba(PAL.hullLit, .8)],
    [.72, 'rgba(96,62,26,.9)'], [1, 'rgba(24,16,8,.95)']
  ]);
  g.fill();
  g.strokeStyle = 'rgba(24,30,46,.9)'; g.lineWidth = .9; g.stroke();
  /* glint */
  g.fillStyle = 'rgba(255,255,255,.72)';
  g.beginPath(); g.ellipse(x - rx * .32, y - ry * .38, rx * .3, ry * .22, -.5, 0, TAU); g.fill();
}
/* navigation strobe — sharp pulse, not a sine, so it reads as a flash */
function strobe(g, x, y, spr, t, ph, r) {
  const k = Math.pow(Math.max(0, Math.sin(t * 2.6 + ph)), 10);
  if (k < .02) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  g.globalAlpha = k;
  disc(g, x, y, r || 1.5, '#fff');
  emitLocal(g, spr, x, y, (r || 1.5) * 9, k * .75);
  g.restore();
  g.globalAlpha = 1;
}
function emitLocal(g, spr, x, y, size, a) {
  if (!spr) return; // sprite sheet is built after first paint; hull previews run before it
  g.globalAlpha = a; g.drawImage(spr, x - size / 2, y - size / 2, size, size); g.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════════════════════════
   PLAYER HULLS
   Nose points −y. Authored to roughly ±20 so the four read at one scale.
   ══════════════════════════════════════════════════════════════════════ */
const HULL_ART = {
  /* VESPER-01 — the yard interceptor. Twin-boom, honest, a bit worn. */
  vesper(g, o) {
    const t = o.thrust == null ? 1 : o.thrust, tm = o.t || 0;
    thruster(g, -4.6, 12.4, 3.1, 13 * t, o.boost);
    thruster(g, 4.6, 12.4, 3.1, 13 * t, o.boost);

    /* wings, drawn under the fuselage so the spine sits proud */
    mirrorPoly(g, [[5, -1], [16.5, 7], [15.5, 11], [6.5, 9.5], [5, 5]]);
    g.fillStyle = vgrad(g, 'vwing', -2, 12, [
      [0, STEEL.hi], [.5, STEEL.mid], [1, STEEL.deep]
    ]);
    g.fill();
    steelEdge(g, 1);
    /* ember leading edge — the brand mark on every yard hull */
    g.fillStyle = PAL.hull;
    poly(g, [[6, 0], [15.8, 7.4], [15.2, 9], [6, 2.6]]); g.fill();
    poly(g, [[-6, 0], [-15.8, 7.4], [-15.2, 9], [-6, 2.6]]); g.fill();

    /* fuselage */
    mirrorPoly(g, [[0, -21], [2.6, -13], [4.2, -3], [5.4, 5], [6.4, 11], [4.2, 13.6], [0, 14]]);
    steelFill(g, 'vbody', -21, 14);
    steelEdge(g, 1.15);

    /* engine housings */
    nozzle(g, -4.6, 12.8, 2.9, 4.4);
    nozzle(g, 4.6, 12.8, 2.9, 4.4);

    /* panel work */
    seams(g, { col: STEEL.line }, [[-3.4, -6, 3.4, -6], [-4.6, 3, 4.6, 3], [-5.4, 8, 5.4, 8]]);
    lines(g, [[0, -18, 0, 11]], 'rgba(255,255,255,.14)', 1);
    vents(g, { col: STEEL.mid }, -3.2, 5.6, 2.2, 5, 3);
    vents(g, { col: STEEL.mid }, 1, 5.6, 2.2, 5, 3);

    /* nose sensor + intake shadow */
    g.fillStyle = STEEL.black;
    poly(g, [[0, -21], [1.5, -14], [0, -12.4], [-1.5, -14]]); g.fill();
    disc(g, 0, -17.6, .9, PAL.hullLit);

    canopy(g, 0, -6.6, 2.6, 5.8);
    rimLight(g, [[-2.6, -13], [0, -21], [2.6, -13]], .55);
    strobe(g, -15.9, 8.4, SPR.foe, tm, 0, 1.4);
    strobe(g, 15.9, 8.4, SPR.good, tm, PI, 1.4);
  },

  /* HALCYON — lance. Long spinal railgun, forward-swept wings, fragile. */
  halcyon(g, o) {
    const t = o.thrust == null ? 1 : o.thrust, tm = o.t || 0;
    thruster(g, -6.2, 10.6, 2.7, 12.5 * t, o.boost);
    thruster(g, 6.2, 10.6, 2.7, 12.5 * t, o.boost);

    /* forward-swept wings */
    mirrorPoly(g, [[3.4, 2], [18.5, 10.5], [16.8, 12.4], [6.6, 9.4], [4.6, 6]]);
    g.fillStyle = vgrad(g, 'hwing', 0, 13, [[0, STEEL.hi], [.55, STEEL.low], [1, STEEL.deep]]);
    g.fill(); steelEdge(g, 1);
    g.strokeStyle = PAL.hull; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-17.4, 10.9); g.lineTo(-6.4, 7.2);
    g.moveTo(17.4, 10.9); g.lineTo(6.4, 7.2);
    g.stroke();

    /* outboard engine booms */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 4.4, -2], [sx * 8, -1], [sx * 8, 11], [sx * 4.4, 11]]);
      g.fillStyle = vgrad(g, 'hboom', -2, 11, [[0, STEEL.mid], [1, STEEL.deep]]);
      g.fill(); steelEdge(g, .9);
      nozzle(g, sx * 6.2, 11, 2.5, 4);
    }

    /* needle fuselage */
    mirrorPoly(g, [[0, -24], [1.7, -14], [3.1, -4], [4.6, 6], [4, 12], [0, 12.8]]);
    steelFill(g, 'hbody', -24, 13);
    steelEdge(g, 1.05);

    /* spinal railgun rails, charged look */
    g.fillStyle = STEEL.black;
    g.fillRect(-1.5, -23, 3, 15);
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba(PAL.hull, .5 + .35 * Math.sin(tm * 6));
    g.fillRect(-.8, -22.4, 1.6, 14);
    g.restore();
    lines(g, [[-2.6, -9, 2.6, -9], [-3.4, -1, 3.4, -1], [-4.2, 6, 4.2, 6]],
      'rgba(255,255,255,.16)', 1);

    canopy(g, 0, -8.4, 2, 5.2);
    rimLight(g, [[-1.7, -14], [0, -24], [1.7, -14]], .6);
    strobe(g, -17.9, 11.6, SPR.foe, tm, 0, 1.3);
    strobe(g, 17.9, 11.6, SPR.good, tm, PI, 1.3);
  },

  /* SERAPH — prism testbed. A tuning-fork bow focuses the lance; the
     crystal at the vertex is the weapon. The spine is a heat sink — it
     shimmers harder the closer the run runs to a vent. */
  seraph(g, o) {
    const t = o.thrust == null ? 1 : o.thrust, tm = o.t || 0;
    thruster(g, -5.4, 11.6, 2.9, 12 * t, o.boost);
    thruster(g, 5.4, 11.6, 2.9, 12 * t, o.boost);

    /* canted tail fins */
    mirrorPoly(g, [[4, 4], [14.5, 12.5], [12.5, 14.2], [4.8, 10.5]]);
    g.fillStyle = vgrad(g, 'sfin', 2, 15, [[0, STEEL.low], [1, STEEL.deep]]);
    g.fill(); steelEdge(g, .9);

    /* forward prongs — the fork that focuses the lance */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 3, -6], [sx * 8.5, -20], [sx * 6, -22.5], [sx * 2, -10]]);
      g.fillStyle = vgrad(g, 'sprong' + sx, -22, -6, [[0, STEEL.hi], [1, STEEL.mid]]);
      g.fill(); steelEdge(g, 1);
      g.strokeStyle = rgba(PAL.tech, .5); g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx * 7.4, -19.5); g.lineTo(sx * 3.2, -8); g.stroke();
    }

    /* fuselage */
    mirrorPoly(g, [[0, -8], [3.4, -2], [4.2, 7], [2.8, 12], [0, 12.6]]);
    steelFill(g, 'sbody', -8, 13);
    steelEdge(g, 1.05);

    /* heat-sink spine */
    g.fillStyle = STEEL.black;
    g.fillRect(-2.2, -4, 4.4, 12);
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba(PAL.rare, .3 + .25 * Math.sin(tm * 3.2));
    g.fillRect(-1.4, -3.4, 2.8, 11);
    g.restore();

    /* the prism itself — hangs between the prongs */
    poly(g, [[0, -24.5], [2.6, -19], [0, -13.5], [-2.6, -19]]);
    g.fillStyle = rgba(PAL.tech, .85);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.1;
    g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba(PAL.tech, .3 + .2 * Math.sin(tm * 5));
    poly(g, [[0, -23.5], [1.7, -19], [0, -14.5], [-1.7, -19]]);
    g.fill();
    g.restore();

    canopy(g, 0, 0, 1.9, 4.6);
    rimLight(g, [[-2.8, -6], [0, -8], [2.8, -6]], .55);
    strobe(g, -13.4, 13.2, SPR.foe, tm, 0, 1.2);
    strobe(g, 13.4, 13.2, SPR.good, tm, PI, 1.2);
  },

  /* ATLAS — bulwark. Slab armour, four engines, shoulder ordnance cells. */
  atlas(g, o) {
    const t = o.thrust == null ? 1 : o.thrust, tm = o.t || 0;
    for (const sx of [-9.4, -3.4, 3.4, 9.4]) thruster(g, sx, 14.2, 2.5, 10.5 * t, o.boost);

    /* shoulder pods with visible missile cells */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 11, -3.5], [sx * 20.5, 1.5], [sx * 20.5, 10], [sx * 12, 13.5], [sx * 11, 6]]);
      g.fillStyle = vgrad(g, 'apod', -4, 14, [[0, STEEL.hi], [.5, STEEL.low], [1, STEEL.deep]]);
      g.fill(); steelEdge(g, 1.2);
      g.fillStyle = STEEL.black;
      for (let i = 0; i < 3; i++) g.fillRect(sx > 0 ? 13.5 : -19.5, 2.5 + i * 3.2, 6, 2.2);
      g.fillStyle = rgba(PAL.hull, .55);
      for (let i = 0; i < 3; i++) g.fillRect(sx > 0 ? 13.5 : -19.5, 2.5 + i * 3.2, 1.4, 2.2);
    }

    /* hull */
    mirrorPoly(g, [[0, -18], [5.4, -13.5], [7.6, -4], [9.6, 4], [11.4, 12], [8, 15.4], [0, 15.8]]);
    steelFill(g, 'abody', -18, 16);
    steelEdge(g, 1.5);

    /* armour belt across the chest */
    poly(g, [[-8.4, -1], [8.4, -1], [9.6, 5.5], [-9.6, 5.5]]);
    g.fillStyle = vgrad(g, 'abelt', -1, 5.5, [[0, STEEL.hi], [1, STEEL.low]]);
    g.fill();
    steelEdge(g, 1);
    /* hazard flash on the belt */
    g.save(); g.beginPath();
    g.rect(-9.6, -1, 19.2, 6.5); g.clip();
    g.strokeStyle = rgba(PAL.hull, .8); g.lineWidth = 2;
    g.beginPath();
    for (let x = -12; x < 12; x += 4) { g.moveTo(x, 6); g.lineTo(x + 4, -1); }
    g.stroke();
    g.restore();

    for (const sx of [-9.4, -3.4, 3.4, 9.4]) nozzle(g, sx, 14.6, 2.4, 4.2);
    seams(g, { col: STEEL.line }, [[-6.4, -8, 6.4, -8], [-5, -13, 5, -13]]);
    lines(g, [[-6.4, -12, -6.4, 13], [6.4, -12, 6.4, 13]], 'rgba(255,255,255,.12)', 1);
    vents(g, { col: STEEL.mid }, -1.6, 7.5, 3.2, 5.5, 3);

    canopy(g, 0, -8.4, 3.3, 5);
    rimLight(g, [[-5.4, -13.5], [0, -18], [5.4, -13.5]], .5);
    strobe(g, -20, 6, SPR.foe, tm, 0, 1.6);
    strobe(g, 20, 6, SPR.good, tm, PI, 1.6);
  },

  /* WRAITH — অপার্থিব. Half here. No engine: the hull just arrives. */
  wraith(g, o) {
    const tm = o.t || 0;
    const ph = .5 + .5 * Math.sin(tm * 2.2);

    /* displacement aura */
    g.save();
    g.globalCompositeOperation = 'lighter';
    emitLocal(g, SPR.rare, 0, 2, 48 * (o.boost ? 1.5 : 1), .26 + .12 * Math.sin(tm * 5));
    g.restore();

    /* detached wing shards, drifting out of phase with the core */
    for (const sx of [-1, 1]) {
      g.save();
      g.translate(sx * (11 + ph * 1.6), 3 + Math.sin(tm * 1.7 + sx) * 1.4);
      g.rotate(sx * (.2 + ph * .12));
      poly(g, [[0, -9], [4.4, 1], [1.6, 9], [-2.6, 2]]);
      g.fillStyle = rgba(PAL.rare, .18);
      g.fill();
      g.strokeStyle = rgba(PAL.rare, .8); g.lineWidth = 1.1; g.stroke();
      disc(g, .8, 0, 1.1, lit(PAL.rare, .6, .9));
      g.restore();
    }

    /* core hull — dark glass, violet edge-lit */
    mirrorPoly(g, [[0, -22], [4, -13], [3, -4], [7.5, 2], [6, 9], [3.4, 13], [0, 15]]);
    g.fillStyle = vgrad(g, 'wbody', -22, 15, [
      [0, 'rgba(58,40,104,.95)'], [.4, 'rgba(30,20,62,.92)'], [1, 'rgba(12,8,26,.94)']
    ]);
    g.fill();
    g.lineWidth = 1.3; g.strokeStyle = rgba(PAL.rare, .95); g.stroke();

    /* inner circuitry */
    lines(g, [[0, -19, 0, 11], [-5.4, 1, 5.4, 1], [-3.4, -7, 3.4, -7]],
      rgba(PAL.rare, .45), .9);

    /* eye-core */
    g.save(); g.globalCompositeOperation = 'lighter';
    emitLocal(g, SPR.rare, 0, -6.5, 20, .35 + .25 * ph);
    g.restore();
    g.fillStyle = lit(PAL.rare, .2);
    g.beginPath(); g.ellipse(0, -6.5, 2, 5, 0, 0, TAU); g.fill();
    disc(g, 0, -6.5, 1.1, '#fff');

    /* phase ring */
    g.globalAlpha = .38 + .26 * Math.sin(tm * 3.1);
    g.strokeStyle = rgba(PAL.rare, .9); g.lineWidth = .9;
    ringPath(g, 0, 0, 19 + Math.sin(tm * 2) * 2.2); g.stroke();
    g.globalAlpha = .22;
    ringPath(g, 0, 0, 25 + Math.cos(tm * 1.6) * 2.6); g.stroke();
    g.globalAlpha = 1;
  }
};

/* ══════════════════════════════════════════════════════════════════════
   HOSTILES
   Nose points +y — they come down the well at you. Scale tracks the hit
   radius in FOES so what you see is what you can clip.
   ══════════════════════════════════════════════════════════════════════ */
const FOE_ART = {
  /* SHARD — throwaway. One blade, one eye. */
  mini(g, e) {
    exhaust(g, e, 0, -7, 2.2, 8);
    mirrorPoly(g, [[0, 10], [3.4, 2], [6.4, -2], [2.6, -4], [1.8, -7], [0, -8]]);
    carapace(g, e, -8, 10);
    seams(g, e, [[0, -5, 0, 7]]);
    eye(g, e, 0, 1, 1.5);
  },

  /* DRONE — mass-produced delta. Drooped tips, exposed spine. */
  drone(g, e) {
    exhaust(g, e, -3.6, -8, 2.4, 9);
    exhaust(g, e, 3.6, -8, 2.4, 9);
    /* wings under */
    mirrorPoly(g, [[4, 5], [13.5, 1], [15, -3.5], [8.5, -4.5], [4.5, -1]]);
    chassis(g, e);
    g.lineWidth = 1.1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .55); g.stroke();
    /* body */
    mirrorPoly(g, [[0, 13.5], [4.2, 5], [6.4, -1], [4.6, -7], [0, -9.5]]);
    carapace(g, e, -9.5, 13.5);
    seams(g, e, [[0, -7, 0, 11], [-4.6, 1, 4.6, 1]]);
    vents(g, e, -4.4, -6.4, 3, 4, 3);
    vents(g, e, 1.4, -6.4, 3, 4, 3);
    /* wingtip markers */
    disc(g, -14, -2.4, 1.1, lit(e.col, .5, .85));
    disc(g, 14, -2.4, 1.1, lit(e.col, .5, .85));
    eye(g, e, 0, 3, 2.3);
  },

  /* STRIKER — attack craft. Forward gun pods, swept shoulders. */
  striker(g, e) {
    exhaust(g, e, -4, -9, 2.6, 11);
    exhaust(g, e, 4, -9, 2.6, 11);
    /* gun pods */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 5.5, 9], [sx * 10, 6], [sx * 10.5, -1], [sx * 6, -3]]);
      chassis(g, e);
      g.lineWidth = 1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .75); g.stroke();
      g.fillStyle = e.col === '#fff' ? '#fff' : lit(e.col, .3, .8);
      g.fillRect(sx > 0 ? 6.4 : -9.4, 8.4, 3, 4.6);
    }
    /* shoulders */
    mirrorPoly(g, [[3.5, 6], [13.5, 8.5], [12, 2], [5, -2]]);
    carapace(g, e, -2, 9);
    /* fuselage */
    mirrorPoly(g, [[0, 16], [3.6, 7], [5.6, 0], [4.4, -6], [2.6, -9], [0, -12]]);
    carapace(g, e, -12, 16);
    seams(g, e, [[0, -9, 0, 13], [-4.2, 3, 4.2, 3]]);
    lines(g, [[-11.5, 6.4, -5.5, 4.4], [11.5, 6.4, 5.5, 4.4]],
      e.col === '#fff' ? '#fff' : rgba(e.col, .5), 1);
    eye(g, e, 0, 0, 2.1);
  },

  /* WEAVER — standoff shooter. Long outrigger emitters, thin body. */
  weaver(g, e) {
    exhaust(g, e, 0, -10, 2.8, 10);
    /* outrigger booms */
    g.strokeStyle = e.col === '#fff' ? '#fff' : dark(e.col, .72);
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(-4.5, 0); g.lineTo(-13.5, -2.5);
    g.moveTo(4.5, 0); g.lineTo(13.5, -2.5);
    g.stroke();
    trim(g, e, [[-5, -1.4, -13.5, -3.8], [5, -1.4, 13.5, -3.8]], 1.1);
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 11, 3.5], [sx * 18, -.5], [sx * 15, -7], [sx * 9.5, -3.5]]);
      carapace(g, e, -7, 3.5);
    }
    /* emitter tips flicker on the shot cycle */
    const k = .45 + .45 * Math.sin((e.t || 0) * 5 + (e.ph || 0));
    g.save(); g.globalCompositeOperation = 'lighter';
    emitLocal(g, SPR.foe, -16, -2, 13 * k, k * .7);
    emitLocal(g, SPR.foe, 16, -2, 13 * k, k * .7);
    g.restore();
    /* body */
    mirrorPoly(g, [[0, 14.5], [3.6, 4], [5, -3], [2.8, -9], [0, -11]]);
    carapace(g, e, -11, 14.5);
    seams(g, e, [[0, -8, 0, 12]]);
    eye(g, e, 0, 2, 2);
  },

  /* SPLITTER — pressurised shell. The fracture line is where it comes apart. */
  splitter(g, e) {
    const t = e.t || 0, ph = e.ph || 0;
    const swell = 1 + .04 * Math.sin(t * 3.4 + ph);
    const split = .5 + .5 * Math.sin(t * 3.4 + ph);
    g.save(); g.scale(swell, swell);
    /* two half-shells, drifting apart on the pressure cycle */
    for (const sx of [-1, 1]) {
      g.save();
      g.translate(sx * (.6 + split * 1.5), 0);
      g.beginPath();
      g.moveTo(0, -14.5);
      g.lineTo(sx * 8, -11);
      g.lineTo(sx * 14, -2);
      g.lineTo(sx * 12, 8);
      g.lineTo(sx * 5, 14);
      g.lineTo(0, 15);
      g.closePath();
      carapace(g, e, -14.5, 15);
      seams(g, e, [[sx * 3, -10, sx * 10, -1], [sx * 2.5, 9, sx * 10, 2]]);
      g.restore();
    }
    /* the core showing through the gap */
    g.save(); g.globalCompositeOperation = 'lighter';
    emitLocal(g, SPR.foe, 0, 0, 20 + split * 14, .35 + .35 * split);
    g.restore();
    trim(g, e, [[0, -13, 0, 13]], 1.4 + split * 1.4);
    g.restore();
    eye(g, e, 0, 0, 2.6);
  },

  /* CRUISER — armoured line unit. Belt armour, blister turrets, bridge. */
  cruiser(g, e) {
    exhaust(g, e, -10, -23, 3.4, 13);
    exhaust(g, e, 0, -24, 3.4, 13);
    exhaust(g, e, 10, -23, 3.4, 13);
    /* hull */
    mirrorPoly(g, [[0, 26], [8, 22], [14, 13], [22, 5], [23, -7], [17, -17], [9, -23], [0, -23]]);
    carapace(g, e, -23, 26);
    /* belt armour */
    poly(g, [[-22, -1], [22, -1], [20, 8], [-20, 8]]);
    g.fillStyle = e.col === '#fff' ? '#fff' : dark(e.col, .62);
    g.fill();
    g.lineWidth = 1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .8); g.stroke();
    /* blister turrets track slowly */
    for (const sx of [-13, 13]) {
      disc(g, sx, 11, 4.6, e.col === '#fff' ? '#fff' : dark(e.col, .78));
      g.lineWidth = 1.2; g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .2, .9);
      ringPath(g, sx, 11, 4.6); g.stroke();
      g.fillStyle = e.col === '#fff' ? '#fff' : lit(e.col, .35, .85);
      g.fillRect(sx - 1, 12, 2, 6.5);
    }
    /* bridge block */
    poly(g, [[-6, -13], [6, -13], [4.5, -5], [-4.5, -5]]);
    chassis(g, e);
    g.lineWidth = 1.1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .85); g.stroke();
    lines(g, [[-3.6, -11, 3.6, -11], [-3.2, -8.4, 3.2, -8.4]],
      e.col === '#fff' ? '#fff' : lit(e.col, .5, .75), 1);
    seams(g, e, [[-17, -13, 17, -13], [-9, -20, -9, -3], [9, -20, 9, -3]]);
    trim(g, e, [[-20, 2, -10, 2], [10, 2, 20, 2]], 1.6);
    vents(g, e, -16, -20, 5, 6, 4);
    vents(g, e, 11, -20, 5, 6, 4);
    eye(g, e, 0, -17, 3);
  },

  /* LANCER — beam platform. The coil charges before the barrel fires. */
  lancer(g, e) {
    exhaust(g, e, -4.5, -17, 2.8, 11);
    exhaust(g, e, 4.5, -17, 2.8, 11);
    /* stabiliser fins */
    mirrorPoly(g, [[5, 2], [15.5, 4], [14, -5], [6, -7]]);
    chassis(g, e);
    g.lineWidth = 1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .7); g.stroke();
    /* spine */
    mirrorPoly(g, [[0, 15], [4.4, 8], [6.4, 1], [5.4, -8], [3, -13], [0, -17]]);
    carapace(g, e, -17, 15);
    seams(g, e, [[0, -14, 0, 12]]);

    /* barrel */
    g.fillStyle = '#0b0610';
    g.fillRect(-3.6, 13, 7.2, 13);
    g.lineWidth = 1.3;
    g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .18, .95);
    g.strokeRect(-3.6, 13, 7.2, 13);
    /* charge coils light bottom-up as glow rises */
    const gl = e.glow || 0;
    for (let i = 0; i < 3; i++) {
      const on = gl > i / 3;
      g.fillStyle = e.col === '#fff' ? '#fff' : (on ? lit(e.col, .55, .95) : dark(e.col, .6));
      g.fillRect(-5.2, 15.5 + i * 3.4, 10.4, 1.8);
      if (on && e.col !== '#fff') {
        g.save(); g.globalCompositeOperation = 'lighter';
        emitLocal(g, SPR.foe, 0, 16.4 + i * 3.4, 18, .35);
        g.restore();
      }
    }
    if (gl > 0) {
      g.save(); g.globalCompositeOperation = 'lighter';
      emitLocal(g, SPR.foe, 0, 26, 30 * gl, gl);
      g.restore();
    }
    eye(g, e, 0, -7, 2.3);
  },

  /* ORBITER — spin platform. Arms counter-rotate around a loose core. */
  orbiter(g, e) {
    const t = e.t || 0, a = t * 3;
    /* outer arms */
    g.lineCap = 'round';
    g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .15, .9);
    g.lineWidth = 2.6;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(0, 0, 15.5, a + i * TAU / 3, a + i * TAU / 3 + .9);
      g.stroke();
    }
    g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .45);
    g.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(0, 0, 19.5, -a * .7 + i * TAU / 3, -a * .7 + i * TAU / 3 + .55);
      g.stroke();
    }
    g.lineCap = 'butt';
    /* arm tips */
    for (let i = 0; i < 3; i++) {
      const aa = a + i * TAU / 3 + .9;
      disc(g, Math.cos(aa) * 15.5, Math.sin(aa) * 15.5, 1.7,
        e.col === '#fff' ? '#fff' : lit(e.col, .55, .9));
    }
    /* core */
    ringPath(g, 0, 0, 10.5);
    carapace(g, e, -10.5, 10.5);
    g.save();
    g.beginPath(); g.arc(0, 0, 10.5, 0, TAU); g.clip();
    seams(g, e, [[-11, -4, 11, -4], [-11, 4, 11, 4], [0, -11, 0, 11]]);
    g.restore();
    eye(g, e, 0, 0, 3.2);
  },

  /* WARDEN — shield projector. Dish and halo read in the tech channel. */
  warden(g, e) {
    exhaust(g, e, -5, -14, 2.6, 9);
    exhaust(g, e, 5, -14, 2.6, 9);
    /* prongs */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 8, 12], [sx * 14.5, 6], [sx * 12.5, -2], [sx * 7.5, 1]]);
      chassis(g, e);
      g.lineWidth = 1.1; g.strokeStyle = PAL.tech; g.stroke();
      disc(g, sx * 12.5, 5, 1.6, PAL.tech);
    }
    /* body */
    mirrorPoly(g, [[0, 15], [6.5, 9], [9, 0], [7, -8], [3.4, -13], [0, -15]]);
    carapace(g, e, -15, 15);
    seams(g, e, [[0, -12, 0, 12]]);
    /* projector dish */
    disc(g, 0, 1, 7, '#090512');
    g.lineWidth = 1.5; g.strokeStyle = PAL.tech;
    ringPath(g, 0, 1, 7); g.stroke();
    const pulse = .4 + .35 * Math.sin((e.t || 0) * 4);
    g.save(); g.globalCompositeOperation = 'lighter';
    emitLocal(g, SPR.tech, 0, 1, 26, pulse * .55);
    g.restore();
    g.globalAlpha = .45 + .35 * Math.sin((e.t || 0) * 4);
    g.strokeStyle = PAL.tech; g.lineWidth = 1.4;
    ringPath(g, 0, 1, 12.5 + Math.sin((e.t || 0) * 3) * 1.6); g.stroke();
    g.globalAlpha = 1;
    eye(g, e, 0, 1, 2.4, PAL.tech);
  },

  /* MINELAYER — hunched hauler. Three cradles, one drops at a time. */
  minelayer(g, e) {
    exhaust(g, e, -5, -13, 2.6, 9);
    exhaust(g, e, 5, -13, 2.6, 9);
    /* dorsal hump */
    mirrorPoly(g, [[0, 4], [9, 0], [12, -6], [6, -12], [0, -13]]);
    carapace(g, e, -13, 4);
    /* main body */
    mirrorPoly(g, [[0, 12.5], [8, 9], [14.5, 2], [13, -5], [6, -11], [0, -12]]);
    carapace(g, e, -12, 12.5);
    seams(g, e, [[-11, -2, 11, -2], [0, -10, 0, 10]]);
    /* cradles + payload */
    const t = e.t || 0;
    for (let i = 0; i < 3; i++) {
      const x = -8 + i * 8;
      g.fillStyle = '#080410';
      g.beginPath(); g.arc(x, 8.5, 3.4, 0, TAU); g.fill();
      g.lineWidth = 1; g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .2, .9);
      g.beginPath(); g.arc(x, 8.5, 3.4, 0, TAU); g.stroke();
      const k = .3 + .5 * Math.max(0, Math.sin(t * 2.4 + i * 1.1));
      disc(g, x, 8.5, 1.5, e.col === '#fff' ? '#fff' : lit(e.col, .5, k));
    }
    /* grapple claws */
    lines(g, [[-13, 3, -16, 9], [13, 3, 16, 9]],
      e.col === '#fff' ? '#fff' : dark(e.col, .4), 2);
    eye(g, e, 0, -5, 2.2);
  },

  /* CARRIER — mothership. The bay is open the whole time it is alive. */
  carrier(g, e) {
    const t = e.t || 0;
    exhaust(g, e, -12, -21, 3.4, 13);
    exhaust(g, e, 0, -23, 3.8, 15);
    exhaust(g, e, 12, -21, 3.4, 13);
    /* sponsons */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 18, 14], [sx * 27, 6], [sx * 26, -6], [sx * 17, -10]]);
      chassis(g, e);
      g.lineWidth = 1.3; g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .1, .85); g.stroke();
      vents(g, e, sx > 0 ? 19 : -24, -4, 5, 8, 4);
      trim(g, e, [[sx * 18, 12, sx * 26, 5]], 1.3);
    }
    /* hull */
    mirrorPoly(g, [[0, 23], [10, 20], [18, 12], [23, 1], [21, -12], [11, -21], [0, -22]]);
    carapace(g, e, -22, 23);
    /* launch bay */
    g.fillStyle = '#060310';
    g.fillRect(-16, 9, 32, 9);
    g.lineWidth = 1.2; g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .2, .95);
    g.strokeRect(-16, 9, 32, 9);
    /* runway lights chase toward the mouth */
    g.save();
    g.beginPath(); g.rect(-16, 9, 32, 9); g.clip();
    for (let i = 0; i < 6; i++) {
      const k = Math.max(0, Math.sin(t * 5 - i * .7));
      g.fillStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .18 + .7 * k);
      g.fillRect(-14 + i * 5, 10.5, 3.4, 6);
      if (k > .5 && e.col !== '#fff') {
        g.save(); g.globalCompositeOperation = 'lighter';
        emitLocal(g, SPR.foe, -12.3 + i * 5, 13.5, 16, (k - .5) * .8);
        g.restore();
      }
    }
    g.restore();
    /* dorsal spine + comms mast */
    poly(g, [[-4, -20], [4, -20], [3, -6], [-3, -6]]);
    chassis(g, e);
    g.lineWidth = 1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .85); g.stroke();
    seams(g, e, [[-20, -6, 20, -6], [-13, -18, -13, 6], [13, -18, 13, 6]]);
    eye(g, e, 0, -13, 3);
  },

  /* RAM — armored charge hull. A living battering ram with a split prow. */
  ram(g, e) {
    exhaust(g, e, -4.5, -13, 3, 11);
    exhaust(g, e, 4.5, -13, 3, 11);
    /* heavy shoulder guards */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 6.5, -4], [sx * 14, 0], [sx * 13, 7], [sx * 5, 8]]);
      chassis(g, e);
      g.lineWidth = 1.2; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .8); g.stroke();
    }
    /* body */
    mirrorPoly(g, [[0, 15], [4.6, 9], [6.4, 0], [5.2, -8], [2.8, -12], [0, -14]]);
    carapace(g, e, -14, 15);
    /* split prow — opens wider as the charge lock sets */
    const lock = e.chargeT != null ? clamp(1 - e.chargeT / 3, 0, 1) : 0;
    const gap = 1 + lock * 2.6;
    for (const sx of [-1, 1]) {
      poly(g, [[sx * gap, 12], [sx * 7.5, 15.5], [sx * 3, 18], [sx * .5, 13.5]]);
      g.fillStyle = e.col === '#fff' ? '#fff' : dark(e.col, .4);
      g.fill();
      g.lineWidth = 1.2; g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .3, .9); g.stroke();
    }
    if (lock > .4 && e.col !== '#fff') {
      g.save(); g.globalCompositeOperation = 'lighter';
      emitLocal(g, SPR.foe, 0, 15, 26 * lock, .4 * lock);
      g.restore();
    }
    seams(g, e, [[0, -11, 0, 11], [-5.5, -2, 5.5, -2]]);
    vents(g, e, -4.4, 2, 3, 5, 3);
    vents(g, e, 1.4, 2, 3, 5, 3);
    eye(g, e, 0, -5, 2.4);
  },

  /* SNIPER — long rail platform. Fins fold out; the sight does the talking. */
  sniper(g, e) {
    exhaust(g, e, -3.4, -11, 2.4, 9);
    exhaust(g, e, 3.4, -11, 2.4, 9);
    /* folded forward fins */
    mirrorPoly(g, [[3.4, 6], [10.5, 10], [9.5, 4], [4.4, 1]]);
    chassis(g, e);
    g.lineWidth = 1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .7); g.stroke();
    /* slender body */
    mirrorPoly(g, [[0, 16], [3, 8], [4.6, -2], [3.2, -9], [0, -12.5]]);
    carapace(g, e, -12.5, 16);
    /* rail barrel */
    g.fillStyle = '#0b0610';
    g.fillRect(-1.9, 12, 3.8, 11);
    g.lineWidth = 1.1;
    g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .2, .95);
    g.strokeRect(-1.9, 12, 3.8, 11);
    /* charge tip glows as the lock closes */
    const lk = clamp((e.lockT || 0) / (e.lockNeed || 1.5), 0, 1);
    if (lk > .2 && e.col !== '#fff') {
      g.save(); g.globalCompositeOperation = 'lighter';
      emitLocal(g, SPR.rare, 0, 24, 12 + 16 * lk, .25 + .55 * lk);
      g.restore();
    }
    disc(g, 0, 24, 1.6 + 1.2 * lk, e.col === '#fff' ? '#fff' : lit(PAL.rare, .5, .35 + .6 * lk));
    seams(g, e, [[0, -10, 0, 9]]);
    eye(g, e, 0, -4, 2.1);
  },

  /* SHIELDBREAKER — emitter vanes wound with stored charge. */
  shieldbreaker(g, e) {
    exhaust(g, e, -5.5, -12, 2.6, 10);
    exhaust(g, e, 5.5, -12, 2.6, 10);
    /* twin emitter vanes, humming with charge */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 7, 4], [sx * 16, 8.5], [sx * 14.5, -4], [sx * 8, -6]]);
      chassis(g, e);
      g.lineWidth = 1.1; g.strokeStyle = PAL.tech; g.stroke();
      const hum = .3 + .5 * Math.sin((e.t || 0) * 5 + sx);
      disc(g, sx * 14, 4, 1.8, e.col === '#fff' ? '#fff' : lit(PAL.tech, .5, .3 + .5 * hum));
    }
    /* body */
    mirrorPoly(g, [[0, 14], [5.6, 8], [8, 0], [6.2, -8], [3, -12.5], [0, -14]]);
    carapace(g, e, -14, 14);
    seams(g, e, [[0, -11, 0, 10], [-6, 1, 6, 1]]);
    /* capacitor coil over the spine */
    const chg = clamp(1 - (e.fireT || 0) / Math.max(.1, e.cd || 3.2), 0, 1);
    disc(g, 0, -1, 4.6, '#080510');
    g.lineWidth = 1.3; g.strokeStyle = PAL.tech;
    ringPath(g, 0, -1, 4.6); g.stroke();
    disc(g, 0, -1, 2.4, e.col === '#fff' ? '#fff' : lit(PAL.tech, .55, .25 + .6 * chg));
    eye(g, e, 0, -6.5, 2.1, PAL.tech);
  },

  /* HOUND — lean pack hunter. All leg and jaw, built to commit. */
  hound(g, e) {
    exhaust(g, e, 0, -8, 2.6, 10);
    mirrorPoly(g, [[0, 12], [3.2, 6], [9.5, 2.5], [7, -3], [2.4, -5.5], [0, -9]]);
    carapace(g, e, -9, 12);
    seams(g, e, [[0, -6, 0, 8], [-3.4, 2, 3.4, 2]]);
    /* jaw prongs — the pack's grapple look */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 3, 12], [sx * 5.5, 16], [sx * 6, 9]]);
      chassis(g, e);
      g.lineWidth = 1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .7); g.stroke();
    }
    eye(g, e, 0, 2, 2);
  },

  /* WISP — v4.20 blink flanker. A sliver: swept crescent, one eye, twin
     finlets. Reads as pure speed at 20px — thin, bright-edged, no mass. */
  wisp(g, e) {
    exhaust(g, e, 0, -8, 2.0, 9);
    /* swept crescent wing under */
    mirrorPoly(g, [[2, 4], [10.5, -1.5], [12.5, -6], [5, -5], [1.6, -2]]);
    chassis(g, e);
    g.lineWidth = 1; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .6); g.stroke();
    /* needle body */
    mirrorPoly(g, [[0, 11], [2.4, 4], [3.2, -3], [1.8, -8], [0, -9]]);
    carapace(g, e, -9, 11);
    seams(g, e, [[0, -6, 0, 9]]);
    /* twin finlets at the tail — the speed silhouette */
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 1.6, -4], [sx * 6.4, -9.5], [sx * 4.2, -2.5]]);
      chassis(g, e);
      g.lineWidth = .9; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .65); g.stroke();
    }
    eye(g, e, 0, 2.5, 1.7);
  },

  /* WEEPER — mortar tub. A heavy shouldered lobber with a visible bore. */
  weeper(g, e) {
    exhaust(g, e, -4.5, -8, 2.2, 8);
    exhaust(g, e, 4.5, -8, 2.2, 8);
    mirrorPoly(g, [[0, 10], [6, 7], [10, -1], [5, -8], [0, -10]]);
    carapace(g, e, -10, 10);
    seams(g, e, [[-6.5, 1, 6.5, 1]]);
    /* mortar bore faces downfield */
    disc(g, 0, 6, 3.6, '#080510');
    g.lineWidth = 1.2; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .8); g.stroke();
    disc(g, 0, 6, 1.4, e.col === '#fff' ? '#fff' : lit(e.col, .4, .8));
    eye(g, e, 0, -3, 1.9);
  },

  /* TENDER — field medic. Soft hull, bright mending vanes, no fangs. */
  tender(g, e) {
    exhaust(g, e, -3.4, -7, 2, 7);
    exhaust(g, e, 3.4, -7, 2, 7);
    mirrorPoly(g, [[0, 11], [5.4, 6], [7.4, -2], [4, -9], [0, -11]]);
    carapace(g, e, -11, 11);
    seams(g, e, [[-4.6, 0, 4.6, 0], [0, -7, 0, 7]]);
    /* mending vanes — they pulse to the repair clock */
    const mend = .35 + .45 * Math.sin((e.t || 0) * 3.2);
    for (const sx of [-1, 1]) {
      poly(g, [[sx * 6, 3], [sx * 11.5, 0], [sx * 7, -4]]);
      chassis(g, e);
      g.lineWidth = 1; g.strokeStyle = PAL.good; g.stroke();
      disc(g, sx * 9.5, 0, 1.5, lit(PAL.good, .5, .3 + .6 * mend));
    }
    eye(g, e, 0, 2.5, 1.9, PAL.good);
  },

  /* RAVAGER — armored brawler. Slab plates over a rotating core fan. */
  ravager(g, e) {
    exhaust(g, e, -6, -10, 3, 12);
    exhaust(g, e, 6, -10, 3, 12);
    /* slab pauldrons */
    mirrorPoly(g, [[8, 7], [15.5, 3], [14, -6], [7, -7]]);
    chassis(g, e);
    g.lineWidth = 1.2; g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .75); g.stroke();
    mirrorPoly(g, [[0, 13], [7.5, 8], [9, -1], [5.5, -9], [0, -12]]);
    carapace(g, e, -12, 13);
    seams(g, e, [[-7, 2, 7, 2]]);
    /* the fan — rotates at exactly the firing spin, the honest tell */
    const spin = (e.t || 0) * 1.4;
    for (let i = 0; i < 4; i++) {
      const a = spin + i * TAU / 4;
      g.strokeStyle = e.col === '#fff' ? '#fff' : lit(e.col, .35, .8);
      g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(Math.cos(a) * 3.2, Math.sin(a) * 3.2 - 1);
      g.lineTo(Math.cos(a) * 7.2, Math.sin(a) * 7.2 - 1); g.stroke();
    }
    disc(g, 0, -1, 2.2, e.col === '#fff' ? '#fff' : lit(e.col, .5, .85));
    eye(g, e, 0, -6.5, 2);
  },

  /* ARBALEST — rail platform. Long spine, twin rails, honest aim line. */
  arbalest(g, e) {
    exhaust(g, e, -4, -11, 2.4, 9);
    exhaust(g, e, 4, -11, 2.4, 9);
    mirrorPoly(g, [[0, 9], [4.6, 5], [7, -4], [3.6, -11], [0, -13]]);
    carapace(g, e, -13, 9);
    seams(g, e, [[-4.6, -2, 4.6, -2]]);
    /* twin rails running fore-aft */
    for (const sx of [-1, 1]) {
      g.lineWidth = 1.4;
      g.strokeStyle = e.col === '#fff' ? '#fff' : rgba(e.col, .85);
      g.beginPath(); g.moveTo(sx * 2.6, -13); g.lineTo(sx * 2.6, 7); g.stroke();
    }
    /* charge bead slides the spine while the shot arms */
    if (e.railWarm > 0) {
      const k = 1 - e.railWarm;
      disc(g, 0, 6 - 13 * k, 1.7, lit(PAL.rare, .5, .9));
    }
    eye(g, e, 0, 1, 1.8, PAL.rare);
  },

  /* MIMIC — the shadow thief. A jagged mirror of your own silhouette. */
  mimic(g, e) {
    exhaust(g, e, -3, -9, 2.2, 9);
    exhaust(g, e, 3, -9, 2.2, 9);
    /* inverted-delta body — your silhouette, seen wrong */
    mirrorPoly(g, [[0, -12], [4.8, -4], [9.5, 4], [4, 10], [0, 7]]);
    carapace(g, e, -12, 10);
    seams(g, e, [[0, 8, 0, -8], [-4.2, -2, 4.2, -2]]);
    /* mirrored wingtips glow with your last line */
    const la = e.lastAim;
    for (const sx of [-1, 1]) {
      const wx = sx * 9.5, wy = 4;
      disc(g, wx, wy, 1.6, la != null ? lit(PAL.hull, .5, .9) : (e.col === '#fff' ? '#fff' : lit(e.col, .4, .7)));
    }
    eye(g, e, 0, -4, 2.1);
  }
};

/* ══════════════════════════════════════════════════════════════════════
   CAPITAL SHIPS
   Big enough to carry real structure: armour belts, hangar throats,
   destructible mounts, and damage that shows as the phases climb.
   ══════════════════════════════════════════════════════════════════════ */
/* scorch marks that accumulate with phase, so a wounded capital looks it */
function battleDamage(g, b, spots) {
  const ph = b.phase || 1;
  if (ph < 2) return;
  const n = ph >= 3 ? spots.length : Math.ceil(spots.length / 2);
  for (let i = 0; i < n; i++) {
    const s = spots[i];
    g.save();
    g.fillStyle = 'rgba(6,3,8,.42)';
    g.beginPath(); g.ellipse(s[0], s[1], s[2], s[2] * .6, s[3] || 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(s[0] + s[2] * .5, s[1] - s[2] * .3, s[2] * .5, s[2] * .34, s[3] || 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter';
    const flick = .2 + .25 * Math.abs(Math.sin((b.t || 0) * 3 + i));
    emitLocal(g, SPR.smoke, s[0], s[1], s[2] * 2.2, flick * .35);
    emitLocal(g, SPR.soft, s[0], s[1], s[2] * .8, flick * .55);
    g.restore();
  }
}
const BOSS_ART = {
  /* DREADNOUGHT — broadside capital. Two turret mounts you can kill. */
  dreadnought(g, b) {
    const t = b.t || 0;
    const flat = b.col === '#fff';
    /* engine bank along the back */
    for (const sx of [-38, -14, 14, 38]) {
      g.save();
      g.translate(sx, -40);
      g.scale(7, -20);
      g.fillStyle = vgrad(g, 'dreng' + b.col, 0, 1, flat ? [
        [0, '#fff'], [1, 'rgba(255,255,255,0)']
      ] : [
        [0, lit(b.col, .75, .8)], [.45, rgba(b.col, .35)], [1, rgba(b.col, 0)]
      ]);
      g.beginPath();
      g.moveTo(-1, 0); g.quadraticCurveTo(0, .8, 0, 1); g.quadraticCurveTo(0, .8, 1, 0);
      g.closePath(); g.fill();
      g.restore();
    }

    /* main hull */
    mirrorPoly(g, [[0, 48], [30, 34], [62, 22], [108, 12], [108, -4], [84, -14], [56, -26], [26, -34], [0, -40]]);
    carapace(g, b, -40, 48);

    /* armour belt */
    poly(g, [[-104, -2], [104, -2], [100, 12], [-100, 12]]);
    g.fillStyle = flat ? '#fff' : dark(b.col, .6);
    g.fill();
    g.lineWidth = 1.4; g.strokeStyle = flat ? '#fff' : rgba(b.col, .85); g.stroke();

    /* prow ram */
    poly(g, [[-26, 34], [0, 48], [26, 34], [18, 26], [-18, 26]]);
    g.fillStyle = flat ? '#fff' : dark(b.col, .42);
    g.fill();
    g.lineWidth = 1.6; g.strokeStyle = flat ? '#fff' : lit(b.col, .25, .9); g.stroke();

    /* structural frames */
    seams(g, b, [
      [-92, -12, 92, -12], [-56, -26, -56, 26], [56, -26, 56, 26],
      [-28, -34, -28, 34], [28, -34, 28, 34], [-74, -18, -74, 18], [74, -18, 74, 18]
    ]);
    /* hangar throat */
    g.fillStyle = '#05030a';
    g.fillRect(-20, 16, 40, 10);
    g.lineWidth = 1.2; g.strokeStyle = flat ? '#fff' : lit(b.col, .2, .9);
    g.strokeRect(-20, 16, 40, 10);
    for (let i = 0; i < 7; i++) {
      const k = Math.max(0, Math.sin(t * 4 - i * .6));
      g.fillStyle = flat ? '#fff' : lit(b.col, .6, .2 + .55 * k);
      g.fillRect(-18 + i * 5.4, 18, 3.4, 6);
    }

    /* destructible turret mounts */
    for (const sx of [-64, 64]) {
      const node = b.nodes && b.nodes.find(n => n.ox === sx);
      const dead = node && node.hp <= 0;
      disc(g, sx, 4, 14, dead ? '#150810' : '#0a0409');
      g.lineWidth = 1.8;
      g.strokeStyle = dead ? '#3d222c' : (flat ? '#fff' : lit(b.col, .2, .95));
      ringPath(g, sx, 4, 14); g.stroke();
      if (dead) {
        /* blown mount: cracked ring and a lingering ember */
        lines(g, [[sx - 10, -6, sx + 10, 14], [sx + 10, -6, sx - 10, 14]],
          'rgba(130,70,80,.8)', 1.4);
        g.save(); g.globalCompositeOperation = 'lighter';
        emitLocal(g, SPR.smoke, sx, 4, 46, .22 + .12 * Math.sin(t * 2.4 + sx));
        g.restore();
      } else {
        const gl = b.glow || 0;
        g.fillStyle = flat ? '#fff' : lit(b.col, .5, .32 + .6 * gl);
        g.beginPath(); g.arc(sx, 4, 6, 0, TAU); g.fill();
        /* barrel stub pointing down-well */
        g.fillStyle = flat ? '#fff' : dark(b.col, .5);
        g.fillRect(sx - 2.6, 12, 5.2, 10);
        if (gl > .05) {
          g.save(); g.globalCompositeOperation = 'lighter';
          emitLocal(g, SPR.foe, sx, 20, 26 * gl, gl * .9);
          g.restore();
        }
      }
    }

    /* bridge and reactor eye */
    poly(g, [[-16, -30], [16, -30], [11, -14], [-11, -14]]);
    g.fillStyle = flat ? '#fff' : dark(b.col, .8);
    g.fill();
    g.lineWidth = 1.4; g.strokeStyle = flat ? '#fff' : rgba(b.col, .9); g.stroke();
    lines(g, [[-9, -26, 9, -26], [-8, -22, 8, -22]],
      flat ? '#fff' : lit(b.col, .55, .7), 1);

    const pulse = .45 + .4 * Math.sin(t * 6);
    poly(g, [[0, 22], [12, 6], [0, -10], [-12, 6]]);
    g.fillStyle = flat ? '#fff' : lit(b.col, .3, pulse);
    g.fill();
    if (!flat) {
      g.save(); g.globalCompositeOperation = 'lighter';
      emitLocal(g, SPR.foe, 0, 6, 44, pulse * .5);
      g.restore();
    }
    disc(g, 0, 6, 3, '#fff');

    battleDamage(g, b, [[-44, 18, 11, .4], [38, -14, 9, -.3], [12, 30, 8, .8], [-72, -6, 7, 0]]);
  },

  /* MATRIARCH — hive. Chitin segments outside, a heart that never stops. */
  matriarch(g, b) {
    const t = b.t || 0;
    const flat = b.col === '#fff';

    /* outer chitin segments, slow clockwise */
    g.save(); g.rotate(t * .35);
    for (let i = 0; i < 6; i++) {
      g.save(); g.rotate(i / 6 * TAU);
      poly(g, [[0, -78], [17, -58], [9, -44], [-9, -44], [-17, -58]]);
      carapace(g, b, -78, -44);
      /* rib detail */
      lines(g, [[-11, -62, 11, -62], [-8, -54, 8, -54], [0, -76, 0, -46]],
        flat ? '#fff' : 'rgba(255,255,255,.18)', 1);
      /* spine tip */
      poly(g, [[0, -86], [4.5, -76], [-4.5, -76]]);
      g.fillStyle = flat ? '#fff' : dark(b.col, .35);
      g.fill();
      g.lineWidth = 1.2; g.strokeStyle = flat ? '#fff' : lit(b.col, .25, .9); g.stroke();
      disc(g, 0, -58, 2.6, flat ? '#fff' : lit(b.col, .5, .55 + .4 * Math.sin(t * 4 + i)));
      g.restore();
    }
    g.restore();

    /* connective struts */
    g.save(); g.rotate(-t * .22);
    g.strokeStyle = flat ? '#fff' : rgba(b.col, .35);
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
      g.lineTo(Math.cos(a) * 46, Math.sin(a) * 46);
    }
    g.stroke();

    /* inner shell */
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU, x = Math.cos(a) * 44, y = Math.sin(a) * 44;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    carapace(g, b, -44, 44);
    /* egg cells around the shell */
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + PI / 6;
      const x = Math.cos(a) * 31, y = Math.sin(a) * 31;
      const k = .3 + .5 * Math.max(0, Math.sin(t * 2.6 + i * 1.05));
      g.fillStyle = '#0b0410';
      g.beginPath(); g.ellipse(x, y, 6.5, 4.6, a, 0, TAU); g.fill();
      g.fillStyle = flat ? '#fff' : lit(b.col, .45, k);
      g.beginPath(); g.ellipse(x, y, 3.6, 2.4, a, 0, TAU); g.fill();
    }
    g.restore();

    /* heart */
    const pulse = .4 + .45 * Math.sin(t * 4);
    if (!flat) {
      g.save(); g.globalCompositeOperation = 'lighter';
      emitLocal(g, SPR.foe, 0, 0, 90, pulse * .45);
      g.restore();
    }
    g.fillStyle = flat ? '#fff' : rgrad(g, 'mtr' + b.col, 0, 0, 0, 1, [
      [0, '#fff'], [.3, lit(b.col, .45, .95)], [1, rgba(b.col, .25)]
    ]);
    g.save(); g.scale(21, 21);
    g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
    g.restore();
    g.lineWidth = 1.8; g.strokeStyle = flat ? '#fff' : lit(b.col, .55, .9);
    ringPath(g, 0, 0, 21); g.stroke();
    disc(g, 0, 0, 6.5 + Math.sin(t * 7) * 1.5, '#fff');

    battleDamage(g, b, [[-28, 26, 10, .5], [30, -20, 9, 0], [4, -36, 8, .3]]);
  },

  /* TYRANT — solar frame. Four spokes, a star in a cage. */
  tyrant(g, b) {
    const t = b.t || 0;
    const flat = b.col === '#fff';
    const gl = b.glow || 0;

    g.save(); g.rotate(b.spin || 0);
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate(i / 4 * TAU);
      /* spoke */
      poly(g, [[-8, -6], [-12, -92], [0, -106], [12, -92], [8, -6]]);
      carapace(g, b, -106, -6);
      lines(g, [[0, -100, 0, -14], [-9, -70, 9, -70], [-10, -46, 10, -46]],
        flat ? '#fff' : 'rgba(255,255,255,.16)', 1);
      /* emitter head */
      poly(g, [[0, -106], [9, -94], [0, -88], [-9, -94]]);
      g.fillStyle = flat ? '#fff' : dark(b.col, .55);
      g.fill();
      g.lineWidth = 1.5; g.strokeStyle = flat ? '#fff' : lit(b.col, .3, .95); g.stroke();
      disc(g, 0, -95, 6, flat ? '#fff' : lit(b.col, .45, .3 + .65 * gl));
      if (gl > .05 && !flat) {
        g.save(); g.globalCompositeOperation = 'lighter';
        emitLocal(g, SPR.foe, 0, -95, 40 * gl, gl * .85);
        g.restore();
      }
      g.restore();
    }
    g.restore();

    /* containment cage */
    g.strokeStyle = flat ? '#fff' : rgba(b.col, .4);
    g.lineWidth = 2.2;
    ringPath(g, 0, 0, 52); g.stroke();
    g.strokeStyle = flat ? '#fff' : rgba(b.col, .22);
    g.lineWidth = 1.2;
    ringPath(g, 0, 0, 58); g.stroke();

    /* the star */
    if (!flat) {
      g.save(); g.globalCompositeOperation = 'lighter';
      emitLocal(g, SPR.soft, 0, 0, 150, .3 + .12 * Math.sin(t * 3));
      g.restore();
    }
    g.fillStyle = flat ? '#fff' : rgrad(g, 'tyr' + b.col, 0, 0, .08, 1, [
      [0, '#fffaf0'], [.28, lit(b.col, .55)], [.72, b.col], [1, dark(b.col, .55)]
    ]);
    g.save(); g.scale(40, 40);
    g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
    g.restore();
    g.lineWidth = 2.4; g.strokeStyle = flat ? '#fff' : lit(b.col, .5, .95);
    ringPath(g, 0, 0, 40); g.stroke();

    /* convection arcs on the surface */
    g.globalAlpha = .45;
    g.strokeStyle = '#fff'; g.lineWidth = 1.1;
    for (let i = 0; i < 4; i++) {
      const rr = 22 + i * 5.5 + Math.sin(t * 3 + i) * 2.6;
      const dir = i % 2 ? 1 : -1;
      g.beginPath(); g.arc(0, 0, rr, t * dir + i, t * dir + i + 2.1); g.stroke();
    }
    g.globalAlpha = 1;

    battleDamage(g, b, [[-22, 24, 11, .6], [26, -18, 10, 0]]);
  },

  /* GATE WARDEN — the thing that holds the অপার্থিব side of the gate.
     Three shield arcs rotate around a core; shots between arcs are absorbed,
     so you fight the rotation as much as the hull. */
  gatewarden(g, b) {
    const t = b.t || 0;
    const flat = b.col === '#fff';
    for (const sx of [-34, 0, 34]) {
      g.save();
      g.translate(sx, -52);
      g.scale(6, -18);
      g.fillStyle = vgrad(g, 'geng' + b.col, 0, 1, flat ? [
        [0, '#fff'], [1, 'rgba(255,255,255,0)']
      ] : [
        [0, rgba(PAL.rare, .8)], [.45, rgba(PAL.rare, .3)], [1, rgba(PAL.rare, 0)]
      ]);
      g.beginPath();
      g.moveTo(-1, 0); g.quadraticCurveTo(0, .8, 0, 1); g.quadraticCurveTo(0, .8, 1, 0);
      g.closePath(); g.fill();
      g.restore();
    }
    /* star-shaped hull */
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU - PI / 2;
      const rr = i % 2 ? 66 : 42;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr + 4;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    carapace(g, b, -62, 70);
    seams(g, b, [[0, -40, 0, 48], [-46, 10, 46, 10]]);
    /* rotating shield arcs — the whole fight */
    for (let i = 0; i < 3; i++) {
      const a = (b.shieldAng || 0) + i / 3 * TAU;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = rgba(PAL.rare, b.absorbT > 0 ? .95 : .6);
      g.lineWidth = b.absorbT > 0 ? 5 : 3.5;
      g.beginPath(); g.arc(0, 4, 86, a - .5, a + .5); g.stroke();
      if (b.absorbT > 0) {
        emitLocal(g, SPR.rare, 0, 4, 150, .28);
      }
      g.restore();
    }
    /* gate emitter crown */
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU - PI / 2;
      disc(g, Math.cos(a) * 30, Math.sin(a) * 30 + 4, 4.5, '#0a0412');
      const k = .3 + .5 * Math.max(0, Math.sin(t * 3 + i * 1.25));
      disc(g, Math.cos(a) * 30, Math.sin(a) * 30 + 4, 2, flat ? '#fff' : lit(PAL.rare, .4, k));
    }
    /* core eye */
    g.save(); g.globalCompositeOperation = 'lighter';
    emitLocal(g, SPR.rare, 0, 4, 70, .4 + .2 * Math.sin(t * 4));
    g.restore();
    disc(g, 0, 4, 10, flat ? '#fff' : dark(PAL.rare, .5));
    eye(g, b, 0, 4, 5.5, flat ? '#fff' : PAL.rare);
    battleDamage(g, b, [[-30, 26, 10, .4], [34, -16, 8, -.5], [0, 40, 9, .9]]);
  },
  /* WARDENFALL — the corrupted warden. The Gate Warden's rotating-arc
     grammar bolted onto a dreadnought hull: four faster arcs, gold gate
     emitters, a core eye gone gold. Rare Sundays only. */
  wardenfall(g, b) {
    const t = b.t || 0;
    const flat = b.col === '#fff';
    for (const sx of [-38, -14, 14, 38]) {
      g.save();
      g.translate(sx, -40);
      g.scale(7, -20);
      g.fillStyle = vgrad(g, 'wfeng' + b.col, 0, 1, flat ? [
        [0, '#fff'], [1, 'rgba(255,255,255,0)']
      ] : [
        [0, rgba(PAL.rare, .85)], [.45, rgba(PAL.rare, .32)], [1, rgba(PAL.rare, 0)]
      ]);
      g.beginPath();
      g.moveTo(-1, 0); g.quadraticCurveTo(0, .8, 0, 1); g.quadraticCurveTo(0, .8, 1, 0);
      g.closePath(); g.fill();
      g.restore();
    }
    /* the warden's star hull, with the dreadnought's armour belt bolted on */
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU - PI / 2;
      const rr = i % 2 ? 66 : 42;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr + 4;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    carapace(g, b, -62, 70);
    poly(g, [[-104, -2], [104, -2], [100, 12], [-100, 12]]);
    g.fillStyle = flat ? '#fff' : dark(PAL.rare, .65);
    g.fill();
    g.lineWidth = 1.4; g.strokeStyle = flat ? '#fff' : rgba(PAL.rare, .85); g.stroke();
    seams(g, b, [[0, -40, 0, 48], [-46, 10, 46, 10]]);
    /* four arcs — matches the damageFoe guard exactly (4 windows of .4) */
    for (let i = 0; i < 4; i++) {
      const a = (b.shieldAng || 0) + i / 4 * TAU;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = rgba(PAL.rare, b.absorbT > 0 ? .95 : .55);
      g.lineWidth = b.absorbT > 0 ? 5 : 3;
      g.beginPath(); g.arc(0, 4, 86, a - .4, a + .4); g.stroke();
      if (b.absorbT > 0) emitLocal(g, SPR.rare, 0, 4, 150, .28);
      g.restore();
    }
    /* gold gate emitters — the fall of the warden burns bright */
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU - PI / 2;
      disc(g, Math.cos(a) * 30, Math.sin(a) * 30 + 4, 4.5, '#0a0412');
      const k = .35 + .55 * Math.max(0, Math.sin(t * 4.4 + i * 1.25));
      disc(g, Math.cos(a) * 30, Math.sin(a) * 30 + 4, 2, flat ? '#fff' : lit(PAL.gold, .4, k));
    }
    /* core eye — the warden's, gone gold */
    g.save(); g.globalCompositeOperation = 'lighter';
    emitLocal(g, SPR.rare, 0, 4, 76, .45 + .2 * Math.sin(t * 5));
    g.restore();
    disc(g, 0, 4, 10, flat ? '#fff' : dark(PAL.rare, .5));
    eye(g, b, 0, 4, 5.5, flat ? '#fff' : PAL.gold);
    battleDamage(g, b, [[-30, 26, 12, .4], [34, -16, 10, -.5], [0, 40, 11, .9], [-18, -20, 7, 1.2]]);
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PICKUPS
   Icons live inside a 13px hex, so they all have to read at one glance.
   ══════════════════════════════════════════════════════════════════════ */
function drawPickIcon(g, type, t) {
  g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
  switch (type) {
    case 'gun': {
      g.strokeStyle = PAL.hull;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(-6, i * 5 + 3); g.lineTo(0, i * 5 - 3); g.lineTo(6, i * 5 + 3);
        g.stroke();
      }
      g.fillStyle = rgba(PAL.hullLit, .9);
      g.beginPath(); g.arc(0, -6.2, 1.2, 0, TAU); g.fill();
      break;
    }
    case 'shield': {
      g.strokeStyle = PAL.tech;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU - PI / 2, x = Math.cos(a) * 7.5, y = Math.sin(a) * 7.5;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.fillStyle = rgba(PAL.tech, .16); g.fill();
      g.stroke();
      g.strokeStyle = rgba(PAL.tech, .55); g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, 3.6, 0, TAU); g.stroke();
      disc(g, 0, 0, 1.6, PAL.tech);
      break;
    }
    case 'over': {
      g.strokeStyle = PAL.good;
      g.beginPath(); g.moveTo(-6.5, 3.5); g.lineTo(0, -4); g.lineTo(6.5, 3.5); g.stroke();
      g.beginPath(); g.moveTo(-6.5, 8.5); g.lineTo(0, 1); g.lineTo(6.5, 8.5); g.stroke();
      g.globalAlpha = .45 + .35 * Math.sin(t * 6);
      g.beginPath(); g.moveTo(-6.5, -1.5); g.lineTo(0, -9); g.lineTo(6.5, -1.5); g.stroke();
      g.globalAlpha = 1;
      break;
    }
    case 'pulse': {
      const s = 1 + .16 * Math.sin(t * 6);
      g.strokeStyle = PAL.rare; g.lineWidth = 1.6;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        g.moveTo(Math.cos(a) * 3.4 * s, Math.sin(a) * 3.4 * s);
        g.lineTo(Math.cos(a) * 9.5 * s, Math.sin(a) * 9.5 * s);
      }
      g.stroke();
      g.strokeStyle = rgba(PAL.rare, .5); g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, 6.4 * s, 0, TAU); g.stroke();
      disc(g, 0, 0, 2.4, lit(PAL.rare, .5));
      break;
    }
    case 'hull': {
      g.strokeStyle = PAL.hullLit; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 7); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
      g.strokeStyle = rgba(PAL.hullLit, .35); g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.stroke();
      break;
    }
    case 'alloy': {
      /* faceted ingot — reads as currency, not as a pickup buff */
      g.strokeStyle = PAL.gold; g.lineWidth = 1.5;
      poly(g, [[0, -8], [7, -2.5], [4.5, 7], [-4.5, 7], [-7, -2.5]]);
      g.fillStyle = rgba(PAL.gold, .42); g.fill();
      g.stroke();
      lines(g, [[0, -8, 0, 7], [-7, -2.5, 7, -2.5]], rgba(PAL.gold, .55), 1);
      g.globalAlpha = .35 + .3 * Math.sin(t * 5);
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(-2.4, -3.4, 1.8, 1.1, -.5, 0, TAU); g.fill();
      g.globalAlpha = 1;
      break;
    }
  }
  g.lineCap = 'butt'; g.lineJoin = 'miter';
}
const PICK_SPR = { gun: 'hull', shield: 'tech', over: 'good', pulse: 'rare', hull: 'white', alloy: 'gold' };
const PICK_COL = { gun: () => PAL.hull, shield: () => PAL.tech, over: () => PAL.good, pulse: () => PAL.rare, hull: () => PAL.hullLit, alloy: () => PAL.gold };
