# Changelog

Notable changes to EMBERFALL. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Sign-in
- Email code flow: 6-digit one-time-code input (auto-verifies), "Code sent to … · Change", Resend with a 60 s cooldown, plain-language errors for rate limits, unconfirmed email, wrong password, expired code and offline. A pending code survives reload for 15 min. Verify falls back to the signup token type, so new users' confirmation codes work too. Unconfirmed password sign-in resends the code automatically.

### Mobile UX
- Phone title fits one screen (360–412 px): profile chip top-left, Boards/What's new/Settings icons top-right, logo scales with clamp(), mode grid, one large Launch in the thumb zone. No horizontal overflow.
- Touch HUD: Dash bottom-right (76 px) with a cooldown ring and charge badge, Bomb diagonal with a count badge, pressed states, safe-area insets, mirrored in lefty mode, timer moved off the play area. Desktop is unchanged.
- SW cache v4.54. Spec: docs/specs/mobile-ux-v2.md.

### Security
- CSP: `connect-src` limited to the Supabase project (was any `https:`); unused Google Identity script/style/frame sources removed; `frame-src 'none'`, `worker-src`/`manifest-src 'self'` added. Google sign-in is a redirect and is unaffected.
- `npm audit fix`: dev dependency `source-map-js` advisory resolved.

### Fixed
- Arcade: Reset progress and Donate to the yard ask with an in-game confirm. Framed players block `confirm()`, so those buttons did nothing on the Bounty Board. SW cache `emberfall-v4.55`.
- Accessibility: pinch-zoom is no longer disabled (`user-scalable=no`, `maximum-scale=1` removed; axe `meta-viewport`). Menus use `touch-action:manipulation` so fast taps don't zoom.
- Service worker: removed a dead `/api/` bypass left from the old server; cache `emberfall-v4.53`.

### Docs / tooling
- Accounts v2 spec marked shipped (v4.29.0). Dependabot config for npm and GitHub Actions. Dead GSI rewrite removed from `tools/build-portal.sh`.

## [4.29.0] — 2026-10-23 "Pilot Card"

### Fixed
- Phones: the title screen could not scroll (`#s-title{overflow:hidden}` beat `.screen{overflow-y:auto}`), so the account panel and boards below the menu were unreachable unless "desktop site" was on.
- Returning visitors could run old `js/*.js` against a new `index.html`: scripts are now network-first in the service worker.

### Added
- Title pilot chip (avatar, callsign or "Guest · Sign in") and a Boards button, above Launch.
- Passwordless sign-in: an email with a magic link and a code (`signInWithOtp` / `verifyOtp`); password sign-in kept under "Use a password instead".
- Google sign-in button, hidden until the provider is enabled in Supabase.
- Profile: ship-icon avatar (`set_avatar`, `20261023000300_profile_avatar.sql`), all-time best, rank, today's best, runs posted.
- Guest best carried to the board once on the first callsign save.
- Daily / All-time board tabs, avatars on rows, and a pinned "your rank" row.
- Mobile: 44 px targets, 16 px inputs, safe-area padding, inputs scroll clear of the keyboard.

### Changed (menu polish)
- Sign-in, profile and boards open in one modal sheet (bottom sheet on phones, centered dialog on tablet/desktop) with a close button, Esc, scrim tap and a focus trap; the Global tab keeps the same content.
- One button system (primary / secondary / ghost / destructive) with hover, focus, active, disabled and busy states; inset focus rings that survive the clipped corners; 44 px minimum targets.
- Spacing and type tokens; labelled form fields; profile stats as four tiles; boards as an aligned table (rank, pilot, score, wave) with tabular numbers, thousands separators, loading skeleton, empty and error states.
- Service worker cache `emberfall-v4.52`.

## [4.28.0] — 2026-10-23 "Guest Pass"

### Added
- Play as a guest with no account. Guest runs save on the device, and the game-over screen offers "Sign up to post this score".
- Email and password accounts, with email confirmation when the project requires it. A new account picks its callsign on first sign-in.
- A title-screen account strip showing whether you're a guest or signed in.

### Changed
- The worldwide boards list registered pilots only. `set_callsign` and `submit_score` refuse anonymous sessions, and the public views hide rows owned by anonymous users (`20261023000200_registered_only_boards.sql`).
- Sign-in no longer uses email magic links or anonymous guest sign-in.

