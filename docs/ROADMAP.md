# Roadmap

Ordered by priority, not by release date. Every item ships the usual way: stamped with `tools/release.mjs`, gated by CI and tagged so it can be rolled back.

## Where things stand (2026-10-20)

- **Done:** security fixes (#10), the portal build (#11) with a hard failure when no zip is made (#13), and shared best-run boards and pilot profiles (#12, #14, merged).
- **Distribution:** submitted free to the Bounty Board Arcade (review pending). itch.io and CrazyGames are next.
- **Not live yet:** leaderboards and profiles need a running Command Deck.

## Now

1. **Deploy the Command Deck.** The tooling is ready (`tools/deck-deploy.mjs` plan / doctor / launch / deploy / verify). It still needs a Fly account, `fly auth login` or `FLY_API_TOKEN`, and optionally a Google OAuth client ID. See [DEPLOYMENT.md](DEPLOYMENT.md).
2. **Apply the mirror schema and sync** (issue #15). Apply `tools/mirror-schema.sql`, then run `node tools/db-sync.mjs`. To automate it, add a `SUPABASE_SERVICE_KEY` repository secret and a sync step to the stats workflow. The hourly `tools/mirror-alarm.mjs` already flags a mirror that's unreachable, stale or polluted.
3. **Portal submissions:** itch.io and CrazyGames, using `npm run build:portal`.

## Next

4. **Keyset pagination** for boards once a board passes the offset cap (issue #16).
5. **More browser coverage** for the HTML dossier and the stats mode tabs (issue #17).
6. **Seasonal feats**, such as perfect weeks across seasons and Wardenfalls across seasons, owned by the deck as always.
7. **Accessibility pass:** extend the colour-blind checks already used for paints to UI states, focus rings and screen-reader labels on the registry tabs.

## Before the deck hosts real players

CI already proves the container on every push: gates run in the build, data persists on a named volume, it runs as non-root, it has a health check, and production forces TLS. What's still missing:

- **TLS in front:** Caddy or nginx with automatic certificates and HSTS. (Fly handles this at its edge.)
- **Off-box backups:** a schedule, storage on different hardware and a restore rehearsal from that copy. `tools/drill-restore.mjs` covers the local round trip.
- **Log shipping:** `fly.toml` already caps log size. A real setup would ship logs to a sink with about 30 days of retention, with no callsigns, tokens or hashes in them.

Out of scope on purpose: Kubernetes, multi-node HA and a managed database. The deck is one process and one SQLite file.

## Not planned

- **Supabase as the game's store.** ADR 0001 keeps the deck as the only source of truth.
- **Accounts stored on the static build.** A static page can't keep secrets. Instead the page adopts a deck (`deck.json`) and talks to it over CORS with bearer sessions.
- **Claiming authoritative anti-cheat.** Score checks are plausibility detection, and the docs say so. That changes only if a server-side re-simulation ships.

## Done recently

- Global tab falls back to the public mirror and links to `stats.html` (v4.21.0)
- Board pagination (v4.22.0) and season history on the mirror (v4.27.0)
- Rate-limit telemetry in `/api/health` and the `ops.html` operator page (v4.23–v4.24)
- Replay-window drill matrix (v4.23.0)
