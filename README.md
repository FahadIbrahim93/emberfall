# EMBERFALL v3.1 — Orbital Intercept

A single-file, zero-dependency orbital intercept shooter. Everything — art, music, sound — is generated procedurally at runtime. No build step, no assets to download, no network needed after first paint.

## Play

- **Any device, right now:** open `index.html` in any modern browser. That's it. Chrome, Edge, Firefox, Safari, desktop or phone.
- **Keyboard:** `WASD`/arrows fly · `Space` fire · `Shift` dash · `E` pulse · `P` pause · `M` mute · `F` fullscreen
- **Touch:** drag anywhere to fly (fires for you); DASH / PULSE buttons bottom-right
- **Gamepad:** sticks/buttons auto-detected

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

## Verification

- Open `index.html?selftest` — the built-in test suite runs and reports in a panel (bottom right). Everything should read **PASS**.
- Settings → *Render quality: Auto* lets the game tune itself to your device.

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

- `index.html` — the entire game
- `sw.js` — offline cache for hosted installs
- `check.sh` — dev harness: extracts the script and runs `node --check`
- `emberfall.html` (optional) — pristine v2.0 backup of the original file
