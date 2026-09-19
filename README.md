# EMBERFALL v3.7.0 — Orbital Intercept

[![CI](https://github.com/FahadIbrahim93/emberfall/actions/workflows/ci.yml/badge.svg)](https://github.com/FahadIbrahim93/emberfall/actions/workflows/ci.yml)
[![Play live](https://img.shields.io/website?url=https%3A%2F%2Ffahadibrahim93.github.io%2Femberfall%2F&label=play%20live)](https://fahadibrahim93.github.io/emberfall/)

A zero-build, static orbital intercept shooter. Art, music, and sound are generated procedurally at runtime. The game has no runtime package dependencies and plays locally from `index.html`; hosted installs work offline after their first successful service-worker install.

## Play

- **Any device, right now:** play the deployed build at **https://fahadibrahim93.github.io/emberfall/** — or open `index.html` in a modern browser. Chrome, Edge, Firefox, Safari, desktop or phone.
- **Offline PWA:** for install-as-app, serve the folder once over HTTP(S) (or use the live URL) so the service worker can cache the shell.
- **Keyboard:** `WASD`/arrows fly · `Space` fire · `Shift` dash · `E` pulse · `P` pause · `M` mute · `F` fullscreen
- **Touch:** drag anywhere to fly (fires for you); DASH / PULSE buttons bottom-right
- **Gamepad:** sticks/buttons auto-detected

## CI & deployment

Every push runs the full gate battery (syntax, dead-code + module load order, economy model, API smoke) via GitHub Actions; green builds of `main` auto-publish the playable game to **GitHub Pages**. The Pages build is the static game only — leaderboards/accounts need the self-hosted `node server.js` command deck (the game detects this and runs in local mode, saving to the device).

## Install as an app (PWA)

Serve the folder over http/https and open it — the browser will offer **Install app** (Chrome/Edge desktop + Android). On iOS Safari: Share → *Add to Home Screen*.

```bash
# from this folder, pick any one:
python -m http.server 8080
npx serve .
```

Then open `http://localhost:8080` — the game registers its service worker and works fully offline from then on.

## Hosting

It's one HTML file plus an optional `sw.js`. Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, an S3 bucket — upload and go.

## Command Deck — accounts, cloud saves, worldwide boards (optional)

The game is complete offline. Add the self-hosted backend and it gains a real
account system, cloud saves, and plausibility-checked community leaderboards — with
**zero npm dependencies** (Node ≥ 22, built-in SQLite):

```bash
node server.js            # http://localhost:8123 — serves game + API
bash smoke.sh             # API + static-hygiene + load battery, all green
```

- **Auth:** callsign + password, scrypt-hashed (async, off the event loop), per-user salt, constant-time compare
- **Sessions:** 32-byte tokens, only SHA-256 stored, HttpOnly SameSite `Secure`-on-TLS cookies, 30-day expiry
- **Static allowlist:** only the game shell is served — data/, server source, git metadata, dotfiles all 404 (regression-tested in smoke.sh)
- **Hardened:** same-origin JSON guard, per-IP/user rate limits, input caps, parameterized SQL, security headers + CSP; production requires HTTPS
- **Cloud saves:** meta progression + settings sync across devices via last-write-wins merge with server convergence
- **Leaderboards:** top 10 per mode (endless / daily / boss rush), per-user best, and a plausibility-checked community rank — unverified runs never rank
- **Deployment:** one process, one origin — place production behind HTTPS (for example nginx with `NODE_ENV=production TRUST_PROXY=1`). Back up `data/emberfall.db` and its WAL files. The SQLite file is the database.

When no server is present the client probes `/api/health` once, fails silently,
and stays 100% local — the exact same game, stored in the browser.

## Verification

Every push runs the gates on GitHub Actions (badge above); the live-smoke job additionally asserts the published site is byte-identical to the merged commit.

- Open [`index.html?selftest`](https://fahadibrahim93.github.io/emberfall/index.html?selftest) — the built-in suite runs in a panel (bottom right): **37 tests, all PASS**. It covers math/RNG and determinism, persistence merges and migrations, combat sim (60s headless + sustained 120Hz load), the beam hull's balance model, the profiler math, and the reduced-motion contract. The same suite runs headless in CI (`tools/selftest-ci.js`) against a committed test-name baseline, so the number above is gated, not aspirational.
- `bash check.sh` + `node deadscan.js --check` locally — syntax + dead-code/load-order gates (what CI runs)
- Settings → *Render quality: Auto* lets the game tune itself to your device.

## What's new in v3.7 — hardening, honesty, fonts

- **Command Deck static allowlist:** the deck now serves exactly the game shell and nothing else — the database, source, git metadata and shell scripts all 404, enforced by a permanent smoke battery (T-LEAK) in CI
- **Honest boards:** unverified (review) runs no longer rank anywhere, including your own rank line; the smoke battery asserts an unaccepted run leaves the board empty
- **Security pass:** rate limits key on the real client IP behind proxies (`TRUST_PROXY`), password hashing moved off the event loop (async scrypt), logout cookie carries `Secure` on TLS
- **The 37-check self-test suite now gates CI headless**, with an exact-count + exact-name baseline so claims stay true
- **Brand fonts self-hosted** (Michroma + Chakra Petch, OFL) — the real identity renders on `file://` and offline
- **First-launch polish:** no changelog in front of a new player, no touch buttons over the title, dialogs that fit a phone screen
- **Economy correction:** the graze-heat multiplier now decays as documented (3s from the last graze) instead of freezing at its last value

## What's new in v3.5 – v3.6.1 — "The Living Sky & the Prism"

- **The living sky:** five rare events (comets, golden comets, graveyard fleets, relief convoys, pyres) on a shared scheduler with a tunable Sky traffic setting — alloy bonuses, career feats, a Sky log, and edge pointers so you never miss one
- **The deep sky breathes:** ring-band shear, storm swirl, creeping moon terminator, and three-plane nebula parallax — barely perceptible in the moment, unmistakable across a session; all palette-aware and frozen under reduced-motion
- **SERAPH, Prism-class:** the fifth hull and the second weapon class — a continuous cutting lance with a heat economy, piercing every hostile in its line; balance locked by suite tests
- **Cozy onboarding:** codex cards on first sight, flight school drills, dynamic difficulty easing, larger ships and touch controls, four accessibility palettes
- **Tooling era:** FPS profiler panel (Settings → Show FPS), economy simulator calibrated on real telemetry, dead-code/load-order gates, and CI that tests and publishes every release

## What's new in v3.3 — "Provenance"

- **Run provenance:** every run records checkpoint telemetry (one sample per wave/boss/heartbeat) and the server checks the aggregate for plausible progression
- **Anti-cheat engine:** rejects impossible depth, impossible score mass, impossible scoring velocity, non-monotonic tampering, malformed arcs, and 24h replays — 27/27 adversarial test battery
- **Score checks:** `accepted` runs pass aggregate plausibility checks and rank; `review` runs are stored but do not rank; rejected runs never touch the ladder. This is not an authoritative anti-cheat replay.
- **Weekly Gauntlet:** Monday-UTC seasons; your best five accepted runs of the week score the ladder, with live countdown and your rank
- **Friend duels:** send today's daily-run ghost to any pilot on the deck — a win is claimed only after the recipient finishes a higher-scoring, plausibility-checked run
- **Boards clean up:** global ladders show accepted plausibility-checked runs only

## What's new in v3.2 — "Command Deck"

- **Account system:** register/sign-in in Settings → Command deck; session persists across reloads; sign out keeps local progress
- **Worldwide boards:** new Global tab on the title screen — plausibility-checked top 10 per mode plus your own rank
- **Community runs:** every finished run posts to the deck (when signed in); accepted runs show their global rank on the game-over screen
- **Cloud saves:** alloy, hulls, refits, feats and settings follow the pilot between devices, with stale-copy protection in both directions
- **Update-proof shell:** service worker now ships updates immediately (network-first) and never caches the API

## What's new in v3.1 — "Momentum"

- **Boss Rush mode:** all four capitals back-to-back, then an endless tail at wave-20 tempo — the showcase run
- **Replay ghosts:** your best daily run records itself and races you — draft, claim, and chase your own best line
- **High-vis bullets option:** dark rim on hostile fire for bright rooms / OLED
- **Performance gate:** the 20-test self-suite now includes a sustained-load benchmark — worst-case combat must hold the 120Hz sim budget on every commit
- **Economy audited:** hull-focused pilots reach their first hull around run 7; full collection completes around runs 31–35, after which a prestige sink is still recommended

## What's new in v3.0 — "Expanded Edition"

- **Post-processing stack:** two-stage bloom, chromatic aberration on impacts, per-palette final grade
- **Dynamic light layer:** engine glow, beam/explosion illumination, boss arrival wash
- **Backdrop life:** derelict capital silhouettes drifting past, and the Gate — a rift that widens as you descend the waves
- **Ship FX:** hostile warp-ins, dash afterimages, elite auras, boss phase shockwaves
- **Cinematics:** boss intro letterbox + nameplate, wave-clear micro slow-mo, game-over zoom
- **3 new hostiles:** Ram (telegraphed charge), Sniper (laser-sight lock-on), Shieldbreaker (EMP that disables your systems)
- **4th capital ship:** the Gate Warden, deep in the endless progression
- **Boons:** after each boss, draft 1 of 3 run-long upgrades and build a build
- **Daily mutators:** every daily run has a seeded twist — Glass Cannon, Swarm Protocol, and friends
- **Audio expansion:** per-boss scoring variants, title theme, low-hull sub-drone, game-over sting, combo stingers
- **Quality of life:** FPS cap for battery, save export/import, left-handed + large touch layouts, lifetime stats

## Repository layout

```
index.html            the game: markup, CSS, inline core (sim, waves, render, UI, boot)
js/art.js             ART v3 — materials + hull/hostile/capital/pickup renderers
js/input.js           four input schemes behind one contract, bound at boot
js/audio.js           synthesised voices + adaptive score
js/sky.js             sky events — comets, fleets, convoys, pyres (single owner)
js/net.js             command-deck client: auth, cloud saves, outbox
sw.js                 offline cache (network-first, versioned cache generation)
server.js             the Command Deck: accounts, SQLite, boards, trust boundaries (zero deps)
smoke.sh              API + static-hygiene (T-LEAK) + load battery
check.sh              syntax gate (modules + inline payload)
deadscan.js           dead-code + module load-order analyzer (--check = CI gate)
tools/selftest-ci.js  headless CI runner for the in-game ?selftest suite (baselined)
tools/selftest-baseline.json  the committed suite contract: totals + exact test names
tools/selftest-probe.js  local harness: totals, failures, name list
tools/selftest-baseline.js  regenerate the baseline from a live green run
tools/econsim.js      meta-economy simulator, constants extracted from source
tools/genicons.js     PWA icon generator (hand-rolled PNG encoder)
tests/game.spec.js    Playwright browser smoke (boot, local-only assets, core flow)
docs/economy-audit.md economy tuning report, calibrated on real telemetry
docs/performance.md   measured CPU/GPU baseline + method
fonts/                self-hosted brand fonts (Michroma, Chakra Petch — SIL OFL 1.1)
```

`emberfall.html` is a pristine v2.0 backup of the original file, kept for provenance.
