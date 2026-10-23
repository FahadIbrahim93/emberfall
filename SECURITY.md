# Security policy

## Supported versions

Only `main` is supported. It deploys to https://emberfall-game-two.vercel.app/, and every push runs the full CI suite first.

## Reporting a vulnerability

Please report privately through a [security advisory](https://github.com/FahadIbrahim93/emberfall/security/advisories/new) (Security → Report a vulnerability) rather than a public issue. Include steps to reproduce and the affected file, URL or RPC. Expect an acknowledgement within a few days.

## What runs in production

The live game is static files on Vercel plus Supabase project `rgmbexmodebegllahotc` for accounts and boards. There is no game server.

- **Auth:** Supabase Auth (email magic link; anonymous sign-in once enabled). Sign in with X is in progress in #26.
- **Writes:** row-level security is on for `profiles` and `player_scores`, and `anon`/`authenticated` have no INSERT, UPDATE or DELETE grants. The only write path is two `SECURITY DEFINER` functions, `submit_score` and `set_callsign`, which live in a schema the API doesn't expose and are called through RPC wrappers.
- **Limits:** callsigns are 3-16 characters from `[A-Za-z0-9_-]`, unique ignoring case. Scores must be 1 to 10,000,000. Each player can post 6 runs a minute and 300 a day.
- **Reads:** the public views `leaderboard_global`, `leaderboard_daily` and `deck_stats`, all `security_invoker`.
- **Keys:** only the publishable key ships, in `js/cloud.js`. The service role key is never committed or used by the game.
- **Headers:** `vercel.json` sets nosniff, a referrer policy and CSP, and allows framing only from this site and `bountyboard.gg` (apex, `www` and subdomains). GitHub Pages can't set `frame-ancestors`.

### Known limits

Scores are bounds-checked and rate-limited, not replayed on a server. A determined player can post a fake score within bounds. We don't claim otherwise.

## Legacy: the Command Deck

`server.js`, `Dockerfile` and `fly.toml` are an older Node + SQLite server design (ADRs 0001-0003). It was never deployed and the live game doesn't use it. CI still runs its drills, so its protections are tested: scrypt password hashing, hashed session tokens, parameterized SQL, per-IP rate limits, a static allowlist, HTTPS enforcement in production and token-gated access to `/api/feedback`.

If you run it yourself: its backups contain password and session hashes, so `backups/` is git-ignored and snapshots must never be committed. Never commit `EF_OPS_TOKEN`; the value in `tools/drill-feedback.mjs` is a scratch fixture. Hosting notes are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
