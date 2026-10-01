# EMBERFALL — deployment

*Two ways to put EMBERFALL in front of players. They are not competitors —
the static game is the product, the Command Deck is its multiplayer soul,
and the deck is **optional by design**: without one, the game probes
`/api/health` once, fails silently, and stays 100% local.*

## What deploys where

| | GitHub Pages (canonical) | Command Deck (self-hosted) |
|---|---|---|
| Serves | the static game (index.html, js/, sw.js, icons, fonts) | the same game + the accounts/boards/duels API |
| Runs on | GitHub Actions on every green push to `main` | any Node ≥ 22 host, one process, one origin |
| Auth | none — pure static | callsign + password (see SECURITY.md) |
| Points at | https://fahadibrahim93.github.io/emberfall/ | wherever you point DNS; the game auto-detects the deck on its own origin |

The two live together naturally: a Pages-hosted game simply runs in local
mode, and a self-hosted deck serves the identical client plus the API.

## The canonical deployment: GitHub Pages

- **Published by the CI itself** — the `deploy` job runs only after the
  `verify` job (the whole gate battery) is green on `main`, and its final
  step re-fetches the published URL and asserts the live `index.html` is
  byte-identical to the one that just merged. A deploy is never a
  hope; it is a checked fact.
- **Rollback is one command.** Every release is an annotated tag
  (`git tag -l 'v4.*'`), and Pages re-deploys any ref: to roll back,
  publish a prior tag's workflow run (Actions → the tag's run →
  Re-run deploy) or force-redeploy from any point in history.
- The service worker is network-first for the shell, so updates ship
  immediately; the cache name (`emberfall-v4.NN`) bumps every release so
  installed clients refresh.

## The Command Deck in production

```bash
NODE_ENV=production TRUST_PROXY=1 PORT=8123 node server.js
```

- **TLS is mandatory in production** — the deck answers 426 unless the
  connection is secure; terminate TLS at nginx/Caddy and set
  `TRUST_PROXY=1` so limiter keys and cookie `Secure` flags read the
  real client
- **The database lives outside the served tree** by default
  (`../emberfall-data/`), is never servable (allowlist), and is backed up
  live with `node tools/db-backup.js --verify`
- Port discipline: `--port` beats an ambient `PORT`; invalid values die
  loudly (drilled in CI)
- Keep `main` green and you can redeploy anywhere from any tag — the
  whole state is one SQLite file plus the process

### The deck as a container (v4.19.0)

The deck also ships as an image whose **build IS the gate battery**:
the multi-stage `Dockerfile` runs the no-browser gates (syntax,
dead-code, copy-guard, SQL audit, parity, economy sim, sim tests) in a
first stage, and the runtime stage copies one artifact out of it — a
red gate can never produce a runnable image.

```bash
docker build -t emberfall-deck .
docker run -d --name deck -p 127.0.0.1:8123:8123 \
  -v emberfall-data:/data -e TRUST_PROXY=1 emberfall-deck
```

- Runtime is `node:22-alpine`, **non-root** (uid 1001), with the ledger
  on the `/data` volume (`EF_DATA_DIR=/data`) and a HEALTHCHECK wired to
  `/api/health`. `server.js` imports only node builtins, so the runtime
  stage needs no npm at all.
- CI proves the image every push: boot → `/api/health` → a real
  register → **container restart → login survives** (volume
  persistence) → the runtime user is not root.
- Behind a proxy keep `TRUST_PROXY=1` and publish the port on
  `127.0.0.1` only; terminate TLS at nginx/Caddy.
- Backups inside the container: `docker exec deck node
  /app/tools/db-backup.js --verify --keep 14` — snapshots are the user
  table (scrypt password hashes, session-token hashes) and `backups/`
  is **git-ignored on purpose**; for machine-loss durability point
  `--out` at storage outside the repo.

### A note on the Vercel previews

Vercel auto-connects to this repo and builds **preview** deployments for
branch pushes (that is where `*.vercel.app` URLs come from). They are
ephemeral build previews, not the product: the canonical, verified,
tagged deployment is GitHub Pages, and the repo's homepage link points
there. The deck (accounts, boards) has never been hosted on Vercel —
it is self-hosted by design, one Node process with its local SQLite.

**They should be disconnected, not tolerated.** Saves and identity are
per-origin: a pilot who opens a `*.vercel.app` URL gets a *separate*
save, separate sessions, separate everything from the same person on
Pages — two circulating URLs fragment pilots. Vercel builds are also
gated by nothing (no tag, no battery; Pages is byte-verified by CI
against the tagged commit on every release), and Google sign-in can
never be authorized for that origin. To cut them: Vercel dashboard →
the project → Settings → Git → **Disconnect**, then delete the project.
Nothing in this repo links to a `*.vercel.app` URL, so nothing breaks.

## Environment

