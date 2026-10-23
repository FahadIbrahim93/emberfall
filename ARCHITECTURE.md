# EMBERFALL architecture

What owns what, and which way data flows. Gameplay behaviour is in the README,
the economy in `docs/economy-audit.md`, performance in `docs/performance.md`.

**Runtime today:** static files on Vercel (auto-deployed from `main`) plus
Supabase for accounts and boards. There is no game server; the old
self-hosted deck was removed ([ADR 0005](docs/adr/0005-remove-self-hosted-deck.md)).

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
| `js/net.js` | board/roster rendering, local profile merge, outbox (`NET`); its remote path is dormant with no address set | game rules |
| `js/cloud.js` | Supabase accounts and worldwide boards | game rules |
| `js/mirror-public.js` | public board reads for `stats.html` and `pilot.html` | write anything |
| `js/art.js` | materials, hull/hostile/capital/pickup renderers (`HULL_ART`, `FOE_ART`, `BOSS_ART`) | game state; palette-reacts via functions called at draw time |
| `js/input.js` | four input schemes → one contract (`INPUT`, `getMove()`, `resolveFiring()`); binds everything in `initInput()` | simulate or render |
| inline core | sim (`stepGame`), waves, collision, scoring, render pipeline, UI wiring, boot, self-tests | — |

## State ownership

- `CFG` (settings) — persisted via `DB.set('cfg')`; every settings control
  registers its paint in `SETTING_PAINTS`, replayed by `boot()` after
  `loadCfg()` so saved prefs always render. *Never* bind a settings control
  that paints at eval-time only.
- `META` (career: alloy, hulls, refits, feats, sky log, streaks, sigils,
  mastery, hullKills) — persisted locally, merged by net.js; suite-tested for merge union/max semantics and legacy
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
  off from ghosts and ladders.
- `PROF` (profiler ring) — collectors gated on `CFG.fps`; pure math in
  `profStats()`, suite-tested.
- Sky drifts — all read the sky clock `tt = skyTime(t)` (frozen under
  `prefers-reduced-motion`); palette reactivity flows through `PAL` + rebakes,
  never stored per-mode.

## Invariants worth keeping

1. **No build step.** Any change that needs a bundler is a regression.
2. **Zero npm dependencies** in the runtime path. supabase-js is vendored in `js/vendor/` and loaded only when needed.
3. **The self-test suite is pure logic only** — safe to run inside the live
   game, any time, without polluting the player's profile (it snapshots and
   restores). New mechanics with invariant math get a `T(...)` test.
4. **CI is the law**: sim tests → check.sh (stubguard first — a payload that
   stops looking like the game dies in seconds with the restore recipe) →
   deadscan --check (dead code, load order, XSS sinks, `.vercelignore`
   exposure) → econsim --json → copyguard → wardenfall-check → Playwright
   against the static server (`tools/serve-static.mjs`) → headless
   `?selftest` suite against a committed baseline → Pages deploy → live
   byte-fidelity smoke. Vercel deploys `main` on push.
5. **Cache generation bumps on any client payload change** (`sw.js` `CACHE`),
   or installed PWAs never see the update.
6. **Scored math draws from the run-seeded RNG only.** The cosmetic FX stream
   is seeded from `Math.random()` and reseeded at run start — any FX draw in
   gameplay makes a run unreproducible. `simRandom()`/`srnd()` is the gate;
   the suite's determinism check throws in direct mode.
7. **Run provenance is plausibility checking, not verification.** Copy may
   say "bounds-checked" — "verified" is reserved until something can
   re-simulate a run from (seed, inputs) (SSOT P1/P2).
8. **Every sky bake is keyed.** `syncStage` skips `buildBackdrop` unless a
   bake input actually changed (stage · palette · worn paint). The bake is
   the single most expensive frame operation in the game (≈3.7 ms desktop);
   wave starts with an unchanged sky cost zero. Bypass the guard only by
   clearing `GAME.skyKey` (the title screen owns that path).
9. **Personalization is public, never secret, never power on boards.** Paint
   ids ride runs in the score stats and come back on rows; readers render an
   *allowlisted* id set only. A board row is the flight that set the score —
   hull, wave, paint and mastery — not a mix of columns from other runs. The
   same dossier is `pilot.html`, the in-game boards, and `stats.html`. Sigils strip on rush/practice
   by design — the ladders stay vanilla (see `docs/economy-audit.md` §6
   for why sigils are power-swaps, not power-ups).

## Where new things go

- New enemy/weapon/boss *rendering* → `js/art.js` (data-driven tables).
- New input scheme → `js/input.js` behind the existing contract.
- New sky event → one `SKY_EVENTS` row in `js/sky.js` (colors, counters, log
  kind follow automatically).
- New account or board capability → a new migration in `supabase/migrations/`
  and the client call in `js/cloud.js`.
- New economy constant → keep `tools/econsim.js` extraction patterns in sync —
  they fail loudly when a constant moves.

## Accounts and boards (live): Supabase

The live game has no server of its own. `js/cloud.js` loads the vendored supabase-js on demand, signs players in with Supabase Auth, and writes only through the `set_callsign` and `submit_score` RPCs; boards read the public views. See [ADR 0004](docs/adr/0004-supabase-source-of-truth.md) and [docs/LEADERBOARD-AND-ACCOUNTS.md](docs/LEADERBOARD-AND-ACCOUNTS.md).

See `docs/DATABASE.md` (schema), `docs/DEPLOYMENT.md` (hosting, rollback)
and `docs/performance.md` (measured CPU/GPU baselines).
