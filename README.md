# EMBERFALL v4.27.0 — Orbital Intercept

**A free arcade space shooter that runs in your browser.** Something came through the Kuiper Gate, and you're the last ship between it and the orbital yard. Fly close to the fire, graze bullets for points, and see how deep you get.

**▶ Play now: https://emberfall-game-two.vercel.app/** (also on [GitHub Pages](https://fahadibrahim93.github.io/emberfall/))

[![CI](https://github.com/FahadIbrahim93/emberfall/actions/workflows/ci.yml/badge.svg)](https://github.com/FahadIbrahim93/emberfall/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![press kit](https://img.shields.io/badge/press%20kit-playtest%20recruiting-ff8a2b)](https://fahadibrahim93.github.io/emberfall/docs/press-kit.html)

<p align="center">
  <img src="docs/press/emberfall-wave1.gif" alt="The first seconds of wave 1: hostile fire, kills and combo ticks" width="720">
</p>

No install, and you don't need an account to play. The art, music and sound are all generated in code at runtime, so there are no asset files, no build step and no runtime npm packages. After the first visit it works offline.

## Controls

| | |
|---|---|
| Move | `WASD` or arrow keys |
| Fire | `Space` (or turn on autofire in Settings) |
| Dash | `Shift` |
| Pulse | `E` (or `Q`) |
| Pause | `P` or `Esc` |
| Mute / fullscreen | `M` / `F` |
| Touch | Drag anywhere to fly (it fires for you). DASH and PULSE buttons sit bottom-right. |
| Gamepad | Detected automatically. |

## Features

- **Five ships**, each with its own trade-offs, including SERAPH with a continuous cutting lance.
- **Four modes:** Endless, Boss Rush, the Daily Gauntlet (one seed for everyone, every day) and the Solar Tour (eight worlds, Mercury to the Kuiper Gate).
- **Scoring that rewards nerve:** graze bullets, chain combos and draft a boon after each boss.
- **A hangar to come back to:** paints, sigils, hull mastery and kill plaques.
- **Accessible by default:** four colour palettes, reduced-motion support, left-handed and large touch layouts, and a high-visibility bullets option.
- **Installable PWA** that plays offline.
- **Global and daily leaderboards**, live on the Vercel site. Sign in with an email magic link (or as a guest, once anonymous sign-in is turned on), pick a callsign, and your Endless and Daily runs post to the worldwide boards. Sign in with X is in review (#26) and not live yet.

## Leaderboards and accounts

Accounts and boards run on Supabase (project `rgmbexmodebegllahotc`). In short:

- **Accounts:** Supabase Auth. Each player gets a profile with a callsign (3-16 letters, digits, `_` or `-`, unique ignoring case).
- **Posting a score:** the game calls the `submit_score` RPC after it saves the run locally. Callsigns go through `set_callsign`. Those two RPCs are the only way to write: row-level security is on, the tables accept no direct writes, scores are bounds-checked (1 to 10,000,000), and each player can post at most 6 runs a minute and 300 a day.
- **Reading the boards:** anyone can read the public views `leaderboard_global` (best run per player per mode), `leaderboard_daily` (best run per player per UTC day) and `deck_stats` (live totals).
- **What stays local:** Boss Rush, flight school, offline play and portal builds keep scores on the device. The game is fully playable without signing in.

Scores are bounds-checked and rate-limited, not replayed on a server, so a determined cheater could still post a fake score. Details: [docs/LEADERBOARD-AND-ACCOUNTS.md](docs/LEADERBOARD-AND-ACCOUNTS.md).

<p align="center">
  <img src="docs/screenshots/gameplay.png" alt="Gameplay: the corridor, hostile fire and the HUD" width="720">
</p>

## Run it locally

Open `index.html` in a modern browser, or serve the folder so the service worker can install:

```bash
python -m http.server 8080      # or: npx serve .
# then open http://localhost:8080
```

The local copy talks to the same Supabase project as the live site (only the publishable key ships in `js/cloud.js`), so the Global tab works locally. To try schema changes, apply `supabase/migrations/` to your own Supabase project and point `js/cloud.js` at it.

`server.js` (the old Command Deck) still runs with `node server.js` for its drills, but it was never deployed and the live game doesn't use it.

## Portal build

For web game portals:

```bash
npm run build:portal
```

This writes `dist-portal/` and `dist-portal.zip` (with `index.html` at the zip root, under 20 MB). It injects `window.EMBERFALL_PORTAL=true`, strips off-site links and fails with an error if the zip isn't created. You can also force portal mode on any copy with `?portal=1`. In portal mode, scores stay on the device.

## Architecture

- **Game:** one `index.html` plus a few plain JavaScript modules in `js/`, drawn on a 2D canvas. No framework, no bundler.
- **Offline:** a service worker (`sw.js`) and a web app manifest.
- **Hosting:** Vercel (main link) and GitHub Pages, both static.
- **Accounts and boards:** Supabase Auth and Postgres. The browser loads the vendored supabase-js (`js/vendor/supabase.js`) only when it needs it, and writes only through the two RPCs. Schema: [`supabase/migrations/`](supabase/migrations/). Why: [ADR 0004](docs/adr/0004-supabase-source-of-truth.md).
- **Legacy:** `server.js` (a Node 22 + SQLite "Command Deck") and `fly.toml` are still in the repo, but the deck was never deployed. ADRs 0001-0003 describe that design and are kept for history.

## Tests

- **In-game self-test:** open `index.html?selftest` (77 checks).
- **Sim:** Vitest for the TypeScript sim in `packages/sim` (`npm run test:sim`).
- **Browser:** Playwright (`npm run test:browser`).
- **Gates in CI:** `check.sh` (syntax), `deadscan.js --check` (dead code and load order), `tools/copyguard.js` (no stale or inflated claims in copy), plus the legacy deck drills in `tools/`.

More detail: [Architecture](ARCHITECTURE.md) · [Changelog](CHANGELOG.md) · [Deployment](docs/DEPLOYMENT.md) · [Database](docs/DATABASE.md) · [Leaderboards & accounts](docs/LEADERBOARD-AND-ACCOUNTS.md) · [Roadmap](docs/ROADMAP.md).

<!-- fun-curve:start (maintained by tools/fun-scoreboard.mjs — regenerate with --readme; do not hand-edit) -->
## The fun curve — the game, measured release over release

Every release, the repo's own instrumented play — the first-60-seconds audit (`tests/fun-audit.spec.js`) and the autopilot bot (`tests/fun-loop.spec.js`) — flies the game, and the numbers become a row here: how deep the bot flies, what it kills, how smoothly it runs. Best-wave counts the wave the bot REACHED in its 56-second headless flight — a depth probe, not a feat claim. Median-fps is environment-sensitive (CI's software renderer vs your GPU) — read the trend within a column, not the absolute.

Data: `docs/audit/fun-curve.json` (committed; one write-once row per version, written by `tools/fun-scoreboard.mjs` from the run's own artifacts). The raw artifacts are regenerated every run and stay git-ignored — only the distilled curve ships.

| Release | Date | Bot wave | Bot kills | Bot grazes | Combo × | Bot median fps | First-60s median fps |
|---|---|---|---|---|---|---|---|
| v4.27.0 "The Same Ladder" | 2026-10-19 | 2 | 23 | 1 | ×2 | 29 | 20 |
| v4.26.0 "The Open Gate" | 2026-09-30 | 2 | 20 | 3 | ×3 | 30 | 26 |
| v4.25.0 "The Listening Deck" | 2026-09-28 | 3 | 28 | 5 | ×2 | 47 | 45 |
| v4.24.0 "Signal" | 2026-09-28 | 2 | 15 | 1 | ×2 | 27 | 24 |
| v4.23.1 "The Fence" | 2026-09-28 | 2 | 17 | 2 | ×2 | 46 | 46 |
| v4.23.0 "Glasscockpit" | 2026-09-27 | 2 | 19 | 2 | ×2 | 27 | 21 |
| v4.22.2 "Open Surfaces" | 2026-09-27 | 2 | 20 | 6 | ×2 | 35 | 34 |
| v4.22.1 "The Recruiting Page" | 2026-09-27 | 3 | 27 | 4 | ×3 | 33 | 30 |
| v4.22.0 "The World Stage" | 2026-09-27 | 2 | 22 | 6 | ×2 | 27 | 21 |
| v4.21.2 "Always Reachable" | 2026-09-26 | 2 | 28 | 3 | ×3 | 25 | 23 |
| v4.21.1 "The Curve" | 2026-09-26 | 3 | 29 | 2 | ×2 | 39 | 23 |
| v4.21.0 "Proof of Play" | 2026-09-26 | 3 | 28 | 4 | ×2 | 46 | 48 |
| v4.20.0 "First Contact" | 2026-09-26 | 2 | 17 | 4 | ×2 | 24 | 48 |

<!-- fun-curve:end -->

## What's new in v4.27.0 — "The Same Ladder"

- Boards, the `/pilot` page and the public mirror now all describe the same flight: the one that set the score. Ties share a rank. Older release notes are in [CHANGELOG.md](CHANGELOG.md).

## Contributing

Bug reports, playtest notes and PRs are all welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

```bash
npm ci
bash check.sh                   # syntax gate
npm test                        # sim tests, browser tests, self-test (Node 22+)
```

Found a security issue? Please report it privately. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).

## Credits

Made by Hope Theory (AgentHope).
Fonts: [Michroma](https://fonts.google.com/specimen/Michroma) and [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch), both SIL Open Font License 1.1, self-hosted in `fonts/`.
