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
- `META` (career: alloy, hulls, refits, feats, sky log, streaks, sigils,
  mastery, hullKills) — persisted, cloud-merged by net.js with server
  convergence; suite-tested for merge union/max semantics and legacy
  migration. The personalization ledgers (`META.sigils`, `META.mastery`,
  `META.hullKills`) are written only through their bank functions
  (`masteryBankRun`), which share one guard: scored flights only.
- `GAME.sigil` (worn sigil, resolved at launch) — the only run-long power
  channel outside refits. Configure order matters and is suite-tested:
  stats reset **first**, sigil `apply()` **last** — a sigil that pays in a
  stat malus must never be wiped by the reset that follows it. Rush boards
  and practice runs strip sigils at the same line.
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
4b. **The vault is read-only server-side.** Deck-side profile snapshots
   (`profile_snaps`, six newest per user, taken on real deltas) are served
   for inspection only — the server NEVER overwrites the live profile on
   behalf of a snapshot. Restores replace META/CFG locally from a
   snapshot-validated sanitizer and ride the normal profile push. Ownership
   validates against the snapshot's own records, never the local wallet —
   restore must work precisely when the local save is the broken thing.
4. **CI is the law**: check.sh (stubguard first — a payload that stops looking
   like the game dies in seconds with the restore recipe) → deadscan --check →
   econsim --json → deck boot → smoke.sh (static-hygiene T-LEAK + API +
   anti-cheat + load) → headless `?selftest` suite against a committed baseline
   → Playwright smoke → Pages deploy → live byte-fidelity smoke. Green `main`
   is the live site.
5. **Cache generation bumps on any client payload change** (`sw.js` `CACHE`),
   or installed PWAs never see the update.
6. **Scored math draws from the run-seeded RNG only.** The cosmetic FX stream
   is seeded from `Math.random()` and reseeded at run start — any FX draw in
   gameplay makes a run unreproducible. `simRandom()`/`srnd()` is the gate;
   the suite's determinism check throws in direct mode.
7. **Run provenance is plausibility checking, not verification.** Copy may
   say "plausibility-checked" — "verified" is reserved until the deck can
   re-simulate a run from (seed, inputs) (SSOT P1/P2).
8. **Every sky bake is keyed.** `syncStage` skips `buildBackdrop` unless a
   bake input actually changed (stage · palette · worn paint). The bake is
   the single most expensive frame operation in the game (≈3.7 ms desktop);
   wave starts with an unchanged sky cost zero. Bypass the guard only by
   clearing `GAME.skyKey` (the title screen owns that path).
9. **Personalization is public, never secret, never power on boards.** Paint
   ids ride runs to the deck and come back on rows; the server accepts an
   *allowlisted* id set only. Sigils strip on rush/practice by design — the
   ladders stay vanilla (see `docs/economy-audit.md` §6 for why sigils are
   power-swaps, not power-ups).

## Where new things go

- New enemy/weapon/boss *rendering* → `js/art.js` (data-driven tables).
- New input scheme → `js/input.js` behind the existing contract.
- New sky event → one `SKY_EVENTS` row in `js/sky.js` (colors, counters, log
  kind follow automatically).
- New server capability → `server.js`, mirrored in `smoke.sh` and (if it has
  invariant math) a suite test client-side.
- New economy constant → keep `tools/econsim.js` extraction patterns in sync —
  they fail loudly when a constant moves.

## The Command Deck (server.js) — the same contract, server-side

One process, one origin, one SQLite file (`node:sqlite`, zero npm deps).
The data layer is documented in `docs/DATABASE.md`; the architectural
invariants:

- **The client displays, the deck authorizes.** Medals, streaks, verdicts,
  duel wins and ranks are derived server-side from the deck's own clocks
  (`deckDayOf`, one day derivation for the whole API) and its own seed
  mirrors (`wardenfallSunday` re-derives the rare verdict — the client
  never tells the deck what was up).
- **Best-effort code still gets a drill.** A swallowed catch is a design
  decision, and every one of them is executable proof in CI
  (`drill-vault.mjs` exists because one swallowed catch hid a broken
  prune for weeks).
- **Account lifecycle is one transaction.** Deletion is a single CASCADE
  DELETE plus a callsign tombstone — boards cannot keep a ghost, and the
  retired name cannot be re-registered.
- **Boot migrations are idempotent** and log loudly; fresh and
  fully-migrated databases take the same code path.

See `docs/DATABASE.md` (schema, retention, backups), `docs/DEPLOYMENT.md`
(hosting, rollback, environment) and `docs/performance.md` (measured
CPU/GPU baselines).
