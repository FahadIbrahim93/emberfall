# Security Policy

## Supported

Only `main` is supported. Every push runs the full test suite (syntax, dead code, SQL-binding audit, economy parity, API smoke tests, the server drills and the browser suite) before anything is published.

## Reporting a vulnerability

Please open a **private security advisory** (Repository → Security →
Report a vulnerability, or
https://github.com/FahadIbrahim93/emberfall/security/advisories/new)
rather than a public issue. Include steps to reproduce and the affected
file or endpoint; expect an acknowledgement within a few days.

Thanks for reporting responsibly.

## What the deck already protects (all tested in CI)

- **Credentials:** scrypt (N=16384) with per-user random salt, constant-time
  compare, hashing async off the event loop; timing-shaped login responses
- **Sessions:** 32 random bytes, only the SHA-256 stored; HttpOnly,
  SameSite=Lax, `Secure` whenever the request is TLS; 30-day expiry;
  expired rows swept at boot + daily; the session list endpoint never
  reveals token hashes
- **Google sign-in (opt-in, v4.26):** the deck verifies the ID token
  itself — RS256 signature against Google's JWKS (12h cache), issuer,
  audience (`EF_GOOGLE_CLIENT_ID`), `exp`/`iat` with clock skew,
  `email_verified` required — and mints its OWN session. No Google
  credential is ever stored; no third-party auth service sits between
  pilot and deck; the route 501s honestly on decks that never opted in
  and answers 401 to wrong signature/audience/expiry/tamper (drilled in
  `tools/drill-google.mjs`)
- **Account self-management:** password change re-scrypts with a fresh
  salt; deletion is a single CASCADE transaction that evicts every board
  entry, and the callsign is tombstoned against re-registration
- **Input:** every field validated and length-capped; SQL is 100%
  parameterized; a CI scanner proves day-like TEXT bindings stay
  string-proven
- **Rate limits:** per-IP sliding windows on register/login/challenge/
  beat/score; X-Forwarded-For is ignored unless `TRUST_PROXY=1`
  (spoofing it cannot forge a fresh bucket)
- **Static surface:** explicit allowlist only — database, server source,
  git metadata and dotfiles all 404 (regression-tested in smoke.sh)
- **Headers:** nosniff, frame-deny, referrer policy, CSP on documents;
  production requires HTTPS (`NODE_ENV=production`, honors
  `TRUST_PROXY=1` + `X-Forwarded-For: https`)
- **Port resolution:** `--port` flag beats an ambient `PORT` env; invalid
  values exit loudly instead of silently falling back
- **Score integrity:** client-telemetry plausibility checking (aggregate
  arcs, economy ceilings, velocity + depth floors, 24h replay hashes) —
  the deck is honest that this is detection, not prevention: `accepted`
  runs rank, `review` runs are stored but never rank
- **Supabase (live):** accounts and boards live in project `rgmbexmodebegllahotc`. RLS is on, the tables take no direct writes, and the only write path is the `submit_score` and `set_callsign` RPCs (bounds-checked, rate-limited). Only the publishable key ships. See [ADR 0004](docs/adr/0004-supabase-source-of-truth.md).
- **The old public mirror (retired, historical):** the Supabase project held read-only projections
  of public facts only (callsigns, accepted scores, aggregates); RLS
  grants `anon` SELECT and nothing else, the deck never holds a Supabase
  key, and the service key lives only in the operator's environment —
  see [ADR 0001](docs/adr/0001-sqlite-authoritative-supabase-mirror.md)

## Embedding and operator notes

The static game (on Vercel and GitHub Pages) is what a third-party page frames. The command deck itself
keeps `X-Frame-Options: DENY` — that origin holds the session cookie.

- A cross-origin iframe cannot retarget the deck. `?deck=` and a stored
  deck address are ignored while framed, the deck field is disabled, and
  password change / account deletion are disabled. Top-level visits still
  honor `?deck=` and the settings field, and a deck address must be a
  plain http(s) URL.
- `GET /api/feedback` is not a public API. Production (`NODE_ENV=production`)
  and any deck with `TRUST_PROXY=1` answer 403 unless the request sends
  header `X-Emberfall-Ops` equal to `EF_OPS_TOKEN`. Read notes from the
  SQLite file with `node tools/feedback-report.mjs` instead. Do not commit
  `EF_OPS_TOKEN`. The value used by `tools/drill-feedback.mjs` is a
  scratch-deck fixture, not a live credential.
- GitHub Pages cannot set `frame-ancestors`. The Vercel config allows
  framing only from this site and `bountyboard.gg` (apex, `www`, and
  subdomains). Add another origin there before a different site frames
  the Vercel URL.

## Deployment posture

One process, one origin. Put production behind TLS (nginx/Caddy) with
`NODE_ENV=production TRUST_PROXY=1`, and back up
`../emberfall-data/emberfall.db` with `node tools/db-backup.js --verify`.
Snapshots contain the whole user table (scrypt password hashes,
session-token hashes) — `backups/` is **git-ignored on purpose** and a
snapshot must never be committed; keep machine-loss copies outside the
repo (`--out`). See `docs/DATABASE.md` for the data layer,
`docs/DEPLOYMENT.md` for hosting the game + deck (bare metal or the
gates-in-build container), and the incident note in `tools/db-backup.js`
for why the ignore rule exists.
