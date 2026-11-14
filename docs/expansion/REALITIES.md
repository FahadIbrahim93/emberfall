# Expansion realities — current codebase constraints

**Status:** Honest tether, not a veto. Planning only.  
**Companion to:** `EMBERFALL_EXPANSION_DESIGN_BIBLE.md`, `IMPLEMENTATION_BACKLOG.md`.

This doc states things that are true about the repo *right now*. Any expansion work — especially the Heliox Forge vertical slice — has to be feasible against these realities, and the implementation backlog should be read with them in mind.

## 1. What the shipped game actually is

- One file, `index.html`, roughly 9,100 lines, with inline `<style>` and inline `<script>`. No bundler, no build step.
- Classic script load order: `audio → sky → net → art → input → inline core`. Loaded as classic scripts, not modules.
- Plays from `file://`, runs offline as a PWA, zero runtime npm dependencies in the game itself.
- Canvas gameplay lives in the inline core plus `js/art.js`, `js/sky.js`, `js/net.js`, `js/input.js`, `js/audio.js`, `js/cloud.js`.

Any new scored content (stage, hazard, enemy, boss, plane, objective, mission) that touches gameplay must have a home in this load-contract world, or the seam that lets it live elsewhere must be built first *without changing current behavior*.

## 2. The simulation seam is not closed

- **Update 2026-11-14 (seam closed):** `packages/sim/` is no longer a second implementation. The 1,180-line TypeScript copy is deleted; `packages/sim/src/index.ts` is a typed facade over the shipped inline core, which `packages/sim/host/env.mjs` boots headlessly in a Node `vm`. The game and the tests therefore run the same simulation by construction.
- **The parity gate is an equality gate, not a ratchet.** `tools/parity.test.mjs` compares the shipped core's 900-tick digest and per-tick chain against committed values; `packages/sim/tests/parity-shipped.test.ts` drives each golden through the facade and through a raw `stepGame` loop and requires identical per-tick digests; `tools/parity/cross-sim-baseline.json` holds one digest, not two. Perturbing bolt speed in `index.html` from 1020 to 980 failed both gates, naming tick 95; restoring it went green. Numbers and the reconciliation record: `docs/sim-parity.md`.
- **The shipped game still does not `import` anything.** It loads the inline core as a classic script, unchanged, so `file://` play needs no build. New scored gameplay goes in the inline core, where the gates now cover it.
- The backlog item `EXP-007` (content registry seam without changing current behavior) is the right place to close this, but it is not done yet.

## 3. Typing is not enforced in CI

- TypeScript is in `devDependencies` (currently a recent major version), and several sim files are `.ts`.
- **Update 2026-11-14:** there is a `tsc --noEmit` step — `npm run typecheck`, also run from `check.sh` — covering `packages/sim/src` under `strict`. That directory is now a facade plus type declarations, so the gate covers the test-facing API, not the simulation.
- That gate is deliberately scoped to the sim package. Anything new in TypeScript outside `packages/sim/src` is not typechecked until it is added to `tsconfig.json`'s `include`, and plain JavaScript (the inline core, `js/*.js`) has no type checking beyond syntax.
- `vitest --coverage` reports v8 coverage for the facade only (98.05% statements, 82.14% branches, 92.85% functions, 98.87% lines). The simulation itself is inline JavaScript in `index.html` and cannot be instrumented by this harness; its cover is the per-tick parity and golden gates, not a line count.

## 4. Score verification is still forward-looking

- Current boards are **bounds-checked and rate-limited**, not replay-verified. This is documented honestly in `SECURITY.md` and elsewhere.
- The expansion bible's `verified-daily` / `replay-verified` tiers, the `replayContract` in `content-schema.json`, and backlog items `EXP-003` and `EXP-018` are real forward-looking design — but they are *not yet implemented*.
- Until a replay re-simulation path exists, the UI must keep calling current scores *bounds-checked*, never *verified*. The expansion plan must not relabel existing behavior.

## 5. CI stability

- **Update 2026-11-14:** both fixes landed long ago — the duplicate-run trigger fix (PR #51) and the Playwright browser cache (PR #52), which `ci.yml` now uses. Do not carry the old workaround branches.
- The remaining stability risk is environmental, not structural: the browser suite runs on a software renderer, which is why the fun-curve fps column is a trend and not an absolute (see the README note).

## 6. What must be true before gameplay implementation starts

Per `IMPLEMENTATION_BACKLOG.md`, gameplay coding may begin only after `EXP-001` through `EXP-005` are approved and the Heliox three-stage brief is signed off. On top of that, the following should be true before a large batch of new gameplay lands:

- Extracting the inline core into `js/sim.js` (a ninth classic script) so coverage can instrument the simulation and the `vm` bootstrap can go away. The seam is closed; this is the next structural step, not a correctness gap.
- A typecheck gate in CI if expansion adds TypeScript; if there is still no typecheck gate, TypeScript content will not be typechecked in CI.
- An accepted verification story for any leaderboard tier that implies "verified," with the UI language to match.

## 7. What this doc is not

- It is not a reason to stop planning. The bible, schema, and backlog are useful as planning artifacts.
- It is not a judgment that expansion is a bad idea. It is a reminder that expansion is a *large* idea being considered for a codebase with real, named debt.
- It is not a substitute for the backlog's own acceptance criteria. Where they conflict, the backlog and the bible win for expansion decisions; this doc wins for "can we even start."
