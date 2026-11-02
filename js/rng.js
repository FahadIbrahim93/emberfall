// Emberfall deterministic RNG — mulberry32 + FNV-1a hash (ADR 0003).
// Single-path module: this file IS the live path — the client loads it as a
// classic script (index.html) and packages/sim/src/rng.ts adapts the same
// bytes for tests/randorune goldens, so determinism checks guard the live
// path. Load-time pure: no state created at import — the inline core keeps
// owning R (run-seeded) and FX (cosmetic-only) instances.
(function () {
  'use strict';

  const G = (typeof window !== 'undefined') ? window : globalThis;

  G.RNGMOD = {

    /* mulberry32 — identical output ordering to the original inline bytes */
    makeRng(seed) {
      let a = seed >>> 0;
      const f = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      f.range = (lo, hi) => lo + f() * (hi - lo);
      f.int = (lo, hi) => Math.floor(f.range(lo, hi + 1));
      f.pick = arr => arr[Math.floor(f() * arr.length) % arr.length];
      f.chance = p => f() < p;
      f.sign = () => f() < .5 ? -1 : 1;
      f.reseed = seed => { a = seed >>> 0; };
      return f;
    },

    /* FNV-1a 32-bit string hash */
    hashStr(s) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    }
  };
})();
