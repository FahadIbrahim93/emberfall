# ADR 0001 — SQLite stays authoritative; Supabase is the public mirror

Date: 2026-09-25 · Status: **ACCEPTED** · Decides the database / UMS /
global-leaderboard architecture now that a Supabase connector is available.

## Context

EMBERFALL's Command Deck is a zero-dependency Node ≥ 22 process with the
game's SQLite database (`node:sqlite`): scrypt credentials, hashed
sessions, telemetry-checked scores, the daily gauntlet ledger, duels, and
the save vault — pinned by 76 smoke checks and 80 drill checks that fly on
every push. The repo is also a portfolio showcase: the GitHub README and
the live site should be able to show *real* numbers (pilots, runs, top
scores) without anyone starting a private server.

Supabase (Postgres, hosted, with per-table REST) is now connected.

## Options considered

1. **Move everything to Supabase.** Accounts, sessions, scores, ledger all
   go Postgres; the deck becomes a thin proxy or uses Postgres directly.
   *Rejected:* it sacrifices the deck's defining trait — zero dependencies,
   one process, one file, works on any host with no cloud account. It
   breaks the drills' self-contained property (every drill boots a full
   deck on a scratch DB), it couples gameplay writes (rate-limited,
   telemetry-verified, transactional) to a cloud round-trip, and the
   session/anti-cheat logic would either move to edge functions (untestable
   in this battery) or leak the service key into the game's origin.
2. **Dual-write from the deck.** Every gameplay write fans out to SQLite
   *and* Postgres.
   *Rejected:* two sources of truth drift the moment one write fails; the
   deck would need Postgres credentials and a client library (dependency,
   against the grain), and a Supabase outage would have to be handled on
   the hot path of scoring a run.
3. **SQLite stays authoritative; Supabase is a read-only public mirror.**
   A keyless-by-default, tooling-side push replicates only *public* facts
   (accepted scores, callsigns, gauntlet aggregates) into per-table
   Postgres with row-level security locked to `anon read`. Game writes
   never touch Supabase; the deck never holds a Supabase key. ✅

## Decision

Option 3.

- **Authoritative store:** the deck's SQLite, unchanged. Gameplay, UMS
  (accounts/sessions/vault/deletion), medals, duels — all as today.
- **Mirror:** Supabase project `emberfall` (region us-east-1, free tier)
  holds read-only public projections with RLS allowing only
  `anon: SELECT` on public views; no anon writes anywhere.
- **Sync:** `tools/db-sync.mjs` — a zero-dependency tool that reads the
  local SQLite and upserts public facts via Supabase's REST API using the
  **service-role key, passed by environment variable, never committed**
  (it runs on the operator's machine or an operator-configured runner,
  not inside the deck process). Opt-in via `SUPABASE_URL` +
  `SUPABASE_SERVICE_KEY` + `EF_MIRROR=1`-style env; absent keys = no-op
  with a clear message.
- **Freshness:** mirrors are eventually consistent by design (operator
  cadence: hourly locally, or a scheduled GitHub Action). Nothing in the
  game reads the mirror.

## Consequences

- The portfolio gets a real, queryable, public database and living
  numbers (badges, `/stats` page) without weakening the game's security
  posture or adding a single runtime dependency.
- The existing battery proves the deck with Supabase absent — the mirror
  is invisible to gameplay and to every drill.
- Leaked-mirror blast radius: anon sees only public board facts; no
  emails, no hashes, no telemetry, no sessions — those never leave
  SQLite.
- If Supabase dies, the game loses nothing; the README badge reverts to
  "local".
