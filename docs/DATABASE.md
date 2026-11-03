# EMBERFALL — data

## What runs today: Supabase

Accounts and the worldwide boards live in Supabase project **`rgmbexmodebegllahotc`** (`emberfall`). It is the source of truth ([ADR 0004](adr/0004-supabase-source-of-truth.md)). The schema is in [`supabase/migrations/`](../supabase/migrations/):

| Object | Kind | Notes |
|---|---|---|
| `profiles` | table | one row per player (`id` = `auth.users.id`), unique callsign |
| `player_scores` | table | one row per posted run; `mode` is endless, daily or school; score 1-10,000,000 |
| `set_callsign`, `submit_score` | RPCs | the only write path; `authenticated` only; rate limit 6/minute and 300/day per player (HTTP 429 when hit) |
| `leaderboard_global`, `leaderboard_daily`, `deck_stats` | views | public reads; `security_invoker = true`; `deck_stats` is computed live |

RLS is on for both tables with SELECT-only policies, and `anon`/`authenticated` have no INSERT, UPDATE or DELETE grants. The write logic sits in `SECURITY DEFINER` functions in the unexposed `private` schema. To change the schema, add a new migration file; don't edit applied ones. Full details: [LEADERBOARD-AND-ACCOUNTS.md](LEADERBOARD-AND-ACCOUNTS.md).

There is no sync job and nothing to run by hand: the game reads and writes the project directly. The old mirror project (`bhcczyyhadornihhzpsu`), `tools/db-sync.mjs` and the hourly Mirror stats workflow are retired.

### Known gaps

`stats.html` asks for a `seasons` view and `pilot.html` for a `pilot_cards` view. Neither exists in the current schema, so those requests answer 404 and the pages fall back (no seasons box; the profile falls back to `profiles` + `leaderboard_global`). Add them as a migration if seasons or dossiers ship.

The self-hosted SQLite deck that once owned this data was removed ([ADR 0005](adr/0005-remove-self-hosted-deck.md)).
