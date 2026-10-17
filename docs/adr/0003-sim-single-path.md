# ADR 0003 — One sim truth path (wire, adapted for zero-build)

Date: 2026-10-18 · Status: accepted (wiring in progress, one subsystem per PR)

## Context

`packages/sim` was tested in CI but never imported by the live client — a
parallel universe (ADR-less gap flagged by the 2026-10 audit). The client is
deliberately zero-build: no bundler, static `index.html` plus classic `js/*`
scripts, offline-capable.

## Decision

**Wire — adapted to zero-build.** The client cannot import TypeScript, so the
direction of the dependency inverts:

1. The live runtime code lives in `js/<name>.js` classic scripts the client
   already loads (`js/audio.js`, `js/input.js`, … pattern).
2. Each `packages/sim/src/*.ts` module becomes a **thin adapter** that imports
   the same `js/*.js` file and re-exports it — no physics, no tables, no
   behavior in TypeScript.
3. Tests under `packages/sim/tests` therefore run the literal bytes the
   player executes. Goldens guard the live path, not a mirror.

Enforced by `tools/single-path-gate.js` (next to deadscan/copyguard in CI):
every `packages/sim/src/*.ts` must either import from `../../../js/…` or be
listed as a pending port in `tools/single-path.json` with a reason. No third
state: an unlisted, unadapted module fails CI.

## Migration order (smallest blast radius first)

- **hazards** — first (ported in this PR): `js/hazards.js` is the runtime;
  `packages/sim/src/render-hazards.ts` adapts it.
- render post-FX (bloom/chroma contract), game-loop, render-core, backdrop
  follow; `tools/single-path.json` shrinks to empty as they land.
- No bundler is introduced at any step; `file://` offline behavior preserved.

## Consequences

- The old mirror drift (e.g. `frost.dashMul 1.12` mirror vs `1.9` client) is
  gone: tests now assert client truth and CI fails if they diverge again.
- Tests keep using a host-object harness; the adapter maps it onto the module
  host accessors.
