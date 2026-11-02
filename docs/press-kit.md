# EMBERFALL press kit

**The styled version is at https://fahadibrahim93.github.io/emberfall/docs/press-kit.html.** Send that one to playtesters. If people prefer a form, they can [answer the four questions as a GitHub issue](https://github.com/FahadIbrahim93/emberfall/issues/new?template=playtest-feedback.yml). This file holds the source text, and the HTML page and its assets deploy with the site.

Every number below comes from the repo's own tests (`tests/fun-audit.spec.js`, `tests/fun-loop.spec.js`, with artifacts in `docs/audit/`).

## Where to play

- **https://emberfall-game-two.vercel.app/** (main link)
- https://fahadibrahim93.github.io/emberfall/
- Submitted free to the Bounty Board Arcade (review pending). itch.io and CrazyGames are planned.

## The pitch

**EMBERFALL** is a free browser shoot-'em-up with nothing to install. Something came through the Kuiper Gate and hasn't stopped since, and you're the last ship between it and the orbital yard. It has five ships, four modes and 21 hostile types across eight worlds, and the scoring pays you for flying *close* to the fire. Click Launch. That's the whole tutorial.

## The numbers

Measured at v4.21.0. Later releases are in the fun-curve table in the README.

- **Ready to fly about 1.4s after load.** CI requires under 3.5s to get ready, under 2s from Launch to flying and a first shot within 2s.
- **First enemy fire at about 6s.** Wave 1 teaches dodging right away, and the striker's codex card appears the first time you see one.
- **A bot plays the core loop.** It reaches wave 3, kills 28, grazes 4 bullets and builds a ×2 combo by actually playing, not by replaying scripted inputs.
- **Median 46 fps** in real combat with software rendering.
- All of this runs again on every push.

## Assets (`docs/press/`)

- `emberfall-wave1.gif`: 24 frames, about 2 MB, the first 24 seconds of wave 1
- `hero.png`: a busy combat frame
- More screenshots are in `docs/screenshots/`. Raw frames regenerate in `docs/audit/frames/` (git-ignored) when you run `npx playwright test tests/fun-loop.spec.js`.

## Features

- 5 ships with real trade-offs (the glass cannon earns 3× graze payout)
- 4 modes: Endless, Boss Rush, the Daily Gauntlet (one seed for everyone) and the 8-world Solar Tour
- 21 hostile types, including elites you can read on sight, 4 scripted teaching waves and then an adaptive wave director
- Grazing, combos up to ×5 and a weapon ladder up to tier 7
- Rare "Wardenfall" Sundays (about 1 in 7) with a world boss and a permanent honor
- An offline PWA that plays fine with no server
- An optional Command Deck for accounts, duels and shared boards. It's merged but **not live** until the deck is deployed.
- No ads, no third-party trackers, nothing to install, MIT source

## Short blurb

> I'm making a free browser shmup, and its CI plays the game: a bot reaches wave 3, grazes bullets and chains combos on every push. I'm looking for 10 people to tell me whether wave 5 is actually fun. No install: https://emberfall-game-two.vercel.app/. It takes about 30 seconds to reach combat. Tell me where you stopped and why.

## Playtest questions

1. Where did you stop playing, and what made you stop?
2. Did anything feel unfair in the first two minutes?
3. Did you notice the combo multiplier? Did you care?
4. One thing that would make you play again tomorrow?
