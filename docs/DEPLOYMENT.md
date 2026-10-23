# Deployment

EMBERFALL is a static game plus a Supabase project. The static files run anywhere. Accounts and the global and daily boards come from Supabase project `rgmbexmodebegllahotc`, which the browser talks to directly with the publishable key. There is no game server to run.

## Where it lives today

| | URL | Notes |
|---|---|---|
| Vercel | https://emberfall-game-two.vercel.app/ | Main public link (the repo homepage). Deploys automatically on every push to `main`. `vercel.json` sets the security headers and allows framing by bountyboard.gg. |
| GitHub Pages | https://fahadibrahim93.github.io/emberfall/ | Published by CI after every green push to `main`. |
| Supabase | `https://rgmbexmodebegllahotc.supabase.co` | Accounts, callsigns and the global and daily boards (live since #25). Schema in `supabase/migrations/`. |
| Command Deck (Fly) | never deployed (legacy) | `deck.json` still names `https://emberfall-deck.fly.dev`, which was never launched. Nothing live depends on it. |

Saves and sign-ins are per origin, so a player on Vercel and the same player on Pages have separate local saves.

## GitHub Pages

- The `deploy` job runs only after the full `verify` job passes on `main`. It then re-fetches the live site and checks that `index.html` matches the commit byte for byte.
- Every release is an annotated tag (`git tag -l 'v4.*'`). To roll back, re-run the deploy for an older tag in Actions.
- The service worker is network-first, and its cache name (`emberfall-v4.NN`) changes every release, so installed copies update.

## Supabase

- **Schema changes:** add a file under `supabase/migrations/` and apply it to the project (Supabase CLI `supabase db push`, or the SQL editor). Applied migrations are never edited.
- **Auth:** email magic link is on. Anonymous sign-in shows a guest button only once it's enabled in the project's Auth settings. Sign in with X (provider `x`) is pending in #26.
- **Redirect URLs:** the Vercel and Pages origins must be in the project's allowed redirect URLs for magic links to come back to the game.
- **Monitoring:** `node tools/mirror-alarm.mjs` checks that the project answers and `deck_stats` agrees with `profiles`.
- **Keys:** only the publishable key ships in `js/cloud.js`. The service role key is never committed or used by the game.

## Portal build

```bash
npm run build:portal
```

`tools/build-portal.sh` copies the playable files into `dist-portal/`, injects `window.EMBERFALL_PORTAL=true`, strips off-site hosts and writes `dist-portal.zip` with `index.html` at the root (20 MB limit). It uses `zip`, falls back to python3 and exits with an error if no zip is created. `?portal=1` turns on the same mode in any copy. In portal mode, scores stay on the device.

## Historical: running the Command Deck

*The Command Deck was never deployed, and the live game doesn't use it. These notes are kept because `server.js`, `Dockerfile` and `fly.toml` are still in the repo and CI still exercises them.*

### Running it

```bash
NODE_ENV=production TRUST_PROXY=1 node server.js --port 8123
```

- **TLS is required in production.** Real endpoints answer 426 without it, though `/api/health` still works over HTTP. Terminate TLS at Caddy or nginx and set `TRUST_PROXY=1`.
- **Data** lives outside the served folder (`../emberfall-data/` by default, or `EF_DATA_DIR`). Back it up live with `node tools/db-backup.js --verify`. Backups contain password and session hashes, so `backups/` is git-ignored. Keep copies off the machine.
- **Ports:** `--port` beats an ambient `PORT`. Bad values exit with an error.

#### As a container

The `Dockerfile` runs the non-browser test gates in its first stage, so a failing gate can't produce an image.

```bash
docker build -t emberfall-deck .
docker run -d --name deck -p 127.0.0.1:8123:8123 \
  -v emberfall-data:/data -e TRUST_PROXY=1 emberfall-deck
```

It runs on `node:22-alpine` as a non-root user (uid 1001), stores data on `/data` and has a health check on `/api/health`. CI checks on every push that a login survives a container restart.

#### On Fly.io

`fly.toml` is in the repo root. The fastest path is the helper:

```bash
node tools/deck-deploy.mjs doctor    # checks flyctl, auth and a clean tree
node tools/deck-deploy.mjs launch    # app, volume, secrets, first deploy
node tools/deck-deploy.mjs verify    # health, live fence, CORS, Google sign-in
```

Or by hand:

```bash
fly launch --no-deploy --name <your-deck-name> --region iad --copy-config
fly volumes create ef_data --size 1 --region iad
fly secrets set NODE_ENV=production TRUST_PROXY=1 EF_LIVE_LEDGER=1 \
  EF_CORS_ORIGINS=https://fahadibrahim93.github.io,https://emberfall-game-two.vercel.app
fly deploy
curl https://<your-deck-name>.fly.dev/api/health    # → "ok":true
```

Fly terminates TLS at the edge. For backups, run this on a schedule and sync the folder off the machine:

```bash
fly ssh console -C "node /app/tools/db-backup.js --verify --out /data/backups --keep 14"
```

Rehearse a restore with `node tools/drill-restore.mjs`, which CI also runs.

#### Optional: Google sign-in

Create a *Web application* OAuth client in Google Cloud. Add the game and deck origins as authorized JavaScript origins, then run:

```bash
fly secrets set EF_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com && fly deploy
```

The deck verifies each ID token itself and issues its own session. It stores no Google credentials. If this variable is unset, the button never appears and the route answers 501.

#### Optional: reading playtest notes

On production or proxied decks, `GET /api/feedback` is closed. Read notes on the machine with the database: `node tools/feedback-report.mjs --db /data/emberfall.db`. To read them over HTTP, set an `EF_OPS_TOKEN` secret (for example from `openssl rand -hex 24`, never committed) and send it as the `X-Emberfall-Ops` header.

### After the deck is up

1. Open the live game and create an account (Settings → Command deck).
2. Fly a run and check it shows on the Global tab.
3. Open `ops.html` on the deck origin to see the census, the limiters and the live-ledger fence.

### Deck environment variables

| Variable | What it does |
|---|---|
| `PORT` / `--port` | Listen port (the flag wins; default 8123) |
| `EF_DATA_DIR` | Database folder (default `../emberfall-data`) |
| `NODE_ENV=production` | Require HTTPS and `Secure` cookies |
| `TRUST_PROXY=1` | Trust one proxy hop for `X-Forwarded-For` |
| `EF_CORS_ORIGINS` | Comma-separated origins allowed to call the API ([ADR 0002](adr/0002-cross-origin-deck-bearer-sessions.md)). `*` allows any origin for public data. Empty means same-origin only. |
| `EF_CONNECT_SRC` | Extra origins the deck's own pages may connect to |
| `EF_LIVE_LEDGER=1` | Marks a production deck. Smoke tests, drills and browser tests refuse to run against it. |
| `EF_DECK_DAY` | Pins the deck's day for rehearsals (logged loudly) |
| `EF_DUEL_RETENTION_DAYS` | How long duels are kept (default 7) |
| `EF_GOOGLE_CLIENT_ID` | Turns on Google sign-in |
| `EF_OPS_TOKEN` | Allows reading `/api/feedback` over HTTP |
