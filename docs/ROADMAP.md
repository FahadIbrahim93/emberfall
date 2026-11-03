# Roadmap

Ordered by priority, not by release date. Every item ships the usual way: gated by CI and easy to roll back.

## Where things stand (2026-10-23)

- **Live:** player accounts with callsigns, and global and daily leaderboards on Supabase (#25), at https://emberfall-game-two.vercel.app. Guests play without an account; email accounts (with email confirmation) post to boards that list registered pilots only.
- **Recently merged:** security hardening (#19, #22), repo hygiene (#20), the deadscan CI fix (#23), the upper-screen flash fix (#21) and the copy rewrite (#24).
- **Planned:** Sign in with X (#26). It needs a rebase onto the current `main` before it can merge.
- **Distribution:** submitted free to the Bounty Board Arcade (review pending). itch.io and CrazyGames are next.

## Now

1. **Sign in with X** (#26): rebase onto `main`, finish review, enable the `x` provider on the project, merge.
2. **Portal submissions:** itch.io and CrazyGames, using `npm run build:portal`.

## Next

3. **Keyset pagination** for boards once they grow past what offset paging handles well (issue #16).
4. **More browser coverage** for the stats page and the Global tab (issue #17).
5. **Accessibility pass:** extend the colour-blind checks already used for paints to UI states, focus rings and screen-reader labels.

## Not planned

- **A self-hosted game server.** Supabase replaced it ([ADR 0004](adr/0004-supabase-source-of-truth.md), [ADR 0005](adr/0005-remove-self-hosted-deck.md)).
- **Claiming authoritative anti-cheat.** Scores are bounds-checked and rate-limited, not replayed on a server, and the docs say so.

## Done recently

- Supabase accounts and global and daily boards (#25)
- Retired `tools/db-sync.mjs`, the hourly Mirror stats workflow and the old mirror project (#25)
- Copy rewrite in a plainer voice (#24)
