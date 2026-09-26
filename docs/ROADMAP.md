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

7. **Deck hosting rollout** — the container itself is proven (see "The
   container path" below); what remains is the hosted control plane: a
   Fly.io/Railway blueprint that wires the image to gaps 11–13 with
   `NODE_ENV=production` defaults and the backup task baked in. The deck
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

## The container path — what's proven, and the gap to a real rollout

*The image has existed since v4.19.0 and CI proves it on every push
(`docs/DEPLOYMENT.md` holds the mechanics). This section is the
roadmap's honest ledger for it: what the docker path already
guarantees, and what a stranger would still have to bolt on before
hosting real pilots.*

**Proven on every push (the CI `deck image` job):**

- **Gates in the build** — the multi-stage Dockerfile runs the
  no-browser battery in a gates stage and every runtime file is copied
  out of it: no green gates, no runnable image.
- **Named volume** — the ledger lives on `/data`
  (`-v emberfall-data:/data`); CI registers a pilot, kills the
  container, boots again on the same volume and logs the pilot back in
  — persistence is a checked fact, not a flag.
- **Non-root + health-checked** — uid 1001, `HEALTHCHECK` wired to
  `/api/health`; a wedged deck goes `unhealthy` and gets restarted.
- **The NODE_ENV contract** — the bare image answers plain HTTP so
  orchestrator probes work; with `NODE_ENV=production` every real
  endpoint 426s without TLS while `/api/health` stays answerable.
  Production is structurally forced through a proxy, not merely
  recommended.
- **TRUST_PROXY** — behind one proxy hop, `TRUST_PROXY=1` keys rate
  limits and `Secure` cookies on the real client (the gates job proves
  the XFF path); the published port stays on `127.0.0.1`.

**The three gaps between that and a real rollout:**

11. **TLS termination** — Caddy or nginx in front, ACME renewal on,
    HSTS on; the 426 contract already makes TLS structural, so this is
    pure plumbing. Proof: a drill that boots image + proxy on a scratch
    host and asserts the loop end-to-end — login sets `Secure`, a board
    write lands, health still probes over HTTP.
12. **Backups off-box** — `db-backup --verify` exists and the local
    deck has a scheduled task, but container snapshots still default to
    the host's own disk. A rollout needs three things: a scheduler
    (host cron `docker exec deck node /app/tools/db-backup.js --verify`),
    a destination on different hardware (object storage via
    rclone/restic — snapshots are the user table: scrypt hashes and
    session-token hashes), and a restore *rehearsal* — boot a scratch
    deck from the off-box copy and log a pilot in. A backup on the
    ledger's own disk is not a backup.
13. **Log shipping** — the deck logs to stdout; the container runtime
    captures it and nothing forwards it (and the default json-file
    driver rotates nothing). Minimum: bounded rotation
    (`max-size`/`max-file`). The real answer: a shipper
    (promtail/vector) to a sink with a bounded window (~30 days),
    carrying boot lines, limiter 429 telemetry (feeds item 5), and
    errors — PII-free by policy: no callsigns, no token material, no
    hashes.

Deliberately out of scope, per ADR 0001's posture: Kubernetes,
multi-node HA, a managed database. The deck is one process and one
SQLite file; the rollout story stays sized to that, not to a fleet.

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
