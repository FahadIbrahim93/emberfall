# EMBERFALL — how to run this worktree

(release v4.12.0 — the traps became gates: executable SQL-binding audit
+ permanent client↔deck parity gate in CI, the Gauntlet guide rendered
from the live tables, Wardenfall horizon on the Daily tile; duels-week
drill #2 green 24/24 on a scratch deck. Ops note: live-fire drills boot
a scratch deck with EF_DATA_DIR pointed at scratch data on a spare port
(8127/8131/8133 used so far), are torn down after, and never touch the
preview deck's data dir),
stubguard release gate, locked T-DET goldens + type-specific foe AI in the
sim; published live via CI at https://fahadibrahim93.github.io/emberfall/)

## Live-fire drill (proven procedure)

To re-run the medals-economy drill: boot a scratch deck (`PORT=8131 EF_DATA_DIR="$(cygpath -w /tmp/ef-<name>)" node server.js &`), register a pilot, seed prior ledger days directly into the scratch `daily_stats` (deck-open WAL allows a concurrent writer), then POST valid daily runs and check streak/paid/total against the ledger. **Trust the deck's UTC clock, not your calendar** — a day rolled mid-drill once and "looked like" a double-payout until the ledger row was read. The week-window regression lives in smoke.sh P0-10 (seed an ancient row; the window must ignore it).

## Reproduce artifacts

Nothing to generate: the client is `index.html` plus five classic-script
modules — `js/audio.js`, `js/sky.js`, `js/net.js`, `js/art.js`, `js/input.js`
— loaded in order before the inline core (no bundler, no ESM: classic scripts
with shared globals, so `file://` play still works; `deadscan --check` enforces
that modules stay load-time pure). The backend is a single `server.js` with
**zero npm dependencies** (Node ≥ 22 uses the built-in `node:sqlite`). There is
no `.env` — configuration is environment/CLI only:

- `PORT=9000 node server.js` or `node server.js --port 9000` (default port **8123**)
- Database lives OUTSIDE the served tree by default: `../emberfall-data/emberfall.db`
  (created on first boot; WAL mode; git-ignored). Override with `EF_DATA_DIR`;
  an existing legacy `data/emberfall.db` is migrated there automatically on first start.
- Static serving is a strict ALLOWLIST: only index.html, sw.js, the manifest,
  js/*.js, fonts/ and icons/ are served — everything else (data/, server.js,
  .git/, docs/, tools/) 404s. Pinned by smoke.sh's T-LEAK battery and
  deadscan's static-exposure gate.

If `data/` is missing, the server recreates it. If the port is busy, kill the
stale listener (`netstat -ano | grep :8123` → `taskkill //PID <pid> //F`) or
pick another port and adapt the preview URL.

## Run the server (detached, survives the session)

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory 'G:\emberfall' -RedirectStandardOutput 'G:\emberfall\.freebuff\server.log' -RedirectStandardError 'G:\emberfall\.freebuff\server.log.err' -WindowStyle Hidden -PassThru).Id"
```

(The shell may report a timeout — harmless; confirm with
`netstat -ano | grep :8123` that a pid is LISTENING, then
`curl http://127.0.0.1:8123/api/health`.)

## Verify

- `bash check.sh` — syntax-verifies every `js/*.js` module AND the inline payload(s)
- `bash smoke.sh` — dead-code gate (`node deadscan.js --check`) + copy provenance
  (`node tools/copyguard.js`) + full API battery, all must pass
- `node tools/econsim.js` — economy simulator; constants are extracted from
  source, so a tuning typo fails here (also run as a CI gate)
- `node tools/selftest-ci.js` — 56 client tests headless against a committed
  exact-name baseline (same suite as `index.html?selftest` in a real browser)
- `npm run test:sim` — packages/sim balance sim (52 tests incl. golden parity
  against the live `index.html` tables: FOES, WEAPONS, BOSSES, STAGES, RNG)
- `npm run test:browser` — Playwright pass over the served game (7 tests)
- CI (GitHub Actions) runs all of the above on every push, then deploys `main`
  to Pages and re-verifies the live URL byte-for-byte
- Title screen → Settings → Command deck panel shows the account state

Preview hygiene: after a version bump the browser may serve one reload from the
old SW cache — purge via `caches.keys()` → `caches.delete(k)` → reload.

The game also still runs with **no server at all**: open `index.html` directly
or serve the folder statically — the client probes `/api/health` and silently
stays in local mode when the deck is absent.

## Ops: back up the command deck's database

The deck's SQLite store (accounts, boards, profiles, vault snapshots) is the
only copy of server-side state. `tools/db-backup.js` snapshots it live:

```bash
# daily job (cron / Task Scheduler); the deck keeps running — no stop needed
node tools/db-backup.js --verify            # snapshot → ./backups/, keep 14
node tools/db-backup.js --out D:/emberfall-backups --keep 30 --verify
```

- Reads the same data dir as `server.js` (`EF_DATA_DIR`, default `<repo>/state`);
  set `EF_DATA_DIR` when the deck runs elsewhere. Remember on Windows: node and
  Git Bash resolve `/tmp` differently — pass a Windows path or `$(cygpath -w …)`.
- `--verify` opens the fresh snapshot and proves it has the expected tables —
  a backup that was never validated is not a backup. Corruption fails loudly.
- Old snapshots beyond `--keep` are pruned. Restore = stop deck, copy the wanted
  backup over `emberfall.db` (delete its `-wal`/`-shm` sidecars), start deck.
- Snapshots are plain SQLite files you can inspect with any sqlite client.

## Ops: profile the deck's query load

```bash
# boot a throwaway deck once to create the schema, stop it, then:
node tools/profile-deck.js --db <scratch>/emberfall.db --users 40 --days 120
```

Refuses to run without `--db` (seeded load rows are destructive). Baseline at
4,800 daily_stats rows: streak walk 0.31 ms, md ledger 0.27 ms, weekDays
0.014 ms, windowed top10 0.034 ms — all sub-ms with covering-index plans.
