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

- `packages/sim/` is a TypeScript re-implementation of catalog / stage / combat / boss logic. It is used by the sim's own tests and goldens.
- **The shipped game does not import `packages/sim`.** The game path and the sim path are currently separate. New gameplay that belongs in "the simulation" has to decide whether it lives in the inline core, in `packages/sim`, or in a new seam — and the choice has consequences for drift, test coverage, and the determinism story.
- The backlog item `EXP-007` (content registry seam without changing current behavior) is the right place to close this, but it is not done yet.

## 3. Typing is not enforced in CI

- TypeScript is in `devDependencies` (currently a recent major version), and several sim files are `.ts`.
- There is **no `tsc --noEmit` step in CI**. Types are not checked by the gate.
- If expansion adds TypeScript content, either add a typecheck gate or accept that types are documentation-only. Right now they are documentation-only.

## 4. Score verification is still forward-looking

- Current boards are **bounds-checked and rate-limited**, not replay-verified. This is documented honestly in `SECURITY.md` and elsewhere.
- The expansion bible's `verified-daily` / `replay-verified` tiers, the `replayContract` in `content-schema.json`, and backlog items `EXP-003` and `EXP-018` are real forward-looking design — but they are *not yet implemented*.
- Until a replay re-simulation path exists, the UI must keep calling current scores *bounds-checked*, never *verified*. The expansion plan must not relabel existing behavior.

## 5. CI is not yet fully stable

- Two CI fixes are open but **not merged** as of this writing: the duplicate-run trigger fix and the Playwright browser-cache fix.
- The `docs/expansion-design` branch this work came from failed CI partly because its `ci.yml` was the unfixed version. Any expansion docs PR should either carry those fixes or rebase onto a main that has them, or it will hit the same flake and block on CI instead of on review.

## 6. What must be true before gameplay implementation starts

Per `IMPLEMENTATION_BACKLOG.md`, gameplay coding may begin only after `EXP-001` through `EXP-005` are approved and the Heliox three-stage brief is signed off. On top of that, the following should be true before a large batch of new gameplay lands:

- A real plan for the monolith / `packages/sim` seam, so new scored content has a defined place to live and a test path that covers the shipped game.
- A typecheck gate in CI if expansion adds TypeScript; if there is still no typecheck gate, TypeScript content will not be typechecked in CI.
- An accepted verification story for any leaderboard tier that implies "verified," with the UI language to match.

## 7. What this doc is not

- It is not a reason to stop planning. The bible, schema, and backlog are useful as planning artifacts.
- It is not a judgment that expansion is a bad idea. It is a reminder that expansion is a *large* idea being considered for a codebase with real, named debt.
- It is not a substitute for the backlog's own acceptance criteria. Where they conflict, the backlog and the bible win for expansion decisions; this doc wins for "can we even start."
