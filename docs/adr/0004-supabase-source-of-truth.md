# ADR 0004 — Supabase is the source of truth for accounts and boards

Date: 2026-10-23 · Status: **ACCEPTED** · Supersedes [ADR 0001](0001-sqlite-authoritative-supabase-mirror.md).

## Context

ADR 0001 made the Command Deck's SQLite the only authoritative store, with a read-only Supabase mirror fed by `tools/db-sync.mjs`. In practice the deck (Fly app `emberfall-deck`) was never deployed. So the shared boards and profiles never went live, the mirror (project `bhcczyyhadornihhzpsu`) had nothing to mirror, and the hourly stats workflow failed every run.

The game itself is static and already ships on Vercel and GitHub Pages. What it needed was accounts and shared boards without running a server.

## Decision

Accounts and leaderboards live in Supabase project `rgmbexmodebegllahotc`, and the browser talks to it directly (#25, merged as `a7d9f94`).

- Supabase Auth handles sign-in: email magic link, plus anonymous sign-in once enabled. Sign in with X is pending (#26).
- `profiles` holds callsigns. `player_scores` holds posted runs.
- Writes go only through the RPCs `set_callsign` and `submit_score`. RLS is on, there are no direct write grants, scores are bounds-checked and posts are rate-limited (6/minute, 300/day per player).
- The public reads are the views `leaderboard_global`, `leaderboard_daily` and `deck_stats` (now a live view, not a synced table).
- `tools/db-sync.mjs`, `tools/mirror-schema.sql` and the hourly Mirror stats workflow are retired. The old mirror project is no longer used.

## Consequences

- Shared boards are live without a server to host, back up or patch.
- Score checks are weaker than the deck's telemetry checks: bounds and rate limits, not plausibility arcs or replay. A determined cheater can post a fake score within bounds. We say so instead of claiming otherwise.
- Duels, cloud saves, the save vault and pilot dossiers from the deck design are not part of the live game.
- Offline play, local boards and portal builds still never touch Supabase.
- `server.js`, `fly.toml` and ADRs 0002 and 0003 stay in the repo as history until we decide to remove them.
