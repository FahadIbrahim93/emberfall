# Leaderboards and accounts

How player accounts and the worldwide boards work. Nothing on the gameplay path depends on a cloud service: you can play, offline, without an account.

> **Status (2026-10-23):** live on https://emberfall-game-two.vercel.app since #25 (merged as `a7d9f94`). Supabase is the source of truth for accounts and boards ([ADR 0004](adr/0004-supabase-source-of-truth.md)). You can play as a guest with no account, or create an account with an email and password. The worldwide boards list registered pilots only. **Sign in with X** is planned and lives in #26 until it's ready. Portal builds always keep scores on the device.

## Supabase accounts and worldwide boards (2026-10-23)

The static site (Vercel) has its own accounts and worldwide boards in Supabase project **`rgmbexmodebegllahotc`** (`https://rgmbexmodebegllahotc.supabase.co`, region ap-southeast-1, free tier). Schema: [`supabase/migrations/20261023000000_accounts_leaderboard.sql`](../supabase/migrations/20261023000000_accounts_leaderboard.sql), tightened to registered players by [`20261023000200_registered_only_boards.sql`](../supabase/migrations/20261023000200_registered_only_boards.sql). The old mirror project (`bhcczyyhadornihhzpsu`) and its sync pump are retired.

| Object | What it is | Who can do what |
|--------|-----------|-----------------|
| `profiles` | `id` = `auth.users.id`, `callsign` 3-16 chars `[A-Za-z0-9_-]`, unique case-insensitively | anyone reads `id, callsign, created_at`; no direct writes |
| `player_scores` | one row per posted run: `mode` endless/daily/school, `day` (UTC, daily only), `score` 1-10,000,000, small `stats` jsonb | anyone reads; no direct writes |
| `rpc/set_callsign(p_callsign)` | create or rename your profile | registered users (anonymous sessions are refused) |
| `rpc/submit_score(p_mode, p_score, p_stats)` | post a run; at most 6/minute and 300/day per user | registered users with a callsign |
| `leaderboard_global` | best run per registered player per mode (endless, school) | anyone reads |
| `leaderboard_daily` | best run per registered player per UTC day | anyone reads |
| `deck_stats` | live view: pilots, runs, top score, `updated_at = now()` | anyone reads |

How it is locked:

- RLS is on for both tables with SELECT-only policies; `anon`/`authenticated` hold no INSERT/UPDATE/DELETE grants, so a direct write with the publishable key is refused.
- The write logic lives in `SECURITY DEFINER` functions in the unexposed `private` schema (`search_path = ''`, `auth.uid()` evaluated once). The `public` RPCs are thin `SECURITY INVOKER` wrappers that only `authenticated` may execute.
- Views use `security_invoker = true`, so they obey the table policies, and they hide any row whose owner is an anonymous auth user (`private.is_registered`).

Client side (`js/cloud.js`):

- supabase-js v2 is vendored at `js/vendor/supabase.js` (UMD, no build step) and loaded only when the Global tab opens or a session already exists. Only the publishable key ships.
- **Guest play** is the default. A guest never creates an auth user: runs save to the device, the title screen says so, and the game-over screen offers "Sign up to post this score".
- **Email accounts** use email and password (8 characters or more). If the project requires email confirmation, sign-up says "Check your inbox to confirm your email, then sign in", and the confirmation link brings the player back to the game already signed in.
- **Callsign on first sign-in.** A new account is asked for a callsign before anything posts. The callsign is what the boards show; the email never appears anywhere public.
- **Registered-only boards.** Only a signed-in, non-anonymous account with a callsign can post. The database enforces this too, so a guest session can't post by calling the RPC directly.
- **Sign in with X** is planned. The work is in #26 and isn't part of the live site yet.
- A rate-limited post answers HTTP 429 (`20261023000100_rate_limit_http_429.sql`).
- Endless and daily runs post through `submit_score` after the local save. Rush and flight school stay on the device. Offline play, local boards and portal builds (`tools/build-portal.sh` strips `cloud.js`) never touch Supabase.
- The Global tab reads `leaderboard_global` and `leaderboard_daily` with the publishable key; `stats.html` and `pilot.html` read the same views.

Monitoring: `tools/mirror-alarm.mjs` checks the project answers, `deck_stats` is fresh and agrees with `profiles`, and that no machine-pattern callsigns are on the board. The hourly stats workflow and `tools/db-sync.mjs` were removed.

## What we chose not to do

- **A self-hosted game server.** The old Node + SQLite deck was never deployed and was removed ([ADR 0005](adr/0005-remove-self-hosted-deck.md)). Supabase is the only backend ([ADR 0004](adr/0004-supabase-source-of-truth.md)).
- **Convex / realtime leaderboard** — not needed; boards refresh when you open the tab.

## Related docs

- [DATABASE.md](DATABASE.md) — the Supabase schema
- [supabase/migrations/](../supabase/migrations/) — the live Postgres schema, RLS and RPCs
- [DEPLOYMENT.md](DEPLOYMENT.md) — where the site runs
