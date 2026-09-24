# Contributing to EMBERFALL

Good news: the repo is the review process. The gate battery knows what
"done" means; your job is to make it stay green.

## The one rule

**Behavior changes need a proof in the battery.** If a drill, smoke check,
selftest or spec would not have caught your bug, add the check that would
have. This is how the repo got a session drill (a SIGKILL-survival claim
was wrong until it was executable) and a vault drill (the prune was broken
silently until it was executable).

## Local loop

```bash
bash check.sh                 # syntax: every module + every inline payload
node deadscan.js --check      # dead code, load order, XSS sinks
node tools/selftest-ci.js     # the in-game suite, headless (71 checks)
npm run test:sim              # the TypeScript sim mirror + goldens
npm run test:browser          # Playwright suite (boots its own deck)
node tools/drill-port.mjs     # every drill boots what it needs; see tools/
```

`node tools/selftest-baseline.js` regenerates the suite contract — only
when green, and commit it together with the suite change.

## Discipline the battery enforces

- **The client displays, the deck authorizes.** Anything the deck pays or
  ranks must be derived server-side; a display-contract change belongs in
  `tools/parity-daily.js` too.
- **Modules are load-time pure.** `js/*.js` may only declare; the core
  calls `initInput()` when the DOM exists. `deadscan` enforces it.
- **Version stamps are one command.** `node tools/release.mjs audit`
  verifies every site agrees; use `stamp` instead of hand-editing six
  places. CI fails the audit on drift.
- **One battery, one fresh deck.** Drills boot their own scratch deck on
  a scratch data dir; never re-run a battery against a dirty deck.

## Pull requests

- Keep the CI contract: green gates, `selftest-baseline.json` in sync,
  new drills wired into `.github/workflows/ci.yml`
- Update the docs that own the behavior (`README.md` Command Deck section,
  `docs/DATABASE.md` for the data layer, `ARCHITECTURE.md` for the load
  contract)
- Small PRs win: the battery is the reviewer, but a human still reads it
