# EMBERFALL — press kit / playtest recruiting kit

*Everything here is measured, not promised: the numbers come from the
repo's own instrumented play (`tests/fun-audit.spec.js`,
`tests/fun-loop.spec.js`, artifacts in `docs/audit/`).*

## The pitch

**EMBERFALL** is a free, zero-install browser shoot-'em-up. Something came
through the Kuiper gate and it has not stopped since — you are the last
hull between it and the orbital yard. Five ships, four modes, 21 hostile
types across eight worlds, a combo/graze scoring system that pays you for
flying *close* to the fire, and a global leaderboard that works even when
the server doesn't.

Play: **https://fahadibrahim93.github.io/emberfall/** — click Launch, that's
the whole tutorial.

## Measured facts (v4.20.0, CI-verified)

- **Armed 1.4s after load** — click to arm, click Launch, flying in under
  1 second. First shot inside 1s of spawn.
- **First enemy fire at ~6s** — wave 1 teaches dodging immediately; the
  striker's codex card ("the muzzle lights up before it shoots") appears
  at first sight.
- **The core loop is machine-proven**: an autopilot bot survives to wave
  3, kills 28, grazes 4 bullets and chains a combo to ×2 — through play,
  not scripted inputs.
- **Median 46 fps** in software rendering during real combat (the juice —
  hit-stop, screenshake, chroma, slow-mo, eight particle systems — is
  affordable).
- Everything is pinned in CI: the first-60-seconds contract, the
  threat-timing contract, the teach-at-first-sight contract, and the
  bot-proven core loop all rerun on every push.

## Assets (this folder: `docs/press/`)

- `emberfall-wave1.gif` — 24 frames, ~2MB, the first 24 seconds of wave 1
  (contact at 0.6s, first shooter ~6s, aimed fire, kills, combo ticks).
- `hero.png` — brightest captured combat frame (particle-rich mid-fight).
- Raw frames: regenerated every run in `docs/audit/frames/` (git-ignored;
  rerun `npx playwright test tests/fun-loop.spec.js` to reproduce).

## Feature list (the honest one)

- 5 ships with real tradeoffs (the glass-cannon flies 3× graze payout)
- 4 modes: Endless, Boss Rush, the Daily Gauntlet (one seed for everyone,
  weekly tempo), the 8-world Solar Tour
- 21 hostiles incl. elite affixes with in-world tells; 4 scripted
  teaching waves, then an adaptive wave director with DDA assist
- Graze ×3 ships, combo multiplier to ×5, weapon ladder to tier 7
- Rare "Wardenfall" Sundays (~1 in 7): a world boss with a permanent,
  ledger-backed honor
- Offline-first PWA: no server, no problem — local mode keeps flying
- Optional Command Deck: accounts, duels, dailies, worldwide boards
- Zero tracking, zero ads, zero install; source is MIT-licensed

## Recruiting blurb (paste anywhere)

> I've been building a free browser shmup with a weird honesty policy:
> the game's own CI *plays it* — an autopilot bot survives to wave 3,
> grazes bullets, chains combos, and the run is machine-verified on every
> push. Looking for 10 strangers to tell me if wave 5 is actually fun.
> No install: https://fahadibrahim93.github.io/emberfall/ — takes 30
> seconds to reach combat. Tell me where you stopped and why.

## Playtest questions (ask exactly these)

1. Where did you stop playing, and what made you stop?
2. Did anything feel unfair in the first two minutes?
3. Did you notice the combo multiplier? Did you care?
4. One thing that would make you play again tomorrow?
