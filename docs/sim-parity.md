# The simulation seam — closed

**Status (2026-11-14): CLOSED.** There is one simulation. The code the game runs
and the code the tests import are the same bytes, and the parity gate asserts
exact per-tick equality between the two ways of driving them.

## What changed

The old state: `packages/sim/src/*.ts` was a 1,180-line TypeScript
re-implementation of catalog, stage, combat and boss logic that `index.html`
never imported. On the shared scenario the two disagree (shipped 200 points /
4 kills, the copy 0 / 0), and the only thing keeping them honest was a ratchet
that pinned both wrong answers separately.

The direction chosen was **the shipped inline core is the single source**. The
copy is deleted, not maintained. `packages/sim` is now a typed facade over the
bytes `index.html` loads:

| | Before | After |
|---|---|---|
| Real simulation | inline `<script>` in `index.html` | inline `<script>` in `index.html` (unchanged) |
| `packages/sim/src` | 1,180-line duplicate + tests | facade (`index.ts`) + types |
| Tests exercise | the duplicate | the shipped core, booted headlessly |
| Gameplay | — | identical (no `index.html` behaviour change) |

Why this direction: extracting 8,400 lines of DOM-coupled, closure-heavy
gameplay into a module in one turn would have changed the game, and the brief
was explicit that the shipped behaviour must survive. The copy was also the side
that was wrong — its physics, director and several archetypes disagreed with
production — so the shipped code had to win and the parallel implementation had
to go.

`index.html` still plays straight from disk over `file://`: ten classic
scripts in the same order. The inline core is now `js/sim.js`. No build, no
network, no module graph.

## How one simulation is loaded twice

- **The game** evaluates `js/audio.js`, `sky`, `mirror-public`, `cloud`, `net`,
  `hangar`, `art`, `input`, `sim`, as classic scripts.
- **The tests** import `packages/sim/src/index.ts`, which calls
  `packages/sim/host/env.mjs`: a Node `vm` context with stub DOM/canvas/audio/
  storage that evaluates exactly those files, in exactly that order.

The facade then exposes live handles, not copies: `world.player`,
`world.foes`, `world.playerBullets`, `world.foeBullets` are the real `P`,
`foes`, `pb`, `fb` objects from the vm realm, and scalar state
(`score`, `wave`, `kills`, `lives`, …) are getters/setters onto `GAME`. Every
`createWorld` boots a fresh context; `R.reseed(seed)` / `FX.reseed(seed)` make
the test seed author the run rather than `Math.random`.

Input is the keyboard contract the shipped core consumes: `mx`/`my` signs map
to `KeyA`/`KeyD`/`KeyW`/`KeyS`, and `fire` maps to `INPUT.firing`. Analog
magnitudes are not simulated, and the facade says so instead of pretending.

## The gates

| Gate | What it asserts | Where |
|---|---|---|
| Shipped digest | The inline core's 900-tick scenario reproduces a committed digest **and a committed per-tick hash chain** | `tools/parity.test.mjs` (`node --test`, also inside `check.sh`) |
| Facade fidelity | For every golden, the facade path and a raw `stepGame` loop over the shipped bytes produce **identical per-tick chains** and identical final digests | `packages/sim/tests/parity-shipped.test.ts` |
| Golden lock | Each committed golden's `chain`, `tickChain` and `endHash` are reproduced through the facade | `packages/sim/tests/goldens.test.ts` + `parity-shipped.test.ts` |
| Primitives | RNG stream, `hashStr`, combo bands, catalogs, fire model, scales equal the **running** core | `packages/sim/tests/parity-shipped.test.ts` |
| Equal baselines | `tools/parity/cross-sim-baseline.json` records the shipped digest and the facade digest as the **same value** | `parity-shipped.test.ts` |

There is no ratchet any more: there are no two digests to ratchet.

### The gates bite

Perturbing one constant in the single source — the player bolt speed
`1020 → 980` in `firePrimary` — made:

- `node --test tools/parity.test.mjs` fail with
  `shipped per-tick state diverged at tick 95 (791.7 ms of play)`;
- `npx vitest run packages/sim/tests/parity-shipped.test.ts` go from 17 passed
  to 4 failed (the three golden chain comparisons and the committed endHash
  checks), naming the first divergent tick.

