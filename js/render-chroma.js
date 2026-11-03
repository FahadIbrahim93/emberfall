// Emberfall render post-FX — chroma aberration pass (ADR 0003).
// Single-path module: this file IS the live path — the client loads it as a
// classic script (index.html) and packages/sim/src/render-chroma.ts adapts
// the same bytes for tests, so goldens guard the live path.
// Load-time pure: declares only. The core creates one instance via
// CH.make(host) and calls apply() once per frame, AFTER the scene and
// BEFORE bloomComposite().
//
// Host contract (all accessors, so the core keeps owning its state):
//   ctx()        main canvas 2d context — the pass WRITES here (it draws the
//                finished frame back over itself with channel-split ghosts)
//   cv()         the main canvas element — the pass READS the finished frame
//   chromaCv()   offscreen capture buffer (canvas; .width/.height read+write)
//   chromaCtx()  its 2d context — captures the frame
//   W(), H()     frame size in CSS px
//   enabled()    CFG.flash && CAM.chromaRamp > .02 && CAN_FILTER &&
//                QUALITY.scale > .8 — the inline gate, unchanged
//   ramp()       CAM.chromaRamp — strength of the current aberration
(function () {
  'use strict';

  const G = (typeof window !== 'undefined') ? window : globalThis;

  G.CH = {
    make(host) {
      return {

        /* Capture the finished frame to an offscreen canvas, then draw it
           back over itself with two filtered, channel-shifted ghosts: sepia
           held red, sepia held teal. Drawing the main canvas onto ITSELF
           with a filter + lighter composite is unreliable across browsers
           (Chrome in particular can drop or smear frames when src == dst),
           so the pass reads from the stable capture buffer instead.
           One extra blit per flash frame; the gate makes it free otherwise. */
        apply() {
          if (!host.enabled()) return;
          const con = host.ctx();
          const k = host.ramp() * 2.2;
          const capture = host.chromaCv(), cW = host.W(), cH = host.H();
          if (capture.width !== cW || capture.height !== cH) {
            capture.width = cW; capture.height = cH;
          }
          const cap = host.chromaCtx();
          cap.setTransform(1, 0, 0, 1, 0, 0);
          cap.clearRect(0, 0, cW, cH);
          cap.drawImage(host.cv(), 0, 0);
          con.save();
          con.globalCompositeOperation = 'lighter';
          con.globalAlpha = Math.min(.5, k * .4);
          // channel-split ghosting: scaled copies tinted to the opposite channels
          con.filter = 'sepia(1) saturate(6) hue-rotate(-25deg)';
          con.drawImage(capture, -k, 0, cW, cH);
          con.filter = 'sepia(1) saturate(6) hue-rotate(140deg)';
          con.drawImage(capture, k, 0, cW, cH);
          con.filter = 'none';
          con.restore();
        }
      };
    }
  };
})();
