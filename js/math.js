// Emberfall shared math — scalars + curve table (ADR 0003).
// Single-path module: this file IS the live path — the client loads it as a
// classic script (index.html) and packages/sim/src/math.ts adapts the same
// bytes for tests, so scored math guards the live path.
//
// Not here on purpose: `damp` (frame-rate smoothing in the inline core),
// pad/format helpers, and the score curve module-local call ordering —
// only the five helpers the sim package adapts live in this file.
(function () {
  'use strict';

  const G = (typeof window !== 'undefined') ? window : globalThis;

  const TAU = Math.PI * 2;
  const PI = Math.PI;

  G.MATHMOD = {
    TAU,
    PI,

    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },

    lerp(a, b, k) { return a + (b - a) * k; },

    /* shortest signed angular difference, wrapped into (-PI, PI] */
    angDiff(a, b) {
      let d = b - a;
      while (d > PI) d -= TAU;
      while (d < -PI) d += TAU;
      return d;
    },

    /* combo multiplier bands — the 5/2 cutoffs are the client contract */
    multFor(c) { return c >= 40 ? 5 : c >= 24 ? 4 : c >= 13 ? 3 : c >= 5 ? 2 : 1; }
  };
})();
