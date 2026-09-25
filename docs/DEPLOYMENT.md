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

## Environment

| Variable | Meaning |
|---|---|
| `PORT` / `--port` | listen port (flag wins; default 8123) |
| `EF_DATA_DIR` | database directory (default `../emberfall-data`) |
| `EF_DECK_DAY` | rehearsal clock — pins the deck's *day* for drills; loudly logged |
| `EF_DUEL_RETENTION_DAYS` | duel retention window (default 7) |
| `NODE_ENV=production` | require HTTPS, `Secure` cookies |
| `TRUST_PROXY=1` | trust one proxy hop for X-Forwarded-For |