| Variable | Meaning |
|---|---|
| `PORT` / `--port` | listen port (flag wins; default 8123) |
| `EF_DATA_DIR` | database directory (default `../emberfall-data`) |
| `EF_DECK_DAY` | rehearsal clock — pins the deck's *day* for drills; loudly logged |
| `EF_DUEL_RETENTION_DAYS` | duel retention window (default 7) |
| `NODE_ENV=production` | require HTTPS, `Secure` cookies |
| `TRUST_PROXY=1` | trust one proxy hop for X-Forwarded-For |
| `EF_CORS_ORIGINS` | ADR 0002: comma-separated origins allowed to call the API (e.g. `https://fahadibrahim93.github.io`); `*` = any origin for public data; empty = same-origin only |
| `EF_LIVE_LEDGER=1` | **v4.23.1 fence:** health reports `"live":true`; every battery tool (smoke, all 13 drills, the browser suite) then REFUSES to run against this deck — production ledgers are never test targets (born of the 2026-09-27 incident: a release battery's smoke run seeded 5 machine pilots into the live Wardenfall deck on 8123; purged, keepsake `G:/emberfall-ir-bundle/polluted-deck-live-*.db`) |
| `EF_CONNECT_SRC` | ADR 0002: extra origins this deck's SERVED pages may dial (deck-to-deck); Pages needs no such permission |

## Serving the Pages game from your deck (v4.22)

One deployment turns the published Pages game into a full client of your
deck — accounts, worldwide boards, duels, cloud saves for every player on
Earth, no fork of the game required:

```bash
NODE_ENV=production TRUST_PROXY=1 EF_LIVE_LEDGER=1 EF_CORS_ORIGINS=https://fahadibrahim93.github.io \
  node server.js --port 8123
```

- behind your TLS-terminating proxy (Caddy/nginx), as always — the 426
  contract already forces that
- every Pages player now gets the **sign in / create account** panel
  linked to YOUR deck; sessions ride bearer tokens (ADR 0002) because
  cookies cannot cross origins
- the global tab reads YOUR live boards with pagination; names link to
  `https://<your-deck>/pilot/<callsign>` profiles
- players can also point ANY copy of the game at any deck themselves:
  Settings → Command deck → "deck address" field, or `?deck=<url>` on the
  address bar — both persist on the device
- prove the door before you open it: `node tools/drill-cross-origin.mjs`
  (CI runs it on every push; 23 checks incl. the disallowed-origin
  silence and the bearer-logout kill)

### A one-command host: the Fly.io blueprint

`fly.toml` now ships in the repo root — the full prep is a 5-minute task.
**The 5-minute version (after `fly auth login` — the only step that needs
you):**

```bash
fly launch --no-deploy --name <your-deck-name> --region iad --copy-config
fly volumes create ef_data --size 1 --region iad
fly secrets set NODE_ENV=production TRUST_PROXY=1 \
  EF_CORS_ORIGINS=https://fahadibrahim93.github.io
fly deploy
curl https://<your-deck-name>.fly.dev/api/health   # → ok:true
```

**Optional — Google sign-in (v4.26):** create an OAuth client at
<https://console.cloud.google.com/apis/credentials> (type *Web
application*, authorized JavaScript origins:
`https://fahadibrahim93.github.io` and your deck's origin), then add the
client id as one more secret. No callback URL is needed — the flow is
the GIS button + POST verification, not a redirect dance:

```bash
fly secrets set EF_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
fly deploy
```

The deck verifies every ID token itself (RS256 against Google's JWKS,
audience pinned to your client id) and mints its own session — no third-
party auth service, nothing Google stored. Unset = the feature simply
doesn't exist (the API answers 501, the button never arms, the CSP
stays fully closed).

Then open https://fahadibrahim93.github.io/emberfall/ — sign in from the
live site; the Global tab should read "Linked to command deck (remote)".
The container path is proven in CI (gates-in-build, named volume,
non-root); what a public rollout still owns is listed in the roadmap:
scheduled off-box backups and log shipping.

The container path is proven (see ROADMAP "The container path" for the
gaps a real rollout still owns: TLS, off-box backups, log shipping). The
short version on Fly:

```bash
fly launch --no-deploy --name emberfall-deck --region iad
fly volumes create ef_data --size 1 --region iad
fly deploy                      # builds the Dockerfile — gates run in-build
fly secrets set NODE_ENV=production TRUST_PROXY=1 \
  EF_CORS_ORIGINS=https://fahadibrahim93.github.io
fly scale memory 256            # the deck is one process; stay small
```

Fly terminates TLS at the edge (the deck stays plain HTTP behind it),
`fly.toml` mounts the volume at `/data` and wires the health check to
`/api/health`. Backups: `fly ssh console -C "node /app/tools/db-backup.js
--verify --keep 14"` on a schedule, `--out` a directory you sync off-box.
