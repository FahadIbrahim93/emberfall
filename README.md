# EMBERFALL v3.6.1 — Orbital Intercept

[![CI](https://github.com/FahadIbrahim93/emberfall/actions/workflows/ci.yml/badge.svg)](https://github.com/FahadIbrahim93/emberfall/actions/workflows/ci.yml)
[![Play live](https://img.shields.io/website?url=https%3A%2F%2Ffahadibrahim93.github.io%2Femberfall%2F&label=play%20live)](https://fahadibrahim93.github.io/emberfall/)

A single-file, zero-dependency orbital intercept shooter. Everything — art, music, sound — is generated procedurally at runtime. No build step, no assets to download, no network needed after first paint.

## Play

- **Any device, right now:** play the deployed build at **https://fahadibrahim93.github.io/emberfall/** — or open `index.html` in any modern browser. Chrome, Edge, Firefox, Safari, desktop or phone.
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
account system, cloud saves, and server-verified global leaderboards — with
**zero npm dependencies** (Node ≥ 22, built-in SQLite):

```bash
node server.js            # http://localhost:8123 — serves game + API
bash smoke.sh             # 36-test API + client-payload battery, all green
```

- **Auth:** callsign + password, scrypt-hashed, per-user salt, constant-time compare
- **Sessions:** 32-byte tokens, only SHA-256 stored, HttpOnly SameSite cookies, 30-day expiry
- **Hardened:** same-origin JSON guard, per-IP/user rate limits, input caps, parameterized SQL, security headers + CSP
- **Cloud saves:** meta progression + settings sync across devices via last-write-wins merge with server convergence
- **Leaderboards:** top 10 per mode (endless / daily / boss rush), per-user best, global rank on every finished run
- **Deployment:** one process, one origin — any Node host (Fly.io, Railway, a VPS, `node server.js` behind nginx). The SQLite file is the whole database.

When no server is present the client probes `/api/health` once, fails silently,
and stays 100% local — the exact same game, stored in the browser.

## Verification

Every push runs the gates on GitHub Actions (badge above); the live-smoke job additionally asserts the published site is byte-identical to the merged commit.

- Open [`index.html?selftest`](https://fahadibrahim93.github.io/emberfall/index.html?selftest) — the built-in suite runs in a panel (bottom right): **33 tests, all PASS**. It covers math/RNG, persistence merges and migrations, combat sim (60s headless + sustained 120Hz load), the beam hull's balance model, the profiler math, and the reduced-motion contract.
- `bash check.sh` + `node deadscan.js --check` locally — syntax + dead-code/load-order gates (what CI runs)
- Settings → *Render quality: Auto* lets the game tune itself to your device.

## What's new in v3.5 – v3.6.1 — "The Living Sky & the Prism"

- **The living sky:** five rare events (comets, golden comets, graveyard fleets, relief convoys, pyres) on a shared scheduler with a tunable Sky traffic setting — alloy bonuses, career feats, a Sky log, and edge pointers so you never miss one
- **The deep sky breathes:** ring-band shear, storm swirl, creeping moon terminator, and three-plane nebula parallax — barely perceptible in the moment, unmistakable across a session; all palette-aware and frozen under reduced-motion
- **SERAPH, Prism-class:** the second weapon class — a continuous cutting lance with a heat economy, piercing every hostile in its line; balance locked by suite tests
- **Cozy onboarding:** codex cards on first sight, flight school drills, dynamic difficulty easing, larger ships and touch controls, four accessibility palettes
- **Tooling era:** FPS profiler panel (Settings → Show FPS), economy simulator calibrated on real telemetry, dead-code/load-order gates, and CI that tests and publishes every release

## What's new in v3.3 — "Provenance"

- **Run provenance:** every run records checkpoint telemetry (one honest sample per wave/boss/heartbeat) and the server verifies the arc before trusting the score
- **Anti-cheat engine:** rejects impossible depth, impossible score mass, impossible scoring velocity, non-monotonic tampering, malformed arcs, and 24h replays — 27/27 adversarial test battery
- **Graduated verdicts:** `verified` ranks; `flagged` (marginal) is stored pending review; rejected runs never touch the ladder
- **Weekly Gauntlet:** Monday-UTC seasons; your best five verified runs of the week score the ladder, with live countdown and your rank
- **Friend duels:** send today's daily-run ghost to any pilot on the deck — they race your crimson phantom, and beating it is confirmed server-side
- **Boards clean up:** global ladders now show verified runs only

## What's new in v3.2 — "Command Deck"

- **Account system:** register/sign-in in Settings → Command deck; session persists across reloads; sign out keeps local progress
- **Worldwide boards:** new Global tab on the title screen — server-verified top 10 per mode plus your own rank
- **Verified runs:** every finished run posts to the deck (when signed in) and shows its global rank on the game-over screen
- **Cloud saves:** alloy, hulls, refits, feats and settings follow the pilot between devices, with stale-copy protection in both directions
- **Update-proof shell:** service worker now ships updates immediately (network-first) and never caches the API

## What's new in v3.1 — "Momentum"

- **Boss Rush mode:** all four capitals back-to-back, then an endless tail at wave-20 tempo — the showcase run
- **Replay ghosts:** your best daily run records itself and races you — draft, claim, and chase your own best line
- **High-vis bullets option:** dark rim on hostile fire for bright rooms / OLED — verified on the non-bloom render path
- **Performance gate:** the 20-test self-suite now includes a sustained-load benchmark — worst-case combat must hold the 120Hz sim budget on every commit
- **Economy audited:** simulated new-player meta progression (first hull ~run 5, full completion as a long-tail goal) — no tuning needed

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
server.js             the Command Deck: accounts, SQLite, boards, anti-cheat (zero deps)
smoke.sh              36-test API + client-payload battery
check.sh              syntax gate (modules + inline payload)
deadscan.js           dead-code + module load-order analyzer (--check = CI gate)
tools/econsim.js      meta-economy simulator, constants extracted from source
tools/genicons.js     PWA icon generator (hand-rolled PNG encoder)
docs/economy-audit.md economy tuning report, calibrated on real telemetry
```

`emberfall.html` is a pristine v2.0 backup of the original file, kept for provenance.
