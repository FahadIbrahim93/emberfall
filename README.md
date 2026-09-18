# EMBERFALL v3.4 — Orbital Intercept

A zero-build, static orbital intercept shooter. Art, music, and sound are generated procedurally at runtime. The game has no runtime package dependencies and plays locally from `index.html`; hosted installs work offline after their first successful service-worker install.

## Play

- **Local play:** open `index.html` in a modern browser. For offline PWA installation, serve the folder once over HTTP(S) so the service worker can cache the shell.
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
bash smoke.sh             # 17 API tests, all green
```

- **Auth:** callsign + password, scrypt-hashed, per-user salt, constant-time compare
- **Sessions:** 32-byte tokens, only SHA-256 stored, HttpOnly SameSite cookies, 30-day expiry
- **Hardened:** same-origin JSON guard, per-IP/user rate limits, input caps, parameterized SQL, security headers + CSP; production requires HTTPS
- **Cloud saves:** meta progression + settings sync across devices via last-write-wins merge with server convergence
- **Leaderboards:** top 10 per mode (endless / daily / boss rush), per-user best, and a plausibility-checked community rank
- **Deployment:** one process, one origin — place production behind HTTPS (for example nginx with `NODE_ENV=production TRUST_PROXY=1`). Back up `data/emberfall.db` and its WAL files. The SQLite file is the database.

When no server is present the client probes `/api/health` once, fails silently,
and stays 100% local — the exact same game, stored in the browser.

## Verification

- Open `index.html?selftest` — the built-in test suite runs and reports in a panel (bottom right). Everything should read **PASS**.
- Settings → *Render quality: Auto* lets the game tune itself to your device.

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
- **High-vis bullets option:** dark rim on hostile fire for bright rooms / OLED — verified on the non-bloom render path
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

- `index.html` — page, UI, styles, and game core (loaded with `js/*.js` support modules)
- `sw.js` — offline cache for hosted installs
- `check.sh` — dev harness: extracts the script and runs `node --check`
- `emberfall.html` (optional) — pristine v2.0 backup of the original file
