# Roadmap

Ordered by priority, not by release date. Every item ships the usual way: gated by CI and easy to roll back.

## Where things stand (2026-11-14)

- **Live:** v4.31.0 at https://emberfall-game-two.vercel.app and on [GitHub Pages](https://fahadibrahim93.github.io/emberfall/). Player accounts with callsigns, worldwide and daily boards, watermark standings, the five-bay hangar, and the rebuilt menus and Settings. Guests play without an account; email accounts post to boards that list registered pilots only. Saves stay on the device.
- **Just shipped:** the menu and settings overhaul (v4.31.0, PR #111), the hangar overhaul (v4.30.0, PR #109), and Gate 2 standings (v4.29.7, PR #96). Issues #16, #17 and #48 are closed.
- **Next product work:** cloud careers ([#115](https://github.com/FahadIbrahim93/emberfall/issues/115)), so a signed-in pilot can use more than one device without silent loss. Portal submissions (itch.io and CrazyGames) remain open.
- **Distribution:** submitted free to the Bounty Board Arcade (review pending). itch.io and CrazyGames are next.

## Now

1. **Cloud careers** ([#115](https://github.com/FahadIbrahim93/emberfall/issues/115)): versioned snapshots, local-first sync, compare-and-swap, and a title-screen choice on conflict. Schema work is additive and owner-applied only.
2. **Portal submissions:** itch.io and CrazyGames, using `npm run build:portal`.

## Next

3. **Product analytics** ([#45](https://github.com/FahadIbrahim93/emberfall/issues/45)): a versioned first-session funnel, with no email or free-form text collected.
4. **Daily challenge links and share cards** ([#46](https://github.com/FahadIbrahim93/emberfall/issues/46)).
5. **Creator mode** ([#47](https://github.com/FahadIbrahim93/emberfall/issues/47)): a clean capture layout and a weekly kit.

## Later

- **Sign in with X.** An earlier pull request (#26) landed and was later reverted; the live game does not offer it. Revisit when it is wanted, from a fresh branch on current `main`.
- **Engineering, not a release promise:** extract more of the inline core into modules (the wave director, the economy, the render layer), fold the colour memo tables into one helper, cache the HUD's DOM lookups, batch particles the way hostile fire is now batched, and move sky-event ticks into the fixed-step sim. A Playwright frame-cost guard would keep the numbers in `docs/performance.md` honest automatically.

## Not planned

- **A self-hosted game server.** Supabase replaced it ([ADR 0004](adr/0004-supabase-source-of-truth.md), [ADR 0005](adr/0005-remove-self-hosted-deck.md)).
- **Claiming authoritative anti-cheat.** Scores are bounds-checked and rate-limited, not replayed on a server, and the docs say so.

## Done recently

- Menu and settings overhaul, v4.31.0 (PR #111): one UI layer, rebuilt Settings with Restore defaults, palettes on the menus, reduce motion, a single modal focus stack, and Settings that open at the top
- Hangar overhaul, v4.30.0 (#100–#107, PR #109): five bays, armory, modules and presets, frame doctrines, contracts, mastery cosmetics, loadout codes on the boards
- Cosmetic standing ladder past Yardmaster (#48, carried into PR #109)
- Gate 2 standings (#15–#17, PR #96): watermark cursor pages, exact bigint scores, competition ranks, and browser coverage for the profile and standings pages
- Gate 1 player defects (#73, #75, #77, #79, #87, #89)
- Gate 0 trustworthy releases (#66, #69, #71)
- Supabase accounts and global and daily boards (#25)
- Retired `tools/db-sync.mjs`, the hourly Mirror stats workflow and the old mirror project (#25)
- Copy rewrite in a plainer voice (#24)
