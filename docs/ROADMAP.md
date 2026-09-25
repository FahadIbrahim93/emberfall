# EMBERFALL — the next 90 days

*Written 2026-09-25 by the machine that also ships the code, in the repo's
own voice: every item names its proof. Priority order, not release order —
each release takes whatever the top of the list offers.*

## Now (this week)

1. **Wardenfall Sunday, 2026-09-27** — the runbook exists
   (`docs/runbooks/wardenfall-2026-09-27.md`); execute T-1 (done), fly the
   day, sync the mirror after. Success = one line in the ledger per felled
   pilot and zero incidents.
2. **Hands-off mirror pipeline** — the hourly workflow refreshes the README
   badge from the mirror, but the mirror itself still needs the operator's
   machine. Add a `SUPABASE_SERVICE_KEY` repository secret and a push step
   to the stats workflow; the deck never changes.

## Next (2–3 weeks)

3. **In-game link to the world page** — when the deck is absent, the title
   screen should offer "worldwide boards" → `stats.html`. One line of UI,
   one spec.
4. **Leaderboard pagination + seasons history** — the mirror already holds
   the data; a `/stats/history` view (past gauntlet days, weekly winners)
   is a read-only SQL migration + page section. Proof: seeded fixture
   spec.
5. **Rate-limit observability** — the limiter silently 429s; a
   `/api/health` extension (buckets + recent rejects, no PII) and a drill
   assertion would make limiter regressions visible in ops, not just CI.
6. **Score-replay drill** — the anti-cheat's replay guard is smoke-tested
   with one hash; a dedicated drill (replay the same arc N ways: same
   pilot, same day, across modes) pins the whole 24h window.

## Later (30–90 days)

7. **Deck deployment story** — one-command deploy (Fly.io/Railway
   blueprint + Dockerfile, ~60 lines) with `NODE_ENV=production`
   defaults, health checks, and the backup task baked in. The deck
   deserves a public home; the game already degrades gracefully without
   one.
8. **Operator dashboard** — a single `admin.html` behind the session of a
   designated pilot id: stats, latest backups, mirror freshness,
   limiter state. Read-only by construction; every query it runs is
   already parameterized somewhere.
9. **Feats v2** — the feat registry is display-rich but static; seasonal
   feats (perfected N distinct weeks, wardenfalls across seasons) turn
   the ledger into a long game. Deck-authoritative as always.
10. **A11y pass** — colorblind safety exists on paints; extend the same
    CIE-Lab discipline to UI states (error/amber/ok), focus rings, and
    screen-reader labels on the registry tabs.

## Deliberately not planned

- **Supabase as the gameplay store** — rejected in ADR 0001; the deck's
  zero-dependency posture is the product.
- **Accounts for the Pages build** — static hosting cannot hold session
  secrets; the mirror covers public visibility instead.
- **Anti-cheat theater** — plausibility checking stays honest about being
  detection; no "authoritative replay" claim until an actual re-sim
  ships (and that would need the sim server-side, which ADR 0001's
  consequences keep optional).

## The standing rule

Every item above ships the way the last 20 releases did: stamped by
`release.mjs`, gated by the battery, tagged for one-command rollback, and
published only when CI says the live site is byte-identical.
