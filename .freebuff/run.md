# EMBERFALL — how to run this worktree

(release v4.15.3 — pinned boots stay pinned: server.js resolves --port >
PORT env > 8123, an invalid value exits loudly instead of silently
defaulting, an occupied port dies with one honest line, and
tools/drill-port.mjs (CI, 7 checks) pins the contract incl. the
flag-beats-poisoned-env case that started it. The run-doc gotcha below is
now the FIX, not a workaround.
Prior: v4.15.2 — the deck remembers: sessions were ALREADY SQLite-backed
(SHA-256 hash, HttpOnly) — the drill proves login survives SIGKILL + reboot
with data intact, correcting my earlier wrong claim that restarts logged
pilots out; the real gap was hygiene: expired session rows only died
lazily, so pruneSessions() sweeps them at boot + daily (live rows
untouched, logout immediate). tools/drill-sessions.mjs (CI, 13 checks).
Prior: v4.15.1 — dead ghosts never pile up: challenges older than the
retention window (7d default, EF_DUEL_RETENTION_DAYS-tunable) are pruned
at boot + every 6h with the cutoff on deckDayOf; the retention drill
caught duels reading a third private day derivation (utcToday/new Date)
that ignored the rehearsal clock — unified on deckDayOf, so pinned decks
fly duels on the pinned day; tools/drill-retention.mjs proves four boot
cycles incl. strictly-< boundary + env window (CI step, 10 checks).
Prior: v4.15.0 — the rehearsal clock: EF_DECK_DAY pins the deck's DAY
(narrow: sessions/limiters/replay/seasons stay real; boot log announces
it) so the Wardenfall honor loop is rehearsed before the real rare
Sunday — NEW tools/drill-rare-sunday.mjs boots a pinned scratch deck,
flies honest wave-16 on 2026-09-27 (medal + wardenfall:1 + lifetime 1),
refuses wave-15 same-day, proves no inflation and an unmoved health
clock; 9 checks, CI step. Prior: v4.14.1 — the ledger travels, rehearsed: NEW tests/ledger.spec.js
runs a real two-device drill through Playwright (register via the panel,
seed a felled fall into the deck ledger with the day stamped from
/api/health's clock, fresh-profile sign-in adopts count + feat); it caught
the whoami adoption path skipping the feat mint — net.js now mints the
honor at every adoption point. Browser suite 8/8 in CI. Prior: v4.14.0
— the day of the fall: the rare-Sunday countdown reads 0
on the rare day itself (tile: WARDENFALL IS UP; guide announces it; never
points past a live fall), pinned in selftests + a parity display-contract
across all 74 rare Sundays; NEW tools/drill-limiters.mjs boots its own
scratch deck and proves every rate-limit bucket 429s at its budget with
telemetry-backed probes (CI step). Prior: v4.13.1's self-healing lifetime
count; v4.13 itself: deck-verified Wardenfall
feat + lifetime wardenfalls count (server migration + POST carry + /api/me
answer) + the WARDENFALL sigil-crest dock plaque in gold; adoption is
monotonic on both paths and proven live on a scratch deck (honest Wed
daily → wardenfall:0, seeded fall → wardenfalls:1). Rare Sunday lands
2026-09-27. Ops note: live-fire drills boot
a scratch deck with EF_DATA_DIR pointed at scratch data on a spare port
(8127/8131/8133/8137/8139/8141/8143/8145/8151/8155/8157/8159/8161/8163/8165
used so
far; drills that boot their own deck use a temp dir), are torn down
after, and never touch the preview deck's data dir).
Release choreography (since 2026-09-25): node tools/release.mjs —
audit | stamp <ver> "<codename>" "<note>" | baseline | tag "<msg>";
the audit refuses drifted stamps, the tag refuses dirty trees.
Scheduled op (2026-09-25): Windows task 'Emberfall daily deck backup'
runs tools/db-backup.js --verify --keep 14 daily 03:40. db-backup's
default data dir matched server.js only as of the same day (state/ was
never real).
v4.16 added account self-management (password change, session list,
delete-with-cascade + callsign tombstone — smoke-pinned), the vault
repair (profile_snaps had no id — prune threw silently, vaults grew
forever; rebuilt + tools/drill-vault.mjs in CI), and the showcase docs
set (LICENSE MIT, SECURITY, CONTRIBUTING, DATABASE, DEPLOYMENT, hero
screenshots in docs/screenshots/, repo topics + homepage → Pages).
Ops gotcha (proven 2026-09-25, FIXED in v4.15.3): some shells carry an
ambient PORT env (ours had PORT=0) and the old chain let env PORT win
over --port. The flag now always wins; invalid values exit loudly.
Detached boots may pin via flag or env:
powershell -NoProfile -Command "$env:PORT='8145'; (Start-Process -FilePath 'node.exe' -ArgumentList 'server.js','--port','8145' -WorkingDirectory 'G:/emberfall' -WindowStyle Hidden -PassThru).Id"
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
