# Development Guide — EMBERFALL

Quick orientation for working on the game. For the long-term plan, see [SSOT.md](SSOT.md).

## Run locally

```bash
node server.js --port 8123
```

Then open `http://localhost:8123`. The server serves both the game document and the API from one origin.

The game also works as a standalone file from disk; the server is only needed for the API and account features.

## Test layers

### Game logic (deterministic, framework-free)

```bash
npm run test:sim
```

These live in `packages/sim/tests/`. They cover the deterministic sim: catalog, rng, constants, step, foe AI, combat, bosses, and golden replays.

### Render selftests (pixel-hash baselines)

```bash
node tools/selftest-ci.js
```

These verify the rendered frame against baselines. If a render change is intentional, update the baselines and record a human-readable reason in the commit. A baseline change without a reason should be treated as suspicious.

### Browser end-to-end

```bash
npx playwright test
```

Playwright tests live in `tests/`. The game-spec tests are the spine for "does the deployed game still boot, launch, pause, and return to title."

### Smoke

```bash
bash smoke.sh
```

Smoke checks for the deployed site.

## Working on the game core

The game currently lives mostly in `index.html`. That is the central maintainability problem, not a permanent state.

Short-term rule: when you touch the core, keep changes small and verify them against the selftests and the game E2E tests. Do not fold unrelated work into a "quality" change.

Long-term direction: extract hot regions into modules with a narrow contract and keep `index.html` as the thin host. See [SSOT.md](SSOT.md) for the phased plan.

## Baselines

Render baselines are used to catch visual regressions. They are valuable, but they can also silently absorb a bug if a baseline is updated without noticing why.

Rules:

- If you change rendering intentionally, update the baseline on purpose.
- Say why in the commit.
- If a baseline changes without an obvious intentional render change, stop and investigate before forcing it.

## Hot paths

These are the places where a bad change hurts most and where discipline matters most:

- The frame loop and sim step (`stepGame`, the accumulator in `frame`).
- The render function and its phases.
- Canvas state: save/restore, composite modes, filters, and any effect that reads from the main canvas.
- Entity collections and the mutable game/camera/player state.

If you are changing one of these, move slowly and verify.

## Canvas state hygiene

This is now a hard rule, not a suggestion:

- Every `save`/`restore`, composite-mode change, and filter change must be scoped and restored.
- Any effect that reads from the main canvas must read from a stable buffer, not from the canvas it is drawing onto.

The chroma pass is the canonical example: it now reads from an offscreen buffer instead of drawing the main canvas onto itself.

## Docs

- [SSOT.md](SSOT.md) — long-term quality plan and current scores.
- `ARCHITECTURE.md` — existing architecture overview.
- Module READMEs (when they exist) — what each extracted layer owns.

## Common gotchas

- Do not add third-party scripts to the boot path. The zero-third-party-in-boot property is deliberate.
- Do not put secrets, keys, or tokens in code, the bundle, logs, or chat. Use the platform secret mechanism if something new is needed.
- Do not make the server and the game document harder to tell apart. The game document is the static client; `server.js` is the API/account layer.
