# EMBERFALL — the command deck's data layer

*The database behind accounts, leaderboards, duels and the daily gauntlet.
One SQLite file, zero dependencies (Node ≥ 22 ships `node:sqlite`), one
process owning it — with a read-only public mirror on Supabase for the
world to read (see [ADR 0001](adr/0001-sqlite-authoritative-supabase-mirror.md)).*

## The file

The whole deck state lives in **one SQLite database** plus its WAL/SHM
sidecars, stored **outside the served tree**:

- default location: `../emberfall-data/emberfall.db` (sibling of the repo —
  the static allowlist can never serve it)
- override with `EF_DATA_DIR=/any/path` (multi-deck isolation, containers)
- a legacy `data/emberfall.db` is migrated there on first boot (WAL
  checkpointed first; rename when the volume allows, copy across devices;
  on any failure the boot logs loudly and starts fresh — migration never
  takes the deck down)

Tuning: `PRAGMA journal_mode = WAL` (readers never block the writer) and
`PRAGMA busy_timeout = 2000` (brief write contention self-heals; a lock
held longer is an ops incident, not a timeout to raise).

## Schema at v4.16

Every owned row carries `REFERENCES users(id) ON DELETE CASCADE` — deleting
a user is one statement, and the tombstone (below) is the only residue.

| Table | One row is… | Notable columns |
|---|---|---|
| `users` | an account | `name_lower` UNIQUE; scrypt `salt`+`hash` (N=16384, async off the event loop) |
| `sessions` | a signed-in device | `token_hash` = SHA-256 of the cookie token (the token itself is never stored); 30-day `expires`; swept at boot + daily |
| `scores` | one finished, verified run | `mode`, `score`, `wave`, telemetry (`cps`, `run_t`, `kills`), `verdict` (`accepted`/`review`/`rejected`/`legacy`), `run_hash` (24h replay guard), `paint`+`mastery` for board personalization |
| `profiles` | the live cloud save | `data` JSON (meta + cfg, 12 KiB cap), `updated` watermark for last-write-wins convergence |
| `profile_snaps` | a save-vault copy | `data_len` for the throttle; **six newest per user** kept — see "the vault incident" |
| `daily_stats` | one pilot's gauntlet day | `(user_id, day)` PK; medals' `paid`, `streak`, `wardenfall` rare-Sunday verdict stamped at award time |
| `challenges` | a duel | `to_name` (lowercased), day-stamped, `ghost` frames |
| `beats` | a proven duel win | `(challenge_id, user_id)` PK; score + `run_hash` recorded |
| `deleted_accounts` | a retired callsign | tombstone: the name can never be re-registered, so board history that displays it cannot be rewritten |

Indexes: boards (`scores(mode, score DESC)`), the day ledger
(`daily_stats(user_id, created_day)` — the week window is a TEXT-day
filter, never a lifetime count; regression-tested), snapshots, duel
targets.

## Migrations

Idempotent, at boot, in code:

- `addCol()` probes `PRAGMA table_info` before `ALTER TABLE` — every boot
  re-runs safely on a fresh or fully-migrated file
- column *rebuilds* rename the old table, create the new shape, carry the
  rows across, and drop the shell (the v4.16 `profile_snaps` repair)
- the SQL-binding scanner (`tools/audit-sql-bindings.js`, CI gate) proves
  every day-like TEXT comparison is string-proven — the INTEGER-vs-TEXT
  trap class that once silently broke the week window cannot return
  without a red CI

## The vault incident (v4.16, fixed + drilled)

`profile_snaps` originally shipped without an `id` column. The prune
(`… id NOT IN (…)`) threw on every snapshot write and was **swallowed by
design** — a failed snapshot must never fail a profile save — so the
"six newest" vault silently grew forever, and the throttle read a column
that was never selected. Two lessons, both enforced now:

1. best-effort code still gets a drill: `tools/drill-vault.mjs` (CI)
   proves snapshot-lands, throttle-engages, the six-newest prune holds,
   and readback is byte-for-byte
2. the repair rebuilds old tables in place and logs loudly at boot

## The public mirror (Supabase, read-only)

Per [ADR 0001](adr/0001-sqlite-authoritative-supabase-mirror.md), the deck's
SQLite is the only authoritative store; a Supabase Postgres project
(`emberfall`, us-east-1) carries **public projections only** — callsigns,
accepted scores, gauntlet day aggregates, lifetime totals. Password hashes,
sessions, telemetry, profiles and the vault never leave SQLite.

- **Schema:** `pilots`, `scores`, `gauntlet_days`, `deck_stats` (+ the
  `leaderboard` view) — RLS enabled everywhere, `anon` gets SELECT and
  nothing else (anon INSERT is refused, proven by probe)
- **Sync:** `node tools/db-sync.mjs` — REST push with the operator's
  service key (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`), or keyless
  `--print-sql` to stage idempotent SQL, or `--verify` to read back
  through the publishable key and diff against the authoritative store
- **Public read (publishable key, safe to embed):**

```bash
curl "https://bhcczyyhadornihhzpsu.supabase.co/rest/v1/leaderboard?select=*" \
  -H "apikey: sb_publishable_rcBoR0FTobKUc_2-QqH2fQ_jS4mqd5O"
curl "https://bhcczyyhadornihhzpsu.supabase.co/rest/v1/deck_stats?select=*" \
  -H "apikey: sb_publishable_rcBoR0FTobKUc_2-QqH2fQ_jS4mqd5O"
```

- **Freshness:** eventual by design — the operator syncs on their cadence
  (hourly cron is the documented shape). The deck itself also answers
  `GET /api/stats` (accepted-only totals) straight from the authoritative
  store, no mirror required.
- **Deletion follows the pilot out:** a sync after an account deletion
  removes the pilot and their scores from the mirror too (the tool emits
  the deletes; tombstones stay on the deck only).

## Backups

```bash
node tools/db-backup.js --verify   # live snapshot + integrity check, no deck stop
```

WAL keeps readers and the writer from blocking; the backup tool
checkpoints and copies the sidecars so a snapshot is never a torn page.
Restore = stop deck, replace the file (and sidecars), start deck.
