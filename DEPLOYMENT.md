# Deploying the Command Deck (Docker)

*The game shell ships itself — every push to `main` publishes the static
site to GitHub Pages through the `deploy` job. This page is about the
other half: the **Command Deck** (`server.js`), the ledger-backed server
behind accounts, duels, dailies and the global boards. As of v4.19.0 it
ships as a container image whose build IS the gate battery.*

## Quickstart

```bash
docker build -t emberfall-deck .
docker run -d --name deck -p 8123:8123 -v emberfall-data:/data emberfall-deck
curl -s http://127.0.0.1:8123/api/health      # → {"ok":true,...}
```

The ledger lives on the `/data` volume (`EF_DATA_DIR=/data` in the
image). **The volume is the only durable state** — destroy the
container freely, never the volume.

## The build is the gate battery

The image is multi-stage:

1. **gates** — `check.sh`, `deadscan --check`, `copyguard`, the
   SQL-binding audit, daily-economy parity, the economy sim and the
   `packages/sim` unit tests run inside the build. Any red gate fails
   the build.
2. **runtime** — copies exactly one artifact out of the gates stage,
   which makes it *strictly* depend on the gates passing: a broken gate
   can never produce a runnable image.

CI mirrors this: the `docker` job boots the built image, proves
`/api/health`, flies a real register, **restarts the container and logs
the same pilot back in** (volume persistence), and asserts the runtime
user is not root.

## Behind a proxy (production shape)

The deck rate-limits on the REAL client IP. Behind one nginx hop run
with `TRUST_PROXY=1`; without it `X-Forwarded-For` is ignored as
attacker-controlled (this is drilled in CI and smoke):

```bash
docker run -d --name deck -p 127.0.0.1:8123:8123 \
  -v emberfall-data:/data -e TRUST_PROXY=1 emberfall-deck
```

and let nginx terminate TLS and forward to `127.0.0.1:8123`. Do not
publish the port on `0.0.0.0` when a proxy fronts the deck.

## Environment reference

| Variable       | Default | Meaning                                             |
| -------------- | ------- | --------------------------------------------------- |
| `PORT`         | `8123`  | listen port (the `--port N` flag beats the env)     |
| `EF_DATA_DIR`  | `/data` | ledger directory (`emberfall.db` + WAL)             |
| `TRUST_PROXY`  | unset   | `1` = honor `X-Forwarded-For` from the proxy hop    |
| `EF_DECK_DAY`  | unset   | **drills only** — a pinned day in production is an incident |

## Health, logs, restarts

- `GET /api/health` → `{"ok":true}` — wire your orchestrator's
  healthcheck to it (the image's built-in HEALTHCHECK already does).
- Logs go to stdout; `docker logs -f deck` is the whole story
  (anti-cheat rejections included).
- Restarts are safe: sessions and scores are in SQLite on the volume;
  the boot sweep prunes stale duels exactly as in production.

## Backups

The ledger is one SQLite file. Snapshot it under write traffic with the
repo's own tool (WAL-safe, verify built in):

```bash
docker exec deck node /app/tools/db-backup.js --verify --keep 14
```

…or keep the scheduled task/host cron you already run against the
ledger directory. Restore = stop deck, replace `emberfall.db` on the
volume, start deck.

## Updating

```bash
git pull
docker build -t emberfall-deck .
docker rm -f deck
docker run -d --name deck -p 127.0.0.1:8123:8123 \
  -v emberfall-data:/data -e TRUST_PROXY=1 emberfall-deck
```

The Gates-in-build contract means `docker build` re-runs the battery on
the new commit — a release and a container image are the same artifact
decision.
