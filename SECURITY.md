# Security Policy

## Supported

The `main` branch is the only supported line; every push flies the full
gate battery (syntax, dead-code, SQL-binding audit, economy parity, API
smoke, six live-fire drills, browser suite) before anything publishes.

## Reporting a vulnerability

Please open a **private security advisory** (Repository → Security →
Report a vulnerability) rather than a public issue.

You can also reach the maintainer through the repository owner profile.

## What the deck already defends (all regression-tested in CI)

- **Credentials:** scrypt (N=16384) with per-user random salt, constant-time
  compare, hashing async off the event loop; timing-shaped login responses
- **Sessions:** 32 random bytes, only the SHA-256 stored; HttpOnly,
  SameSite=Lax, `Secure` whenever the request is TLS; 30-day expiry;
  expired rows swept at boot + daily; the session list endpoint never
  reveals token hashes
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

## Deployment posture

One process, one origin. Put production behind TLS (nginx/Caddy) with
`NODE_ENV=production TRUST_PROXY=1`, and back up
`../emberfall-data/emberfall.db` with `node tools/db-backup.js --verify`.
See `docs/DATABASE.md` for the data layer and `docs/DEPLOYMENT.md` for
hosting the game + deck.
