// Emberfall render post-FX — emissive emit + two-stage bloom (ADR 0003).
// Single-path module: this file IS the live path — the client loads it as a
// classic script (index.html) and packages/sim/src/render-emit-bloom.ts
// adapts the same bytes for tests, so goldens guard the live path.
// Load-time pure: declares only. The core creates one instance via
// EB.make(host) and forwards emit / bloomBegin / bloomComposite to it.
//
// Host contract (all accessors, so the core keeps owning its state):
//   ctx()          main canvas 2d context (draws emissives + composite)
//   bctx()         quarter-res bloom buffer context
//   bloomCv()      the bloom canvas itself (reads .width/.height; its ctx
//                  must be host.bctx(), matching index.html's wiring)
//   W(), H()       frame size in CSS px
//   QUALITY()      quality dial object; only .bloom is read here
//   BLOOM_DIV()    bloom buffer divisor
//   CAN_FILTER()   whether canvas.ctx.filter is supported
//   makeCanvas()   DOM factory for the instance-owned second-stage canvas
(function () {
  'use strict';

  const G = (typeof window !== 'undefined') ? window : globalThis;

  G.EB = {
    make(host) {
      /* was index.html: `let bloomDirty = false` — one flag shared by
         emit / begin / composite, exactly as before */
      let dirty = false;
      /* was index.html: `const bloomCv2 = document.createElement('canvas')`
         + `const bctx2 = bloomCv2.getContext('2d')` — the half-size,
         blurred copy the tight-core stage reads from. Created lazily via
         the host's DOM factory the first time a composite actually needs
         it, so the runtime itself never touches `document` and a
         DOM-less Node harness can still build and drive the instance. */
      let bloom2 = null, bctx2 = null;

      return {

        isDirty() { return dirty; },

        /* Draw one emissive sprite: onto the main canvas at full scale,
           and — when the quality dial has bloom on — into the quarter-res
           bloom buffer at 85% alpha, marking the buffer dirty. Callers
           pass the CENTER (x, y) and the full SIZE, like before. */
        emit(spr, x, y, size, alpha) {
          const con = host.ctx();
          con.globalAlpha = alpha;
          con.drawImage(spr, x - size / 2, y - size / 2, size, size);
          con.globalAlpha = 1;
          if (host.QUALITY().bloom) {
            const b = host.bctx();
            const k = 1 / host.BLOOM_DIV();
            b.globalAlpha = alpha * .85;
            b.drawImage(spr, (x - size / 2) * k, (y - size / 2) * k, size * k, size * k);
            b.globalAlpha = 1;
            dirty = true;
          }
        },

        bloomBegin() {
          if (!host.QUALITY().bloom) return;
          const b = host.bctx();
          b.setTransform(1, 0, 0, 1, 0, 0);
          b.clearRect(0, 0, host.bloomCv().width, host.bloomCv().height);
          b.globalCompositeOperation = 'lighter';
          dirty = false;
        },

        bloomComposite() {
          if (!host.QUALITY().bloom || !dirty) return;
          const con = host.ctx(), b = host.bctx();
          con.save();
          con.globalCompositeOperation = 'lighter';
          if (host.CAN_FILTER()) {
            // two-stage bloom: tight core from the quarter buffer, wide halo from a
            // blurred half-size copy. One blur pass alone reads as haze, not glow.
            const w2 = Math.max(1, b.canvas.width >> 1), h2 = Math.max(1, b.canvas.height >> 1);
            if (!bloom2) { bloom2 = host.makeCanvas(); bctx2 = bloom2.getContext('2d'); }
            if (bloom2.width !== w2 || bloom2.height !== h2) { bloom2.width = w2; bloom2.height = h2; }
            bctx2.setTransform(1, 0, 0, 1, 0, 0);
            bctx2.clearRect(0, 0, w2, h2);
            bctx2.filter = 'blur(2px)';
            bctx2.drawImage(b.canvas, 0, 0, w2, h2);
            bctx2.filter = 'none';
            /* restrained two-stage bloom: tight core at low alpha, whisper of halo.
               Glow should rim bright things, not replace them. */
            con.filter = 'blur(' + (3.5 / host.BLOOM_DIV() * 3).toFixed(1) + 'px)';
            con.globalAlpha = .5;
            con.drawImage(b.canvas, 0, 0, host.W(), host.H());
            con.filter = 'blur(' + (14 / host.BLOOM_DIV() * 3).toFixed(1) + 'px)';
            con.globalAlpha = .28;
            con.drawImage(bloom2, 0, 0, host.W(), host.H());
            con.filter = 'none';
          } else {
            con.globalAlpha = .55;
            con.drawImage(b.canvas, 0, 0, host.W(), host.H());
            con.globalAlpha = .28;
            con.drawImage(b.canvas, 0, 0, host.W(), host.H());
          }
          con.restore();
          con.globalAlpha = 1;
        }
      };
    }
  };
})();
