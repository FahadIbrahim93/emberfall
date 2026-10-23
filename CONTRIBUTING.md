# Contributing

Thanks for helping. Bug reports, playtest notes and pull requests are all welcome.

## The one rule

**If you change behaviour, add a check that proves it.** If no drill, smoke test, self-test or spec would have caught your bug, add one that would. Most of the repo's drills started this way.

## Local loop

You need Node 22 or newer (the legacy deck drills use the built-in `node:sqlite`).

```bash
npm ci
bash check.sh                 # syntax of every module and inline script
node deadscan.js --check      # dead code, load order, XSS sinks
npm test                      # sim tests + Playwright + the in-game self-test (77 checks)
```

Drills in `tools/drill-*.mjs` each start the scratch deck they need, so you can run them one at a time (`node tools/drill-boards.mjs`, for example). After changing the self-test suite, regenerate its baseline with `node tools/selftest-baseline.js`, but only on a green run, and commit it with the change.

## House rules

- **Supabase is the only write path for boards.** Live scores and callsigns go through the `submit_score` and `set_callsign` RPCs. Schema changes are new files in `supabase/migrations/`; never edit an applied one.
- **Keep the daily economy in parity.** If you change a display rule for the daily economy, update `tools/parity-daily.js` too.
- **Modules only declare at load time.** Files in `js/*.js` don't run code when loaded. The core calls `initInput()` once the DOM exists. `deadscan` enforces this.
- **Version stamps are one command.** Use `node tools/release.mjs stamp`, not hand edits. `node tools/release.mjs audit` checks that every stamp agrees.
- **The legacy deck is test-only.** `server.js` was never deployed. Its drills use scratch data folders, and a deck with `EF_LIVE_LEDGER=1` refuses them.

## Pull requests

- Keep CI green, keep `tools/selftest-baseline.json` in sync, and wire any new drill into `.github/workflows/ci.yml`.
- Update the doc that owns the behaviour: the README, `docs/DATABASE.md` for data, `docs/DEPLOYMENT.md` for hosting, `ARCHITECTURE.md` for the load order.
- Keep PRs small. CI checks a lot, but a person still reads every one.

## Security

Please don't open public issues for security problems. See [SECURITY.md](SECURITY.md).
