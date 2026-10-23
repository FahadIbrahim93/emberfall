# Leaderboards and accounts

How player accounts and the worldwide boards work. Nothing on the gameplay path depends on a cloud service: you can play, offline, without an account.

> **Status (2026-10-23):** live on https://emberfall-game-two.vercel.app since #25 (merged as `a7d9f94`). Supabase is the source of truth for accounts and boards ([ADR 0004](adr/0004-supabase-source-of-truth.md)). Sign-in is by email magic link, plus anonymous guest sign-in once it's enabled on the project. **Sign in with X** (provider `x`) is open as #26 and not merged yet. Portal builds always keep scores on the device.

## Supabase accounts and worldwide boards (2026-10-23)

The static site (Vercel) has its own accounts and worldwide boards in Supabase project **`rgmbexmodebegllahotc`** (`https://rgmbexmodebegllahotc.supabase.co`, region ap-southeast-1, free tier). Schema: [`supabase/migrations/20261023000000_accounts_leaderboard.sql`](../supabase/migrations/20261023000000_accounts_leaderboard.sql). The old mirror project (`bhcczyyhadornihhzpsu`) and its sync pump are retired.

| Object | What it is | Who can do what |
|--------|-----------|-----------------|
| `profiles` | `id` = `auth.users.id`, `callsign` 3-16 chars `[A-Za-z0-9_-]`, unique case-insensitively | anyone reads `id, callsign, created_at`; no direct writes |
| `player_scores` | one row per posted run: `mode` endless/daily/school, `day` (UTC, daily only), `score` 1-10,000,000, small `stats` jsonb | anyone reads; no direct writes |
| `rpc/set_callsign(p_callsign)` | create or rename your profile | signed-in users (incl. anonymous) |
| `rpc/submit_score(p_mode, p_score, p_stats)` | post a run; at most 6/minute and 300/day per user | signed-in users with a callsign |
| `leaderboard_global` | best run per player per mode (endless, school) | anyone reads |
| `leaderboard_daily` | best run per player per UTC day | anyone reads |
| `deck_stats` | live view: pilots, runs, top score, `updated_at = now()` | anyone reads |

How it is locked:

- RLS is on for both tables with SELECT-only policies; `anon`/`authenticated` hold no INSERT/UPDATE/DELETE grants, so a direct write with the publishable key is refused.
- The write logic lives in `SECURITY DEFINER` functions in the unexposed `private` schema (`search_path = ''`, `auth.uid()` evaluated once). The `public` RPCs are thin `SECURITY INVOKER` wrappers that only `authenticated` may execute.
- Views use `security_invoker = true`, so they obey the table policies.

Client side (`js/cloud.js`):

