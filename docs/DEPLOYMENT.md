# Deployment

EMBERFALL is a static game plus a Supabase project. The static files run anywhere. Accounts and the global and daily boards come from Supabase project `rgmbexmodebegllahotc`, which the browser talks to directly with the publishable key. There is no game server to run.

## Where it lives today

| | URL | Notes |
|---|---|---|
| Vercel | https://emberfall-game-two.vercel.app/ | Main public link (the repo homepage). Deploys automatically on every push to `main`. `vercel.json` sets the security headers and allows framing by bountyboard.gg. |
| GitHub Pages | https://fahadibrahim93.github.io/emberfall/ | Published by CI after every green push to `main`. |
| Supabase | `https://rgmbexmodebegllahotc.supabase.co` | Accounts, callsigns and the global and daily boards (live since #25). Schema in `supabase/migrations/`. |

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

## Local preview

```bash
node tools/serve-static.mjs --port 8080
```

This serves only the public payload (the same files Vercel publishes after `.vercelignore`) with the headers from `vercel.json`. It has no API; the local page talks to the same Supabase project as the live site. The browser suite and `tools/selftest-ci.js` start it on port 8123 for you.

## What Vercel publishes

`.vercelignore` keeps repo tooling (`tools/`, `tests/`, `packages/`, `supabase/`, `package.json` and the gate scripts) off the public host. `node deadscan.js --check` fails CI if one of those paths stops being ignored or a game file starts being ignored.
