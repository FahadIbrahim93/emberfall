# ADR 0006 — RNG contract

Date: 2026-10-18 · Status: accepted (runtime already follows this; the ADR codifies it)

## Rule

Two independent streams, one owner each:

- **`R`** — the run-seeded stream (seeded per run; shared seed across devices
  only for the daily gauntlet). Every draw that can change score, placement,
  leaderboard, alloy, medal outcomes, daily parity or run reproducibility goes
  through `R` (via `simRandom()` / `srnd`).
- **`FX`** — the cosmetic stream, seeded from `Math.random()` at boot and
  freely reseeded. Particle flicks, art bakes, boot-timing jitter, background
  dust. Ever reseeded mid-run, so FX must never leak into scored math.

## Enforcement

- In-game determinism gate: with the selftest direct-mode flag set,
  `simRandom()` throws when scored code touches FX — a regression fails
  loudly mid-suite instead of corrupting daily parity silently.
- Review rule: no new scored call site may draw `Math.random()` or `FX`.
- A `deadscan`-class grep gate may follow if it can be made false-positive
  free; until then review owns it.

## Known cosmetic-class exceptions (honest floor)

- Backdrop bakes (moon/mare dithering, crater density) use `Math.random()` —
  baked once per palette/quality change, never affects play.
- Hazard *ambience* draws (storm strike lane X, cloudbank berth, flare berth)
  use `FX.range` today. They shape where lightning shows, not hull survival
  math, but they are adjacent to combat and are deliberately listed here.
  Tightening them onto `R` is allowed at any wave-boundary PR; changing them
  was intentionally NOT bundled with the ADR wiring to keep this PR
  behavior-preserving (ADR 0003 scope).
- `boot tick` jitter uses `Math.random()` — pre-title UX only.
