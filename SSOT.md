# EMBERFALL — Single Source of Truth

**Last updated:** 2026-02-17
**Owner:** maintainers
**Status:** active plan

## Purpose

This is the SSOT for the long-term health of the EMBERFALL codebase. It captures:

- Where we are today (honest scores)
- Where we want to be (10/10 definition per aspect)
- The phased plan to get there
- The standards we hold the code to as we work

It is meant to be *used*, not admired. When a decision touches architecture, correctness, performance, testing, security, or docs, check this file first.

---

## 1. Current State (as of this writing)

### Summary scores

| Aspect | Score | One-line reason |
|---|---|---|
| Architecture & Modularity | 4/10 | Game core is one ~7,000-line inline script in `index.html`; strong pockets elsewhere (`packages/sim`, `js/art.js`) but no real module boundaries for the game itself. |
| Code Quality & Readability | 6.5/10 | Honest, informative comments and a real design-token system, but a giant file is still a giant file. |
| Correctness & Robustness | 5.5/10 | Strong where beaten on (boot, render, backend); more fragile where it's a large handwritten simulation with global mutable state and manually managed canvas state. |
| Performance | 7/10 | Good hot-path decisions and auto-quality, but heavy ambient sky layers and large load-time cost. |
| Testing & QA | 7.5/10 | Real layered strategy (sim goldens, pixel-hash selftests, Playwright E2E, smoke, CI); stronger on "what we render" than on systematic surface coverage. |
| Security | 7/10 | Backend is seriously defensive; client is a large inline blob and auth is a bespoke surface. |
| Documentation & Maintainability | 5/10 | Docs exist, but the dominant reality is a giant handwritten artifact with no clean onboarding path into the core. |

**Overall: ~6.5/10.**

### What's good and must be preserved

- Fixed-step simulation with accumulator, step cap, and spiral-clamp reporting.
- Quarter-res bloom buffer, bloom dirty-flag gating, DPR cap, desynchronized context, quality auto-tuning.
- Prebuilt backdrop canvases, cached gradients, deterministic sprite/backdrop building.
- Strong backend posture: scrypt, per-user salt, constant-time compare, random sessions, SHA-256 storage, secure cookies, parameterized SQL, input validation/length caps, per-IP rate limits, security headers, explicit static allowlist.
- Real test culture: sim golden tests, pixel-hash render selftests, Playwright E2E, smoke tests, CI wiring.
- "Zero third-party in boot" privacy/security property.
- Heavy, honest comments that explain *why*.

### What hurts and must change

- The main game is effectively one enormous handwritten file. That is the central maintainability liability.
- State is widely reachable (global entity stacks, `GAME`/`CAM`/`P`), so correctness depends on discipline across the whole file rather than on structure.
- Render/effect code reaches into the main canvas in ways that invite subtle corruption (the chroma self-draw bug and the moon-map misalignment are recent examples).
- Ambient sky layers cost more than their screen footprint.
- Tests are strong for scenes, weaker for surfaces and negative cases.
- No one can comfortably own or change the core without reading most of it.

---

## 2. What 10/10 Means Here

Do not read "10/10" as "perfect." Read it as "best-in-class for a shipped indie game of this kind, with no obvious structural liability left unaddressed."

- **Architecture:** the game source is modular and the document is a thin host; server and game are clearly separated concerns.
- **Readability:** no single file holds the whole game; hot paths are explicit; each module has a small, clear contract.
- **Correctness:** bugs are caught by structure *and* tests before baselines; state is owned; edge cases are exercised; canvas state is hygienic by rule.
- **Performance:** ambient cost matches visibility; load time is lean; quality ladder is evidence-based; profiling is available.
- **Testing:** surface coverage *and* visual baselines, with deliberate baseline updates and fast, trustworthy CI.
- **Security:** backend posture is proven by tests; client is lean and free of third-party creep; secrets never live in repo or client.
- **Documentation:** onboarding is real, the module map stays current, and docs are tied to code rather than floating.

---

## 3. Non-Negotiables (Standards While We Work)

These apply to every change made under this plan.

1. **No behavior regression.** The existing pixel-hash baselines and playground behavior are the spine. Any render change must either keep baselines or update them with a documented reason.
2. **No new monolith.** We do not solve the giant-file problem by adding another giant file. New game code goes into modules with a narrow contract.
3. **Canvas state hygiene.** Every `save`/`restore`, composite-mode change, and filter change must be scoped and restored. Effects that read from the main canvas must read from a stable buffer, not from the canvas they are drawing onto.
4. **Backend stays defensive.** Parameterized SQL, constant-time compare, secure cookies, input validation/length caps, rate limits, security headers — these are not optional and are not "good enough already."
5. **Zero third-party in boot.** Do not introduce network dependencies into the boot path to solve a client problem.
6. **Secrets stay out.** No API keys, tokens, or credentials in code, bundle, logs, or chat. Use the platform's secret mechanism when something new is needed.
7. **Tests travel with code.** A module gets tests when it is extracted or changed in a way that matters. No orphaned cleanup without coverage where it counts.
8. **One change at a time, verified.** Small steps, re-run the right checks after each step, do not pile unrelated changes into a "make it 10/10" commit.