Restoring the constant returned both to green. (An earlier attempt perturbed the
wave-1 hp scale `1 + (wave-1)*.075`; the scenario never reaches a wave where
that multiplies anything, so the gates correctly stayed green — which is why the
proof uses a constant the scenario actually exercises.)

## The digests are equal

Both paths, same scenario, same seed:

| | Value |
|---|---|
| Shipped digest | `520|1|6|0|0|3|2|2|292.235|812.040|6|5|0` |
| Facade digest | `520|1|6|0|0|3|2|2|292.235|812.040|6|5|0` |
| Shipped per-tick chain | `ba9ab8b8` |

`tools/parity/cross-sim-baseline.json` stores `shipped` and `sim` blocks with
the same digest and hash; `tools/parity/sim-digest.mjs --write` refuses to
record if they differ.

## What was re-recorded, and why

Committed values changed deliberately when the seam closed:

- **`tools/parity/shipped-baseline.json`** — chain `007c6be8` → `ba9ab8b8`.
  The scenario now states its own contract: autofire **off** (the input table
  drives the trigger) and `R`/`FX` reseeded, which is exactly what the facade
  does. Without that the two paths were not comparable at all.
- **`tools/parity/cross-sim-baseline.json`** — previously `shipped 200|…` vs
  `sim 0|…`; now one value recorded on both sides.
- **`goldens/combat-{42,12345,99991}.json`** — regenerated through the shipped
  core (`version: 3`), and now carry `chain` and `tickChain` so drift names a
  tick. These goldens describe the game, not the deleted copy.

## What was reconciled in the tests

No test was deleted to manufacture agreement. Where the copy had invented
mechanics, the assertion now states what the game does:

| Old claim | Shipped reality, now asserted |
|---|---|
| boss has `bossId`, `hp`, `state: 'enter'` | `boss: true`, `state: 'boss'`, health on `nodes` |
| ram dives by ~4 s | holds, then leaves the field (checked at 4 s and at 20 s) |
| sniper's bolt is still on screen after 6 s | it fires; the bullet has already left. Asserted via an emitted-shot counter |
| splitter births minis while alive | no timer split exists; it is a single gunless body |
| orbiter sprays ≥3 bullets in 4 s | fires one volley in 4 s |
| `startWave(5)` puts a boss on screen immediately | it queues; the boss arrives within the wave |
| seeds diverge in 480 straight ticks | they do not — that scenario has no RNG-bearing event; 1,200 ticks with movement does, and is asserted |

Two test-driver adjustments are documented in the facade itself:
`applyGraze` sets the shipped `GAME.grazeHeat` (the game sets it inside its own
collision path), and `world.shotsFired` counts `foeShot` emissions because a
bullet that has left the arena is no longer in `fb`.

## Coverage

`npm run test:coverage` reports v8 coverage over `packages/sim/src`:
**98.05% statements, 82.14% branches, 92.85% functions, 98.87% lines** for
`index.ts`. This is coverage of the *facade*, not of the simulation: the
simulation is 8,400 lines of plain JavaScript inside `index.html`, which v8
cannot instrument in this harness. The simulation's cover is the per-tick parity
and golden gates above, which are stronger than a line count — they compare the
game's trajectory, tick by tick, against committed values.

## Re-recording

```bash
node tools/parity/digest.mjs --write                      # shipped 900-tick digest + chain
npx vite-node tools/parity/sim-digest.mjs --write         # both sides; refuses if they differ
npx vite-node tools/replay-record.mjs --seed 42 --steps 2400 --out goldens/combat-42.json
```

Re-record only in the same change as the gameplay edit, and say why in the
commit. `bash check.sh` runs the shipped digest gate, `tsc --noEmit` and the
Vitest suite.

## Still open

- The simulation now lives in `js/sim.js` and is loaded as a ninth classic
  script; coverage attributes to it through the `vm` bootstrap (absolute
  filenames), and the inline `<script>` block is gone.
- `types.ts` is documentation-grade types for the shipped shapes. It is not
  checked against `index.html`, so a shipped field rename will not fail `tsc`.
