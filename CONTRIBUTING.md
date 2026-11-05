# Contributing

Thanks for helping. Bug reports, playtest notes and pull requests are all welcome.

## The one rule

**If you change behaviour, add a check that proves it.** If no sim test, self-test or Playwright spec would have caught your bug, add one that would.

## Local loop

You need Node 22 or newer.

```bash
npm ci
bash check.sh                 # syntax of every module and inline script
node deadscan.js --check      # dead code, load order, XSS sinks
npm run test:release          # payload, provenance and workflow-action regressions
npm test                      # sim tests + Playwright + the in-game self-test
```

The browser suite builds and serves the release artifact with `tools/serve-static.mjs` (port 8123; set `E2E_PORT` to move it). CI builds once and sets `EMBERFALL_SITE_ROOT=dist/site` to reuse that exact payload. After changing the self-test suite, regenerate its baseline with `node tools/selftest-baseline.js`, but only on a green run, and commit it with the change. CI measurements are artifacts; historical fun-curve updates go through reviewed PRs.

## House rules

- **Supabase is the only write path for boards.** Live scores and callsigns go through the `submit_score` and `set_callsign` RPCs. Schema changes are new files in `supabase/migrations/`; never edit an applied one.
- **Keep the daily economy honest.** If you change the daily medal or Wardenfall rules, keep `tools/wardenfall-check.mjs` and `tools/econsim.js` in step.
- **Modules only declare at load time.** Files in `js/*.js` don't run code when loaded. The core calls `initInput()` once the DOM exists. `deadscan` enforces this.
- **Version stamps are one command.** Use `node tools/release.mjs stamp`, not hand edits. `node tools/release.mjs audit` checks that every stamp agrees.

## Pull requests

- Keep CI green, keep `tools/selftest-baseline.json` in sync, and wire any new gate into `.github/workflows/ci.yml`.
- Update the doc that owns the behaviour: the README, `docs/DATABASE.md` for data, `docs/DEPLOYMENT.md` for hosting, `ARCHITECTURE.md` for the load order.
- Keep PRs small. CI checks a lot, but a person still reads every one.

## Security

### Updating GitHub Actions

Workflow actions use full commit SHAs. Dependabot proposes updates and keeps
the release tag in the adjacent comment. When updating manually, resolve the
official action repository's release tag, dereference an annotated tag to its
commit, review that revision's release notes and `action.yml`, then replace
the SHA and tag comment together. Run `node tools/check-actions.mjs` and the
normal CI checks before merging; branch names, short SHAs, and mutable tags
are rejected, including references in reusable workflows and YAML aliases.

Release credentials are step-scoped environment variables. Install the pinned
CLI before exposing them, never put tokens in command arguments, and run
`npm run test:release` after workflow changes. The release policy gate rejects
job-wide credentials and package execution with a release token available.

Please don't open public issues for security problems. See [SECURITY.md](SECURITY.md).
