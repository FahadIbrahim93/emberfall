# Leaderboards and accounts

How the Command Deck keeps three things apart: the game data it owns, player identity, and the public copy of the leaderboard that anyone can read. Nothing on the gameplay path depends on a cloud service.

> **Status (2026-10-20):** shared boards and pilot profiles are merged (#12, #14) but **not live**. They go live once the Command Deck is deployed (see [DEPLOYMENT.md](DEPLOYMENT.md)). Portal builds always keep scores on the device.

## Design principles

| Principle | Implementation |
|-----------|----------------|
| Single writer | Command Deck SQLite owns accounts, sessions, scores, profiles, duels |
| Public read scale | Supabase Postgres mirror (RLS: `anon` SELECT only) |
| Cross-origin play | Bearer sessions + CORS allowlist ([ADR 0002](adr/0002-cross-origin-deck-bearer-sessions.md)) |
| Honest ranks | Only `verdict = accepted` runs board; the row is that flight; ties share a rank |
| Profile privacy | Passwords, sessions, telemetry, vault JSON never leave SQLite |
| Eventual mirror | `tools/db-sync.mjs` pushes public facts on operator cadence |

Following Supabase's advice for read-heavy boards, the filter columns (`mode`, `score DESC`, `callsign`) are indexed, the mirror holds no secrets, and every write goes to one SQLite file (WAL mode) that the deck owns.

## Accounts

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

## Leaderboards

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

## Performance notes

- **Deck:** `idx_scores_user_mode` covers per-pilot bests; public `/pilot` responses use prepared statements and **`Cache-Control: public, max-age=60`** (safe — no secrets in the payload).
- **Mirror client:** `js/mirror-public.js` centralizes the publishable key. Leaderboard reads request **narrow columns + limits**; pilot rank uses a **count-only** query (`Prefer: count=exact`) instead of downloading the full board.
- **Pages:** `pilot.html` loads mode bests as three parallel `limit=1` score queries.
- **Portal build:** `emberfallPortal()` keeps scores on-device; the Global tab uses local `renderBoard`, not the Supabase mirror.

## Sync & freshness

```bash
# Operator push (service role — never in the game bundle)
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<secret> node tools/db-sync.mjs

# Verify anon read matches SQLite
SUPABASE_ANON_KEY=<publishable> node tools/db-sync.mjs --verify
```

Hourly GitHub Action refreshes `docs/stats.json` and runs `mirror-alarm.mjs`
(stale / unreachable / contamination). The mirror **feed** remains operator-owned
([ROADMAP.md](ROADMAP.md), issue #15).

## Security posture

- Rate limits on register, login, profile, scores, stats ([smoke.sh](../smoke.sh))
- Plausibility checking on runs (not claimed as cryptographic replay yet)
- Static allowlist: DB and server source never HTTP-served
- Mirror blast radius: callsigns + accepted scores only ([SECURITY.md](../SECURITY.md))

## What we chose not to do

- **Supabase as gameplay DB** — rejected [ADR 0001](adr/0001-sqlite-authoritative-supabase-mirror.md)
- **Convex / realtime leaderboard** — not needed; boards refresh when you open the tab
- **Dual-write on score POST** — mirror lag is acceptable; deck stays available if Supabase sleeps

## Related docs

- [DATABASE.md](DATABASE.md) — SQLite schema, vault, backups
- [tools/mirror-schema.sql](../tools/mirror-schema.sql) — canonical Postgres schema, indexes, RLS and column grants
- [DEPLOYMENT.md](DEPLOYMENT.md) — deck hosting, `EF_CORS_ORIGINS`, rollback