---

## 4. The Ultimate Plan

This is phased on purpose. Each phase has an exit condition. Do not start a phase until the previous phase's exit condition is met.

### Phase 0 — Stabilize what we already changed

**Status:** Done locally (commit `0ea9bfc`), awaiting authenticated push.

**What it covers:**
- Chroma offscreen buffer (no more main-canvas self-draw during the chroma pass).
- Moon lighting-map alignment fix.
- Chroma canvas kept in sync on resize.

**Exit condition:**
- Commit landed on `main`.
- `node tools/selftest-ci.js` passes.
- `npm run test:sim` passes.
- Playwright `tests/game.spec.js` passes.
- One live playthrough across a few waves shows no console errors and no flashing in the upper screen during chroma-triggering events.

**Why first:** This is the most recent correctness fix and it touches the exact class of problem we are trying to stop recurring. It must be solid and landed before we start cutting the file apart.

---

### Phase 1 — Make the file navigable without rewriting it

**Goal:** You can find and change a piece of the game without reading 7,000 lines first. No behavior change. Baselines preserved.

**Work:**
1. Add a short `DEVELOPMENT.md` covering:
   - how to run locally
   - how to run each test layer
   - where the hot paths are
   - how baselines work and how to update them responsibly
2. Create lightly-separated module files for the current hot/critical regions *as extracted source*, while keeping the existing inline script as the published artifact during the transition.
   - Recommended first cut (in priority order):
     - `game/loop.ts` or `.js` — `frame`, `stepGame`, accumulator, slow-motion, hitstop.
     - `game/player.ts` or `.js` — player state, input mapping, firing, dashes, respawn.
     - `render/core.ts` or `.js` — canvas setup, resize, transform, render skeleton, bloom begin/composite.
     - `render/effects.ts` — chroma, flash, shake, bloom capture, particles (at least the hot bits).
     - `render/backdrop.ts` or `.js` — nebula, planet, moon, derelicts, stars, gate, fleet, dust.
   - Keep the current inline script publishing the same behavior during the transition. The point here is to create the source modules and prove they can be bundled back into the same runtime behavior.
3. Capture a module contract for each extracted layer:
   - what it owns
   - what it may not touch
   - how it is tested
4. Add a one-page module map that points to the modules and tests.

**Exit condition:**
- A contributor can point to the module that owns a given concern.
- The existing behavior and baselines are unchanged after extraction.
- Every extracted module has at least a small test or a clear note why it is not yet tested.

**Why this phase first:** Extraction without tests and without a map just creates smaller monoliths. This phase makes the structure real and navigable before we ask it to carry more responsibility.

---

### Phase 2 — Make correctness structural, not heroic

**Goal:** The kinds of bugs we have already seen (canvas self-draw, misaligned transform, missed restore) become hard to write and easy to catch.

**Work:**
1. Enforce canvas-state hygiene:
   - Every composite-mode and filter change is scoped and restored.
   - Any effect that reads from the main canvas reads from a stable offscreen buffer.
   - Add debug-mode assertions for the most failure-prone invariants (accumulator non-negative, step count sane, bloom-dirty flag consistent with emissive draw) — debug only, not a runtime cost in release.
2. Wrap the widely-reachable state behind small interfaces:
   - Entity collections and the main game/camera/player state should not be reach-in-from-anywhere state forever.
   - Introduce narrow accessors/owner modules for the most-touched state. Goal is not purity; it is to stop 7,000 lines from being able to silently corrupt the same stacks.
3. Add focused tests:
   - Backdrop transform math and moon/planet map positioning.
   - Chroma buffer lifecycle and resize behavior.
   - Particle spawn/die and simple collider/swap-remove invariants.
   - Player input mapping and firing state transitions.
   - Boss phase/trigger logic where it is reasonable to unit-test.
4. Make baseline updates explicit:
   - A baseline change requires a human-readable reason in the commit.
   - CI should flag baseline updates that lack a documented reason.

**Exit condition:**
- The next canvas-state or transform bug is unlikely to slip through the same way.
- At least the most failure-prone state paths are behind ownership/accessors rather than free global reach.
- Baseline changes leave a paper trail.

**Why this phase second:** Once the code is navigable, we make the dangerous patterns structurally harder and more tested. This is where correctness climbs from "beaten-on" to "designed not to fail."

---

### Phase 3 — Make performance evidence-based and lean

**Goal:** Ambient work scales with what the player sees; load time is reasonable; quality tiers are known quantities.

**Work:**
1. Profile before tuning:
   - Use the in-game panel and/or devtools to know where the frame goes on a low-end device: sim, draw calls, particle updates, bloom composite, sky layers.
   - Record measured cost per quality tier so future tuning is data, not vibes.
2. Trim ambient cost to visibility:
   - Skip or downsample offscreen storm ovals, limit per-frame work on layers that barely move on screen, cap streaks when not warping, and otherwise make the sky cost proportional to what is actually visible.
   - Keep the slow drifts — they are a feature — but ensure they are cheap per frame.