### Removed
- The dormant command-deck client: the settings account panel (deck address, deck sign-in, Google sign-in, account management, save vault), the LAN play panel, the game-over feedback box and duel send, the deck season and duel boards, and the remote-deck code in `js/net.js` (address handling, health probe, deck requests, cloud-save merge, score outbox, funnel pings). `js/net.js` now only renders the Global tab from the public views. The in-game self-test drops the 14 checks that covered that code (63 remain).


### Added
- Worldwide accounts and boards on Supabase (project `rgmbexmodebegllahotc`): guest or email sign-in, a callsign, runs posted through the `submit_score` RPC, and Global/Daily boards read live. Local scores, offline play and portal builds are unchanged.

- Player accounts with callsigns and global and daily leaderboards, live on https://emberfall-game-two.vercel.app (#25). Writes go only through `submit_score` and `set_callsign`, with RLS on, bounds checks and rate limits. `deck_stats` is now a live view.

### Changed
- Docs now describe Supabase as the source of truth for accounts and boards (ADR 0004, superseding ADR 0001). The Fly Command Deck was never deployed; its docs are marked historical.
- Rewrote the repo copy in a plainer voice (#24).

### Removed
- The self-hosted command deck (ADR 0005): `server.js`, `fly.toml`, `Dockerfile`, `.dockerignore`, `deck.json`, `ops.html`, `smoke.sh`, the deck-only tools (`deck-deploy`, `db-backup`, the 15 `drill-*` scripts, `live-guard`, `parity-daily`, `audit-sql-bindings`, `feedback-report`, `monday-digest`, `profile-deck`, `testpilot-report`, `selftest-probe`), the deck specs, the Wardenfall deck runbook, and the deck boot, smoke, drill, TRUST_PROXY, port-drill and Docker image CI steps. The browser suite now runs on `tools/serve-static.mjs`; the game no longer fetches `deck.json` or probes `/api/health`.

### Fixed
- Upper-screen flash from film grain and chroma split (#21).
- Restored the deadscan CI gate (#23).

### Security
- Sanitized pilot deck links and locked down schema PII (#19); hardened mirror queries and the pilot page (#22).

### Housekeeping
- Repo hygiene: license section, PR template, security reporting link (#20).

### Removed
- `tools/db-sync.mjs`, `tools/mirror-schema.sql` and the hourly Mirror stats workflow (they targeted the retired mirror project `bhcczyyhadornihhzpsu`, which is no longer used).

### Coming soon
- Sign in with X (provider `x`), open as #26 and not merged yet.

## Earlier in October

- Boards, pilot profiles and the public mirror were changed to show the same best run (#14). That work targeted the Command Deck, which was never deployed.

## 2026-10-19

### Fixed
- Portal build fails loudly when `dist-portal.zip` is not created, with a python3 fallback when `zip` is missing (#13).

### Added
- Portal-mode build for web game portals: `npm run build:portal` writes `dist-portal.zip`. Enabled by `window.EMBERFALL_PORTAL` or `?portal=1` (#11).

### Security
- Pinned framed decks, closed the notes read, hardened the Vercel mirror (#10).

## Earlier releases

These notes used to live in the README. They're kept here as written at the time.

### v4.26.0 — "The Open Gate"

- Sign in with Google — the deck verifies the ID token itself and mints its own session, so a Gmail pilot is the same pilot on the same boards, with callsign linking for classic accounts.
### v4.25.0 — "The Listening Deck"

- one-line pilot notes on the game-over screen (anon-friendly, offline-queued, capped 5/h), PII-free funnel instrumentation (boot-armed-k1-w5, salted daily device hash), ops.html funnel+notes cards, feedback-report and monday-digest tools - and the probe() stale-false race fix the flush test flushed out
### v4.24.0 — "Signal"

- the fun curve renders on the recruiting page (marker-maintained, CI-checked); playtest feedback becomes a structured issue form asking the exact four questions; the deck gets ops.html - a noindex operator cockpit over health census, the live-ledger fence, limiter telemetry and the Wardenfall honor total
### v4.23.1 — "The Fence"

- live-ledger fence: EF_LIVE_LEDGER=1 decks report live:true in health and smoke, all 13 drills, and the browser suite REFUSE them - the battery never writes to production (born of the 2026-09-27 incident: a release battery seeded 5 machine pilots into the live Wardenfall deck; purged)
### v4.23.0 — "Glasscockpit"

- Ops gets a glasscockpit: /api/health now carries per-bucket 429 telemetry with no PII so limiter regressions show in ops instead of hiding in logs, the replay drill grew a ways-matrix proving the anti-cheat window honest across modes, perturbed telemetry shapes and per-hash windows, the game and the recruiting page preview properly wherever they are shared, and Fly.io deployment became a five-minute checklist with a committed fly.toml.
### v4.22.2 — "Open Surfaces"

- The surface audit closes the input-accessibility class everywhere: the playfield canvas now announces itself with the flight controls to assistive tech, the settings dialog traps Tab focus when opened from the title, and the action keys stay quiet behind modal screens — Enter on a settings switch no longer also launches a run.
### v4.22.1 — "The Recruiting Page"

- The playtest recruiting kit becomes a live, linkable page: an itch-style press one-pager with the hero shot, the wave-1 GIF, the CI-measured facts and the four playtest questions, deployed with the site and verified by the live-smoke job — send one link, recruit the first ten.
### v4.22.0 — "The World Stage"

- The global leaderboard actually works now: the deck learns a CORS allowlist and issues bearer sessions so the Pages game can sign up, sign in, climb the live boards and duel across origins, every pilot name links to a /pilot profile page, boards page past the top ten, and a deck-address field in settings aims any copy of the game at any deck.
### v4.21.2 — "Always Reachable"

- The DASH and PULSE buttons are now reachable on every device: hybrid pointer setups (touch second, mouse primary) get the touch controls via any-pointer detection with a first-touch upgrade as backstop, and the buttons answer Enter and Space for keyboard and screen-reader pilots with a guard so a real tap never double-spends a pulse; the roadmap also gains the container deployment path — the proven docker guarantees and the three gaps to a real rollout.
### v4.21.1 — "The Curve"

- **The touch controls are always reachable** — v4.21.1 removed the never-unhidden `hidden` attribute so DASH/PULSE could exist at all; v4.21.2 finishes the job: hybrid devices (touch as a *secondary* pointer — touch monitors, convertibles) now get the buttons via `any-pointer` detection, a first-touch upgrade catches whatever detection still misses, and the buttons answer Enter/Space so keyboard and screen-reader pilots can fire them, with a 700ms guard so a real tap never double-spends a pulse. Pinned by `tests/touch-buttons.spec.js`.
- **The fun curve ships** — every release now leaves one measured row (bot wave depth, kills, grazes, median fps) in a committed scoreboard, rendered as a README trend table, recorded by CI after the browser suite flies each new version, and gated so the table can never drift from the data.
### v4.21.0 — "Proof of Play"

- An autopilot bot now proves the core loop THROUGH PLAY (wave 3, 28 kills, grazes, combo x2 — pinned in CI), a fresh pilot is taught the striker at first sight, the press kit ships with a real wave-1 GIF, /api/health exposes a pilot census, and the battery refuses to touch a ledger that is not a scratch deck.
### v4.20.0 — "First Contact"

- Wave 1 fights back (first shooter at ~6s), the title shows your hull breathing on its pad, the blink-flanker Wisp joins wave 16+, a nine-lane tier-7 capstone weapon lands, and a new instrumented audit plays the game and pins the first-60-seconds contract.
### v4.19.1 — "The probe-able deck"

- Production mode keeps /api/health answerable over plain HTTP (it leaks nothing); every real endpoint still 426s without TLS, and the container deck proves it in CI — bare probe, prod 426, named-volume persistence, non-root.
### v4.19.0 — "Gates in the build"

- The replay window is drilled; the deck ships as a container whose build IS the battery; the world stats page is one click from the mirror.
### v4.18.0 — "The world, even offline"

- Deckless players now see the worldwide leaderboard — the Global tab falls back to the read-only public mirror with the world's publishable key, and the deck-linked boards render again after a shipped ReferenceError left them blank for anyone with ranked runs; account self-management is UI-proven end to end, /api/stats is rate-limited, and the deck database earns a daily verified backup.
### v4.17.1 — "The world page"

- stats.html puts the global leaderboard and gauntlet history on the open web — reading the locked public mirror with the world's key, styled to the game, failing gracefully when the mirror sleeps; the game's CSP now allows the mirror origin on that one page and nothing else.
### v4.17.0 — "The mirror"

- The deck's SQLite stays the only authoritative store, and a read-only Supabase mirror now publishes the public facts — callsigns, accepted scores, gauntlet days, lifetime totals — with row-level security letting the world read and no one write; tools/db-sync.mjs pumps it keylessly or by operator key, the deck answers /api/stats straight from the source, and no gameplay path ever touches the cloud.
### v4.16.0 — "Own your ledger"

- Accounts can now change their password, list their sessions, and delete themselves outright — one CASCADE transaction evicts every board entry and the callsign is retired forever — while the save vault actually holds six snapshots again (the old prune threw silently; rebuilt and drilled).
### v4.15.3 — "Pinned boots stay pinned"

- **Port resolution with intent** — an explicit `--port` flag now outranks an ambient `PORT` variable (previously `Number(env.PORT || flag) || 8123` let a stray shell export — this worktree's had `PORT=0` — silently hijack a pinned boot onto the default port). Values that don't parse to an integer 1–65535 exit with a loud error instead of silently falling back, and an occupied port fails with one honest line instead of a stack trace.
- **`tools/drill-port.mjs`** (CI step) — seven checks pin the whole contract: the flag beats a poisoned ambient `PORT`, `PORT` is honored without a flag, the 8123 default (proven two-world: on a free port it boots and answers, on a busy one the child must die on `EADDRINUSE` — never squat elsewhere), `PORT=0` without a flag exits loudly (the old chain silently defaulted), garbage flag/env values exit 1, and the boot log announces the port it actually took.

### v4.15.2 — "The deck remembers"

- **Sign-ins already survived restarts — now it's proven** — sessions are SQLite-backed (SHA-256 token hash, HttpOnly cookie), and `tools/drill-sessions.mjs` (CI step) proves the contract the hard way: SIGKILL the deck, reboot on the same ledger, and the same cookie still authenticates with the pilot's data intact. The actual gap was the opposite of lost logins: expired session rows were only removed lazily (when that exact dead token was presented again), so rows accumulated forever.
- **Session hygiene** — expired rows are now swept at boot and daily; live sessions are untouched (only `expires < now` is deleted), and explicit logout still ends the session immediately. All three behaviors pinned by the drill (13 checks).

### v4.15.1 — "Dead ghosts never pile up"

- **Duel ghost retention** — a duel is only flyable on its own day ("today's run only" is the create-time rule), so the deck now prunes challenges older than the retention window (7 days default, `EF_DUEL_RETENTION_DAYS`-tunable, floored at 1) at boot and every six hours — ghost payloads and their beats (by cascade) go with them. The cutoff derives from the same day-clock as the gauntlet, so a rehearsal deck prunes on its pinned day too.
- **One day-clock for duels** — the retention drill caught duels reading a third, private day derivation (`utcToday()` with `new Date()`) that ignored the rehearsal clock entirely; create, inbox and retention now read the same `deckDayOf` clock. On a pinned deck, a duel for the pinned day is accepted *and served* — proven in the drill, and the SQL-binding scanner still finds every day binding string-proven.
- **`tools/drill-retention.mjs`** (CI step) — four sequential deck boots on one data dir: the 10-day-old duel pruned at boot, the 2-day-old kept, the pinned cutoff followed (09-27 prunes 09-18), the strictly-`<` boundary honored (09-25 keeps 09-18), the env window honored (14d keeps both), and the pinned-day duel coherent end to end.

### v4.15 — "The rehearsal clock"

- **Rehearse the rare Sunday before it arrives** — `EF_DECK_DAY=YYYY-MM-DD` pins the deck's *day* (and nothing else) for live-fire drills: the daily gauntlet day, the medal window and the Wardenfall verdict become rehearsal-able on any calendar day. Deliberately narrow: sessions, rate limits, replay windows and board seasons stay on the honest wall clock, and the boot log announces a pinned deck loudly.
- **The honor loop, proven on the day itself** — `tools/drill-rare-sunday.mjs` (CI step) boots a pinned scratch deck on the deck's next real rare Sunday (2026-09-27) and flies the whole loop: an honest wave-16 run earns the Wardenfall medal with `wardenfall: 1` and the pinned day in the ledger, `/api/me` answers the lifetime count, a same-day repeat cannot inflate it, a wave-15 pilot on the same day is refused — and `/api/health`'s epoch proves the override never moved real time.

### v4.14 — "The day of the fall"

- **The rare day announces itself** — the countdown read the rare Sunday itself as "the next window is Nd away": on the one day the call-to-action matters most, the UI pointed *past* the live boss. The countdown now reads **0** on the rare day, the Daily tile says **WARDENFALL IS UP**, and the guide says "Wardenfall is up today" — pinned by a selftest that walks the seed to the next rare day and re-renders on it, and by a new parity-gate display contract checked across all 74 rare Sundays in the 2,922-day sweep.
- **The ledger travels, rehearsed end-to-end (v4.14.1)** — a two-device browser spec registers through the real account panel, seeds a felled fall into the deck ledger (day stamped from the deck's own clock), then signs in on a fresh profile: the plaque and the feat arrive with no run flown. The E2E caught the `/api/me` adoption path skipping the feat mint — fixed; the honor mints at every adoption point.
- **The deck's self-defense, executable** — `tools/drill-limiters.mjs` boots its own scratch deck and proves every rate-limit bucket honestly answers 429 at its budget (register 10, login 15, score 20, challenge 12, beat 12) with telemetry-backed probes so nothing 429s for the wrong reason. Until now the limiters were proven only by accident — a smoke burst and a drill stumbling into a 429. A CI step on every push.

### v4.13 — "The fall, felled"

- **The WARDENFALL plaque** — fell the rare Sunday boss and the honor becomes a possession: a deck-verified feat (`The fall, felled`), a lifetime `wardenfalls` count in the deck's ledger, and a gold sigil-crest plaque on the dock (one ✦ per fall, `×N` past five). No client claim can mint it — the deck derives the rare verdict itself and only an accepted daily run can carry it.
- **Monotonic adoption, cross-device** — the count rides the same contract as the alloy watermark: `/api/me` answers `wardenfalls` at sign-in (fresh devices learn their history), the daily submit response carries both the per-run flag and the deck's lifetime count (v4.13.1 — same-day reconciliation), and both adoption paths only ever rise.
- **Same-day reconciliation (v4.13.1)** — the daily submit response carries the deck's *lifetime* `wardenfalls` count beside the per-run flag, so two falls on two rare Sundays read honestly everywhere the same day — no `/api/me` pass needed.
- **Proven live on a scratch deck** — an honest wave-16 daily run on a plain Wednesday answered `wardenfall: 0`, a felled fall seeded into the ledger flipped `/api/me` to `wardenfalls: 1`, and 71 self-tests pin the feat's mode-gating, mint-once adoption and plaque contract.

### v4.12 — "The gates that watch the gates"

- **Executable SQL-binding audit** (`tools/audit-sql-bindings.js`, in CI) — the trap class behind the v4.11.1 week-window bug (epoch-ms bound against TEXT `created_day`) is now scanner-guarded across all 47 prepared statements. Mutation-verified: it fails on the pre-fix server.
- **Permanent parity gate** (`tools/parity-daily.js`, in CI) — the client's medal *display* and the deck's medal *authorization* are cross-extracted from source on every push: 2,922 days of rare-Sunday verdict agreement, a 900-check medal grid with cross-summed payouts, and the wave-2 anti-cheat pin (a score shortcut can never pay an un-felled Wardenfall). Mutation-verified with a drifted tier.
- **The guide renders itself** — the in-game Daily Gauntlet card is derived live from `DAILY_MEDALS`/`DAILY_TEMPO` (mutation-pinned: edit a table, the text follows), and the Daily tile walks the seed forward for a **Wardenfall horizon** — "in Nd" — with an honest 56-day cap where silence is the answer.
- **Live-fire drill #2: the duels week — now a CI step** — the full challenge loop flown against a running deck: create → inbox → ghost ownership → beat → idempotence → ownership refusals. Proven green on a scratch deck (24/24) and promoted to `tools/drill-duels.mjs`, replayed on every push by the smoke job (the drill's session budget stays inside the limiter window by construction; verified idempotent on rerun).

### v4.5 – v4.11 — "The pilot's ledger & the shared sky"

- **v4.11 — rare Sundays & the flawless week:** one Sunday in seven (drawn from the shared day key) wakes **Wardenfall**, the Gate Warden's corrupted sibling — four faster shield arcs, denser spikes, a twin-beam surge — worth its own wave-16 medal of 1,000 alloy, authorized by the deck's own derivation of the day. Fly a flawless Gauntlet week (accepted runs, seven UTC days) and the **FLAWLESS SEASON** feat lands with a dock plaque in Roman numerals. Rare-tier anti-cheat is structural: wave-gated only, so the kill is provable from the run itself — parity proven across 2,922 days of client/deck agreement.

- **v4.5 — the yard gives back:** irreversible alloy→honor donations at three tiers (Patron / Shipwright / Yardmaster) paying pure cosmetics — dock plate, gold ✦ board sigil, engraved title; the balance sim reaches 60 tests with golden parity for the boss statlines and the full Solar Tour registry; dock breathing and cloudbank drift honor reduced-motion; the paint wardrobe is pinned to measured CIE76 ΔE floors under protan/deutan/tritan (Machado 2009 matrices).
- **v4.6 — nothing earned is ever lost again:** the save vault (six rolling deck-side snapshots per account, inline restore), a build stub-guard that would have caught the placeholder-page incident in seconds, deterministic golden replays and type-specific foe AI in the mirror, and live SQLite backup tooling with verification.
- **v4.7 — the Daily goes worldwide:** one shared, day-scoped board for the seeded Daily Gauntlet (UTC days, server-windowed queries, today's fleet only) plus a once-a-day vault restore offer when the deck remembers a richer save than this device.
- **v4.8 — the week has a shape:** the Daily's tempo tightens Monday→Sunday with weekend score pay (Eclipse Sunday 1.40×), three once-per-tier-per-day medals from the deck's ledger (Crest / Crown / Eclipse), day streaks with the best kept forever, and the faucet audited in the economy model.
- **v4.9 — devotion, decorated:** streak feats at 7/14/30 days gifting two colorblind-verified laurel paints, Eclipse Sundays with an elite honor guard and the day-gated Solar Guard medal, a one-time in-game guide to the Gauntlet's contract, and a deck busy_timeout proven against foreign write locks.
- **v4.10 — the ledger on the board:** medal pips on the Daily day board read from the deck's ledger (two runs pool their honors), a weekly recap on the you-row (streak, flew days, the next laurel's horizon), and a reproducible deck query profiler — every board query measured sub-millisecond at 20× real scale.

### v4.0 – v4.4 — "Worlds that fight back & the pilot's hangar"

- **v4.0 — hazards & new hostiles:** six environmental systems (gravity wells, ion storms, cryofield, ring haze, flare tides, sulfur clouds) and six hostile classes with real verbs — pack telepathy, mortar arcs that burst into shrapnel, ally mending, rotating fire fans, honest rail telegraphs, and your own shadow mirrored back at you.
- **v4.1 — the dock:** your hull at 7× on a breathing pad, refit hot-spots pinned to the schematic, a paint shop, the tour wall, and a zero-stakes test range.
- **v4.2 – v4.3 — power priced in weakness:** the sigil bay (five sigils, each stating its price), hull mastery with tested awards, paints on local + worldwide boards and on rival ghosts, kill plaques earned per hull, duel entries in their challenger's colors.
- **v4.4 — the ledger closes:** eight new feats across tour, hazards, sigils, mastery, plaques and the wardrobe; economy audit updated with the extracted sink tables (`docs/economy-audit.md` §6); backdrop bakes are now keyed, so same-sky wave starts cost zero (measured 3.65 ms per avoided bake).

### v3.7 — hardening, honesty, fonts

- **Command Deck static allowlist:** the deck now serves exactly the game shell and nothing else — the database, source, git metadata and shell scripts all 404, enforced by a permanent smoke battery (T-LEAK) in CI
- **Honest boards:** unverified (review) runs no longer rank anywhere, including your own rank line; the smoke battery asserts an unaccepted run leaves the board empty
- **Security pass:** rate limits key on the real client IP behind proxies (`TRUST_PROXY`), password hashing moved off the event loop (async scrypt), logout cookie carries `Secure` on TLS
- **The 37-check self-test suite now gates CI headless**, with an exact-count + exact-name baseline so claims stay true
- **Brand fonts self-hosted** (Michroma + Chakra Petch, OFL) — the real identity renders on `file://` and offline
- **First-launch polish:** no changelog in front of a new player, no touch buttons over the title, dialogs that fit a phone screen
- **Economy correction:** the graze-heat multiplier now decays as documented (3s from the last graze) instead of freezing at its last value

### v3.5 – v3.6.1 — "The Living Sky & the Prism"

- **The living sky:** five rare events (comets, golden comets, graveyard fleets, relief convoys, pyres) on a shared scheduler with a tunable Sky traffic setting — alloy bonuses, career feats, a Sky log, and edge pointers so you never miss one
- **The deep sky breathes:** ring-band shear, storm swirl, creeping moon terminator, and three-plane nebula parallax — barely perceptible in the moment, unmistakable across a session; all palette-aware and frozen under reduced-motion
- **SERAPH, Prism-class:** the fifth hull and the second weapon class — a continuous cutting lance with a heat economy, piercing every hostile in its line; balance locked by suite tests
- **Cozy onboarding:** codex cards on first sight, flight school drills, dynamic difficulty easing, larger ships and touch controls, four accessibility palettes
- **Tooling era:** FPS profiler panel (Settings → Show FPS), economy simulator calibrated on real telemetry, dead-code/load-order gates, and CI that tests and publishes every release

### v3.3 — "Provenance"

- **Run provenance:** every run records checkpoint telemetry (one sample per wave/boss/heartbeat) and the server checks the aggregate for plausible progression
- **Anti-cheat engine:** rejects impossible depth, impossible score mass, impossible scoring velocity, non-monotonic tampering, malformed arcs, and 24h replays — 27/27 adversarial test battery
- **Score checks:** `accepted` runs pass aggregate plausibility checks and rank; `review` runs are stored but do not rank; rejected runs never touch the ladder. This is not an authoritative anti-cheat replay.
- **Weekly Gauntlet:** Monday-UTC seasons; your best five accepted runs of the week score the ladder, with live countdown and your rank
- **Friend duels:** send today's daily-run ghost to any pilot on the deck — a win is claimed only after the recipient finishes a higher-scoring, plausibility-checked run
- **Boards clean up:** global ladders show accepted plausibility-checked runs only

### v3.2 — "Command Deck"

- **Account system:** register/sign-in in Settings → Command deck; session persists across reloads; sign out keeps local progress
- **Worldwide boards:** new Global tab on the title screen — plausibility-checked top 10 per mode plus your own rank
- **Community runs:** every finished run posts to the deck (when signed in); accepted runs show their global rank on the game-over screen
- **Cloud saves:** alloy, hulls, refits, feats and settings follow the pilot between devices, with stale-copy protection in both directions
- **Update-proof shell:** service worker now ships updates immediately (network-first) and never caches the API

### v3.9 — "Solar Tour"

- **Solar Tour mode:** eight worlds, Mercury to the Kuiper Gate, in one hull — checkpoints bank alloy as you clear each world, death pays for ground held, sealing the Gate is the clear
- **A different sky every world:** endless and daily runs tour the solar system too — seeded world rotation every five waves, per-world tinted hostiles and rebuilt skies (storms, rings, craters, city lights); accessibility palettes keep their opposition, halving the tint
- **Selftest suite grows to 44**, including registry invariants, tint-vs-palette opposition checks and pure tour-settle math

### v3.1 — "Momentum"

- **Boss Rush mode:** all four capitals back-to-back, then an endless tail at wave-20 tempo — the showcase run
- **Replay ghosts:** your best daily run records itself and races you — draft, claim, and chase your own best line
- **High-vis bullets option:** dark rim on hostile fire for bright rooms / OLED
- **Performance gate:** the 20-test self-suite now includes a sustained-load benchmark — worst-case combat must hold the 120Hz sim budget on every commit
- **Economy audited:** hull-focused pilots reach their first hull around run 7; full collection completes around runs 31–35, after which a prestige sink is still recommended

### v3.0 — "Expanded Edition"

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