- supabase-js v2 is vendored at `js/vendor/supabase.js` (UMD, no build step) and loaded only when the Global tab opens or a session already exists. Only the publishable key ships.
- Sign-in: an email magic link / one-time code, or an anonymous guest (the button shows only when the project allows it). Sign in with X is pending (#26). Then pick a callsign.
- A rate-limited post answers HTTP 429 (`20261023000100_rate_limit_http_429.sql`).
- Endless and daily runs post through `submit_score` after the local save. Rush and flight school stay on the device. Offline play, local boards and portal builds (`tools/build-portal.sh` strips `cloud.js`) never touch Supabase.
- The Global tab reads `leaderboard_global` and `leaderboard_daily` with the publishable key whenever no command deck is linked; `stats.html` and `pilot.html` read the same views.

Monitoring: `tools/mirror-alarm.mjs` checks the project answers, `deck_stats` is fresh and agrees with `profiles`, and that no machine-pattern callsigns are on the board. The hourly stats workflow and `tools/db-sync.mjs` were removed.

## Historical: the Command Deck design (never deployed)

Everything below describes the Fly.io + SQLite Command Deck (`server.js`) from ADRs 0001-0003. That deck was never deployed, the Supabase mirror it fed (`bhcczyyhadornihhzpsu`) is no longer used, and `tools/db-sync.mjs` and the hourly stats workflow are gone. It's kept as a record of the design, not as a description of what runs today.

### Design principles

| Principle | Implementation |
|-----------|----------------|
| Single writer | Command Deck SQLite owns accounts, sessions, scores, profiles, duels |
| Public read scale | Supabase Postgres mirror (RLS: `anon` SELECT only) |
| Cross-origin play | Bearer sessions + CORS allowlist ([ADR 0002](adr/0002-cross-origin-deck-bearer-sessions.md)) |
| Honest ranks | Only `verdict = accepted` runs board; the row is that flight; ties share a rank |
| Profile privacy | Passwords, sessions, telemetry, vault JSON never leave SQLite |
| Eventual mirror | `tools/db-sync.mjs` pushes public facts on operator cadence |

Following Supabase's advice for read-heavy boards, the filter columns (`mode`, `score DESC`, `callsign`) are indexed, the mirror holds no secrets, and every write goes to one SQLite file (WAL mode) that the deck owns.

### Accounts

**Registration & auth**

- Callsign + scrypt password (N=16384, async) or Google ID token ([v4.26](../CHANGELOG.md))
- Sessions: SHA-256 of token at rest, 30-day TTL, cookie **or** bearer ([ADR 0002](adr/0002-cross-origin-deck-bearer-sessions.md))
- Account panel: password change, session list, CASCADE delete + callsign tombstone

**Cloud save (profile)**

- `PUT /api/profile` — last-write-wins on `updated` watermark; 12 KiB cap
- `GET /api/me` — user + profile + gauntlet ledger adoption (`/api/me` is the sync hub)
- Save vault: six rolling snapshots, client-side restore only ([DATABASE.md](DATABASE.md))

**Where profiles are NOT stored**

- GitHub Pages static build (no secrets)
- Supabase mirror (public scores only)

### Leaderboards

**Live boards (deck-linked)**

| Surface | Endpoint | Notes |
|---------|----------|-------|
| Endless / rush / main | `GET /api/scores?mode=` | Top 10 + `offset` pagination, `more` flag |
| Daily gauntlet | `GET /api/scores?mode=daily&day=YYYY-MM-DD` | Medal pips from `daily_stats` ledger |
| Season | `GET /api/season` | Weekly board |
| Post-run rank | `POST /api/scores` | Returns `rank`, `top`, optional `daily` payout |

**Public mirror (no deck needed)**

| Surface | Source | Notes |
|---------|--------|-------|
| Global tab fallback | `leaderboard` view | Publishable key in client |
| stats.html | `deck_stats`, `leaderboard`, `gauntlet_days` | CSP allows mirror origin only here + game |
| pilot.html | `pilots` + `scores` | Per-mode bests + world rank |

**Pilot profiles**

| Context | URL | Data source |
|---------|-----|-------------|
| Live deck | `/pilot/<callsign>` or `/api/pilot/<callsign>` | SQLite (includes `ranks`, `runs`, paint) |
| GitHub Pages | `pilot.html?callsign=` | Supabase mirror |
| In-game links | `pilotUrl()` | Deck when linked; mirror page when deckless |

### Performance notes

- **Deck:** `idx_scores_user_mode` covers per-pilot bests; public `/pilot` responses use prepared statements and **`Cache-Control: public, max-age=60`** (safe — no secrets in the payload).
- **Mirror client:** `js/mirror-public.js` centralizes the publishable key. Leaderboard reads request **narrow columns + limits**; pilot rank uses a **count-only** query (`Prefer: count=exact`) instead of downloading the full board.
- **Pages:** `pilot.html` loads mode bests as three parallel `limit=1` score queries.
- **Portal build:** `emberfallPortal()` keeps scores on-device; the Global tab uses local `renderBoard`, not the Supabase mirror.

### Sync & freshness

```bash
# Operator push (service role — never in the game bundle)
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<secret> node tools/db-sync.mjs

# Verify anon read matches SQLite
SUPABASE_ANON_KEY=<publishable> node tools/db-sync.mjs --verify
```

Hourly GitHub Action refreshes `docs/stats.json` and runs `mirror-alarm.mjs`
(stale / unreachable / contamination). The mirror **feed** remains operator-owned
([ROADMAP.md](ROADMAP.md), issue #15).

### Security posture

- Rate limits on register, login, profile, scores, stats ([smoke.sh](../smoke.sh))
- Plausibility checking on runs (not claimed as cryptographic replay yet)
- Static allowlist: DB and server source never HTTP-served
- Mirror blast radius: callsigns + accepted scores only ([SECURITY.md](../SECURITY.md))

### What we chose not to do

- **Supabase as gameplay DB** — rejected in [ADR 0001](adr/0001-sqlite-authoritative-supabase-mirror.md), later reversed for accounts and boards by [ADR 0004](adr/0004-supabase-source-of-truth.md)
- **Convex / realtime leaderboard** — not needed; boards refresh when you open the tab
- **Dual-write on score POST** — mirror lag is acceptable; deck stays available if Supabase sleeps

## Related docs

- [DATABASE.md](DATABASE.md) — the Supabase schema, plus the historical SQLite notes
- [supabase/migrations/](../supabase/migrations/) — the live Postgres schema, RLS and RPCs
- [DEPLOYMENT.md](DEPLOYMENT.md) — where the site runs, and the historical deck notes