3. Trim load-time cost:
   - As modules are bundled, measure parse/compile and keep the published artifact lean.
   - Preload only what first paint needs.
4. Document the quality ladder with measured cost per tier.

**Exit condition:**
- We can state, with numbers, where a frame goes on a low-end device.
- Ambient layers are no longer more expensive than their visible footprint.
- Load-time parse/compile is under control and the published artifact is lean.

**Why this phase third:** Performance work done before we know where time goes is guesswork. Once the code is modular and correctness is more structural, profiling and trimming become safe and effective.

---

### Phase 4 — Make testing systematic, not scenic

**Goal:** The suite covers surfaces and failure modes, not only scenes; CI is fast and trustworthy; baseline changes are deliberate.

**Work:**
1. Convert scenic tests into surface tests as modules are extracted:
   - Each module gets focused tests: happy path, common edge cases, a few failure modes.
   - Pixel-hash selftests remain for rendering; unit tests explain *why* a regression happened.
2. Expand backend coverage:
   - Auth flows, session lifecycle, score submission, rate-limit behavior, invalid-token handling, input validation, error responses.
   - Contract test that the API surface the client depends on is stable enough not to surprise it.
3. Keep CI fast and trustworthy:
   - Sim goldens and selftests remain the spine.
   - New unit tests are added in a way that does not make CI slow or brittle.
   - Smoke + E2E remain the end-to-end spine for the deployed game.

**Exit condition:**
- A reasonable reader can look at a module and find its tests.
- Backend defensive claims are backed by tests.
- Baseline changes require a reason and are flagged if undocumented.
- CI remains fast enough to be trusted and run often.

**Why this phase fourth:** By now the code is modular, correctness is more structural, and performance is measured. That is the right point to make the test suite systematic rather than scene-by-scene.

---

### Phase 5 — Lock in security and deployment boundaries

**Goal:** The client and server are clearly separate concerns; the client is lean; secrets are nowhere in the repo or bundle; the deployment story is sane.

**Work:**
1. Clarify and protect the client/server boundary:
   - The game document is the static client; `server.js` is the API/account layer.
   - Keep account/auth integration at the API boundary, not by growing secrets or server concerns into the game document.
2. Keep the client lean:
   - Preserve CSP and the zero-third-party-in-boot property.
   - No new third-party scripts introduced to solve a client problem.
3. Secrets discipline:
   - Any new service credentials live only in the platform secret mechanism, never in code, bundle, logs, or chat.
4. Make deployment sane and documented:
   - Document how the game is served today and how the API is served.
   - If a deployment path exists, it should be reproducible from the docs, not folklore.

**Exit condition:**
- A reader understands where the client ends and the server begins.
- Secrets are nowhere in the repo or client.
- The deployment story is documented and reproducible.

**Why this phase last:** Security and deployment boundaries are easiest to keep clean when the code is already modular, correctness is structural, and the test suite is systematic. Pushing this earlier tends to create process overhead without the structure to support it.

---

## 5. What We Will Not Do

Be explicit, because ambition tends to sprawl.

- **No rewrite of the game from another framework.** The existing render craft, baselines, and gameplay are assets. We extract and modularize; we do not burn it down.
- **No grand new feature work under the guise of quality.** New features are separate from this plan. If a feature is wanted, it should not be folded into the "make it 10/10" work.
- **No purity theater.** We are not introducing purity for its own sake. Narrow interfaces and modules are in service of correctness, readability, and maintainability — not ideology.
- **No test theater.** We are not adding tests that do not cover a real surface or failure mode. Every test should earn its place.
- **No premature optimization.** Profile before tuning. Do not trim ambient cost by gut feel.

---

## 6. Review and Update Cadence

- **Every phase:** update this SSOT when a phase exits, including what changed, what the new scores should be, and what was learned.
- **Every commit that touches architecture, render, backend security, or test strategy:** ask whether it moves us toward or away from this plan, and say so in the commit or PR notes.
- **Regression rule:** if a change regresses behavior, performance, or security posture, it is not "almost done" — it is blocked until fixed.

---

## 7. How to Use This Document

- When you are about to start work, read the relevant phase and the non-negotiables.
- When you are unsure whether a change is in scope, check whether it supports a current phase exit condition. If not, it is probably a different job.
- When you finish a piece of work, update the SSOT if it changes the plan, the scores, or the standards.
- If a later change contradicts this doc, resolve the contradiction in the doc, not by ignoring it.

---

## Appendix A: Current Phase Status

- **Phase 0:** Done in commit `0ea9bfc` (local); awaiting authenticated push.
- **Phase 1–5:** planned, not started.

## Appendix B: Living Scores

Update these as phases exit.

| Aspect | Current | Target |
|---|---|---|
| Architecture & Modularity | 4 | 10 |
| Code Quality & Readability | 6.5 | 10 |
| Correctness & Robustness | 5.5 | 10 |
| Performance | 7 | 10 |
| Testing & QA | 7.5 | 10 |
| Security | 7 | 10 |
| Documentation & Maintainability | 5 | 10 |

---

*This file is the SSOT. If a later note, issue, or chat says something contradictory, this file wins unless it is explicitly updated.*
