# EMBERFALL — architecture

*What owns what, and which way data flows. Written so the next pass builds
*with* this structure, not against it. Behavior docs live in the README;
*economy in `docs/economy-audit.md`; performance in `docs/performance.md`.*

## The load contract (the most important invariant)

Classic scripts, no bundler, no ESM — `file://` play is a hard requirement.
Five modules load **before** the inline core, in this order:

```
js/audio.js → js/sky.js → js/net.js → js/art.js → js/input.js → <inline core>
```

- Modules share globals with the core by design (one namespace, classic scripts).
- **Modules must be load-time pure**: they may only *declare*. Any top-level
  statement or initializer that reads a core symbol runs before that symbol
  exists and kills the whole page (a real TDZ crash shipped once — see the
  `SETTING_PAINTS` fix). `node deadscan.js --check` enforces this statically:
  it walks brace context and flags every *live* (non-function-body) reference
  from a module to a core declaration, plus lazy-arrow object values are
  recognized as call-time (`PICK_COL` idiom). It also verifies the script tags
  appear in index.html in module order, before the inline core tag.
- The core calls `initInput()` (js/input.js) from `boot()` once the DOM exists —
  that is the one place a module binds listeners.

## Module map

| Unit | Owns | Must not |
|---|---|---|
| `js/audio.js` | synthesised voices, adaptive score (`AU`, `MUSIC`) | touch game state |
| `js/sky.js` | sky-event schedulers + `SKY_EVENTS` registry (the single owner of what each event *is*: names, colors, counters) | render or touch META directly (it exposes tick/draw) |
| `js/net.js` | deck client: auth, cloud profile merge, outbox (`NET`) | game rules |
| `js/art.js` | materials, hull/hostile/capital/pickup renderers (`HULL_ART`, `FOE_ART`, `BOSS_ART`) | game state; palette-reacts via functions called at draw time |
| `js/input.js` | four input schemes → one contract (`INPUT`, `getMove()`, `resolveFiring()`); binds everything in `initInput()` | simulate or render |
| inline core | sim (`stepGame`), waves, collision, scoring, render pipeline, UI wiring, boot, self-tests | — |

## State ownership

- `CFG` (settings) — persisted via `DB.set('cfg')`; every settings control
  registers its paint in `SETTING_PAINTS`, replayed by `boot()` after
  `loadCfg()` so saved prefs always render. *Never* bind a settings control
  that paints at eval-time only.
- `META` (career: alloy, hulls, refits, feats, sky log, streaks) — persisted,
  cloud-merged by net.js with server convergence; suite-tested for merge
  union/max semantics and legacy migration.
- `GAME` (run state) — ephemeral; the fixed-step sim at `STEP` with a 5-step
  accumulator ceiling (death-spiral guard). `GAME.school` walls practice runs
  off from ghosts, ladders and the server.
- `PROF` (profiler ring) — collectors gated on `CFG.fps`; pure math in
  `profStats()`, suite-tested.
- Sky drifts — all read the sky clock `tt = skyTime(t)` (frozen under
  `prefers-reduced-motion`); palette reactivity flows through `PAL` + rebakes,
  never stored per-mode.

## Invariants worth keeping

1. **No build step.** Any change that needs a bundler is a regression.
2. **Zero npm dependencies** in the runtime path (client and server).
3. **The self-test suite is pure logic only** — safe to run inside the live
   game, any time, without polluting the player's profile (it snapshots and
   restores). New mechanics with invariant math get a `T(...)` test.
4. **CI is the law**: check.sh → deadscan --check → econsim --json → deck boot
   → smoke.sh (36) → Pages deploy → live byte-fidelity smoke. Green `main` is
   the live site.
5. **Cache generation bumps on any client payload change** (`sw.js` `CACHE`),
   or installed PWAs never see the update.

## Where new things go

- New enemy/weapon/boss *rendering* → `js/art.js` (data-driven tables).
- New input scheme → `js/input.js` behind the existing contract.
- New sky event → one `SKY_EVENTS` row in `js/sky.js` (colors, counters, log
  kind follow automatically).
- New server capability → `server.js`, mirrored in `smoke.sh` and (if it has
  invariant math) a suite test client-side.
- New economy constant → keep `tools/econsim.js` extraction patterns in sync —
  they fail loudly when a constant moves.
