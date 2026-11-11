# EMBERFALL — data

## What runs today: Supabase

Accounts and the worldwide boards live in Supabase project **`rgmbexmodebegllahotc`** (`emberfall`). It is the source of truth ([ADR 0004](adr/0004-supabase-source-of-truth.md)). The schema is in [`supabase/migrations/`](../supabase/migrations/):

| Object | Kind | Notes |
|---|---|---|
| `profiles` | table | one row per player (`id` = `auth.users.id`), unique callsign |
| `player_scores` | table | one row per posted run; `mode` is endless, daily or school; `score` is a bigint, at least 1, with no upper cap |
| `set_callsign`, `submit_score`, `submit_run_v2` | RPCs | the only write path; `authenticated` only; rate limit 6/minute and 300/day per player (HTTP 429 when hit). `submit_run_v2` adds run receipts and idempotent Daily acknowledgements; `submit_score` stays as the compatibility path. |
| `leaderboard_global`, `leaderboard_daily`, `deck_stats` | views | public reads; `security_invoker = true`; `deck_stats` is computed live and also exposes `top_score_exact` as text |

RLS is on for both tables with SELECT-only policies, and `anon`/`authenticated` have no INSERT, UPDATE or DELETE grants. The write logic sits in `SECURITY DEFINER` functions in the unexposed `private` schema. To change the schema, add a new migration file; don't edit applied ones. Full details: [LEADERBOARD-AND-ACCOUNTS.md](LEADERBOARD-AND-ACCOUNTS.md).

There is no sync job and nothing to run by hand: the game reads and writes the project directly. The old mirror project (`bhcczyyhadornihhzpsu`), `tools/db-sync.mjs` and the hourly Mirror stats workflow are retired.

### Standings page

`public.standings_page` and `public.pilot_dossier` are security-invoker reads added in `20261111000000_standings_cursor.sql`. The page freezes a watermark, then walks best runs with a cursor. Rank is competition rank. `score` comes back as text. `source_mode` is the mode of the run that set the score. The pages no longer request `seasons`, `pilot_cards`, or `board_standings`. Weekly seasons are not a published board. `leaderboard_global` and `leaderboard_daily` remain compatibility readers for a project that has not applied the new migration yet.

This file is not applied to the live project from a checkout. The owner applies it.

### Loadout codes (v4.30)

From game v4.30 every run posts `stats.fit`, a short loadout code such as `v:rl.pn|sg:needle|m:trim,claw|f:1a2b3-` (hull initial, weapon pattern and mod, sigil, modules, frame doctrine rows). Daily, rush and flight-school runs fly standard issue and post `v:std`. `player_scores.stats` already stores the field, so nothing changes for writes.

`20261112000000_standings_fit.sql` replaces `standings_page` and `pilot_dossier` so both echo `fit`, allowlisted to `^[a-z0-9:|.,_-]{1,64}$`, and adds the streak laurel paints (`oxblood`, `midnight`) to the echoed paint allowlist. Signatures, grants and ranking are unchanged. It was applied to production on 2026-11-11 (migration version `20261111083113`, name `standings_fit`) after a full backup of the affected tables and function definitions. Runs posted before v4.30 return `fit: null` and render without the loadout chip.

This file is not applied to the live project from a checkout either. The owner applies it.

The self-hosted SQLite deck that once owned this data was removed ([ADR 0005](adr/0005-remove-self-hosted-deck.md)).
