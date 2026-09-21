# EMBERFALL — performance baseline

*Measured on the dev preview (desktop Chrome-class canvas, DPR 1). Absolute numbers
are machine-specific; the **ratios** are the durable facts. Re-run after any
renderer change: the method is at the bottom, and `tools/econsim.js` follows the
same extract-from-source discipline for economy constants.*

## Frame cost (main-thread execution)

| Scenario | Frame cost | Sky stack share | 3-plane nebula share |
|---|---|---|---|
| Desktop title (all drifts live) | 1.36 ms | 0.59 ms (44%) | 0.045 ms |
| Low-end emulation + 12 ms injected CPU load, title | 0.90 ms | 0.52 ms | — |
| Low-end emulation + 12 ms injected CPU load, combat | 1.02 ms (p95 1.4) | 0.43 ms | — |

Take-aways:

- **Sky drifts are effectively free.** Ring shear, storm swirl, moon terminator
  and the nebula planes together cost under 0.6 ms — the differential-parallax
  rework (three `drawImage` stamps over two cached bakes) measured 0.045 ms/frame.
- **The backdrop bake is the one expensive sky operation — and it is keyed.**
  A full `buildBackdrop()` (planet, storms, craters, moons, dust) measured
  **3.65 ms** on the reference desktop — fine once at run start, unacceptable
  every wave. Since v4.4 `syncStage` keys the bake on (stage · palette · worn
  paint): three same-world wave starts trigger exactly **one** bake
  (suite-guarded and measured live in the preview). Wave starts with an
  unchanged sky cost zero.
- **Headroom at 4x throttle is ~28 frames.** With a 12 ms/frame busy-wait
  injected (≈ a 4x-throttled phone), worst-case combat execution stayed ~1.4 ms.
- **The death-spiral clamp is real.** Injecting 8 sim-steps of backlog: the
  5-step ceiling dropped it in one frame (0.1 ms), then drained to zero —
  frame rate degrades, simulation correctness never does.
- **Auto-quality is the safety net.** `fpsEMA < 46` for ~3 s steps quality down;
  tier 3 (Auto → Full) is the most expensive cell in every measurement, which is
  exactly what the ladder steps *away* from.

## GPU fill (render + forced pipeline flush)

| Tier | DPR 1 (0.88 MP) | DPR 3 (7.9 MP) |
|---|---|---|
| 0 · Battery (no bloom, 0.68×) | 8.7 ms | 18.0 ms |
| 1 · Balanced (bloom, 0.85×) | 9.9 ms | **15.6 ms** |
| 2 · Full (bloom, 1.0×) | 8.5 ms | 17.5 ms |
| 3 · Auto (→ Full) | 9.6 ms | 23.2 ms |

(~8 ms of every cell is the flush itself; read the deltas.)

Take-aways:

- **The game is not fill-bound.** 9× the pixels costs ~2× the time — fixed
  per-frame JS/draw-call work dominates.
- **The production DPR clamp (`min(devicePixelRatio, 2)`) is the biggest single
  perf feature** — the DPR-3 column shows what high-DPI phones would pay without
  it (~+40% vs the clamped worst case).
- **Tier 1 can beat tier 0 at high DPR** (0.85× scale saves more fill than bloom
  costs) — on weak devices, render scale matters more than bloom.
- Bloom is the first thing auto-quality drops anyway; particle/debris cuts are
  the CPU-side lever.

## In-device verification

Settings → **Show FPS** draws the built-in profiler: raw-dt ring (90 frames,
250 ms clamp), sparkline over 16.7/33.3 ms guides, fps + p50/p95/max,
`sim ms × steps` with a red **CLAMP** flag when the spiral guard engages, and
DPR · quality · entity context. This is the instrument for the two things no
emulation can prove: real-phone GPU fill at 3× DPR and thermal behavior.

## Method (reproducible)

```js
// execution cost: wrap stepGame/drawBackdrop/render with performance.now()
// delta recorders; sample 400+ frames per scenario.
// throttle emulation: inject a busy-wait after render() every frame:
const busy = ms => { const t0 = performance.now(); while (performance.now() - t0 < ms); };
// GPU cost: render(); ctx.getImageData(0,0,1,1) — forces pipeline completion;
// subtract the flush-only baseline measured without a preceding render.
// low-end emulation: Object.assign(QUALITY, qualityFor(0)); QUALITY.scale = .68;
// DPR = .68 (render-scale path); auto-quality disabled (CFG.quality = 0).
```

Caveat: this is the desktop browser's 2D pipeline — it bounds relative costs,
not absolute device frame times.
