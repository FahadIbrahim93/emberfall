# EMBERFALL — Orbital Intercept

A free arcade space shooter that runs in your browser. Something came through the Kuiper Gate, and you're the last ship between it and the orbital yard.

[![Play now](https://img.shields.io/badge/Play%20now-emberfall--game--two.vercel.app-ff8a2b?style=for-the-badge)](https://emberfall-game-two.vercel.app/)

**Play now: https://emberfall-game-two.vercel.app/**

[![CI](https://github.com/FahadIbrahim93/emberfall/actions/workflows/ci.yml/badge.svg)](https://github.com/FahadIbrahim93/emberfall/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

<p align="center">
  <img src="docs/screenshots/gameplay.png" alt="EMBERFALL gameplay: the corridor, hostile fire and the HUD" width="720">
</p>

No install and no account needed. Art, music and sound are generated in code at runtime, so there are no asset files and no build step. After the first visit it plays offline.

## Features

- **Five ships** with different trade-offs, including WRAITH, the gate-recovered hull, and SERAPH with its continuous cutting lance.
- **Four modes:** Endless, Boss Rush, the Daily Gauntlet (one seed for everyone, each UTC day) and the Solar Tour (eight worlds, Mercury to the Kuiper Gate).
- **Scoring that pays for nerve:** graze bullets, chain combos, and pick a boon after each boss.
- **A hangar to come back to:** paints, sigils, hull mastery and kill plaques.
- **Accessibility options:** four colour palettes, reduced motion, left-handed and large touch layouts, high-visibility bullets.
- **Global and daily leaderboards.** Play as a guest with no account, or create one with your email and a password, confirm the email, and pick a callsign. Your Endless and Daily runs then post to the worldwide boards, which list registered pilots only. Sign in with X is planned.
- **Installable PWA** that works offline.

## Controls

| Action | Keys |
|---|---|
| Move | `WASD` or arrow keys |
| Fire | `Space` (or turn on autofire in Settings) |
| Dash | `Shift` |
| Pulse | `E` or `Q` |
| Pause | `P` or `Esc` |
| Mute / fullscreen | `M` / `F` |
| Touch | Drag anywhere to fly; firing is automatic. DASH and PULSE buttons sit bottom-right. |
| Gamepad | Detected automatically. |

## How it works

- The game is one `index.html` plus a handful of plain JavaScript modules in `js/`, drawn on a 2D canvas. No framework, no bundler.
- It's hosted as static files on Vercel. Production promotion is explicit; green `main` CI publishes its tested artifact to [GitHub Pages](https://fahadibrahim93.github.io/emberfall/). See the [deployment procedure](docs/DEPLOYMENT.md).
- Accounts and boards run on Supabase (project `rgmbexmodebegllahotc`). Row-level security is on, the tables accept no direct writes, and the only write path is two `SECURITY DEFINER` functions: `submit_score` and `set_callsign`. Scores are bounds-checked (1 to 10,000,000) and rate-limited (6 a minute, 300 a day per player). Only registered accounts can post, and the public views leave out anonymous sessions. Guests keep their scores on the device.
- Scores aren't replayed on a server, so a determined cheater could still post a fake score within bounds. Boss Rush, offline play and portal builds keep scores on the device.

More detail in [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/LEADERBOARD-AND-ACCOUNTS.md](docs/LEADERBOARD-AND-ACCOUNTS.md).

## Local development

Open `index.html` in a browser, or serve it the way Vercel does so the service worker can install:

```bash
node tools/serve-static.mjs --port 8080   # static files only, same headers as vercel.json
```

A local copy talks to the same Supabase project as the live site (only the publishable key ships, in `js/cloud.js`). To try schema changes, apply `supabase/migrations/` to your own project and point `js/cloud.js` at it.

Tests need Node 22 or newer:

```bash
npm ci
bash check.sh             # syntax gate
node deadscan.js --check  # dead code and load order
npm run test:sim          # Vitest, packages/sim
npm run test:browser      # Playwright
npm test                  # sim + browser + in-game self-test
```

You can also run the self-test in the page with `index.html?selftest` (63 checks).

CI runs these checks on every push to `main`. The last main run passed on 2026-11-07.

For web game portals, `npm run build:portal` writes `dist-portal/` and `dist-portal.zip`. Portal builds keep scores on the device. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tech stack

- Vanilla JavaScript, HTML5 canvas, Web Audio
- Service worker and web app manifest for offline play
- Vercel for hosting (GitHub Pages as a mirror)
- Supabase Auth and Postgres, via vendored supabase-js (`js/vendor/supabase.js`)
- Vitest and Playwright for tests, GitHub Actions for CI

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md): module load order, state ownership, invariants
- [docs/LEADERBOARD-AND-ACCOUNTS.md](docs/LEADERBOARD-AND-ACCOUNTS.md): accounts, boards and their limits
- [docs/DATABASE.md](docs/DATABASE.md): the Supabase schema
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): hosting, Supabase setup, portal builds
- [docs/ROADMAP.md](docs/ROADMAP.md): what's next
- [docs/adr/](docs/adr/): design decisions ([ADR 0004](docs/adr/0004-supabase-source-of-truth.md) is the current one)
- [CHANGELOG.md](CHANGELOG.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md)
- [Press kit](docs/press-kit.md)

## Release history

Full per-release notes live in [CHANGELOG.md](CHANGELOG.md), with what changed and when. Release numbers are not used as achievement claims.

The per-release fun curve (bot depth, kills, grazes, fps) is distilled from the repo's own instrumented play runs into [`docs/audit/fun-curve.json`](docs/audit/fun-curve.json), written by `tools/fun-scoreboard.mjs`. Median-fps is environment-sensitive — read the trend within a column, not the absolute.

## What's new

Detailed per-release notes live in [CHANGELOG.md](CHANGELOG.md). Recent work includes guest play, pilot accounts and callsigns, the Daily Gauntlet board, and the Solar Tour (eight worlds).


## License

MIT. See [LICENSE](LICENSE).

Made by Hope Theory. Fonts: [Michroma](https://fonts.google.com/specimen/Michroma) and [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch), both SIL Open Font License 1.1, self-hosted in `fonts/`.
