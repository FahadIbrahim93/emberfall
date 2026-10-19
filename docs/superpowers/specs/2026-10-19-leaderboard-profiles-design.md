# Global leaderboards and pilot dossiers

Date: 2026-10-19. Status: accepted with the implementation in this change.
Extends ADR 0001 and ADR 0002. The decision record is
`docs/adr/0003-best-run-boards-and-public-dossiers.md`.

## Problem

EMBERFALL already has accounts (scrypt, hashed sessions, Google sign-in),
plausibility-checked scores, and a read-only Supabase mirror. The ladder
was not one system. A grouped `MAX(score)` could show another flight's
hull and paint. `/pilot/<name>` returned JSON whose wave was not the wave
of the best score. Deckless boards and `stats.html` read a different,
career-wide view with no rank and no season history.

## Decision

Keep SQLite authoritative. Do not move accounts to Supabase Auth, and do
not put Supabase on the scoring path.

One query defines a public row: the accepted run with the highest score,
the earliest timestamp on a tie, then the lowest id. Competition rank is
shared. That row is what `GET /api/scores` returns, what `/pilot/<name>`
returns as JSON and (for browsers) as HTML, and what `tools/db-sync.mjs`
writes to `board_standings`, `seasons`, and `pilot_cards` after
`tools/mirror-schema.sql`.

Paint is allowlisted at the score write and again on the way out. Profile
JSON, telemetry, password hashes, and sessions never leave SQLite.

The in-game classic, daily, and season boards link each callsign to the
deck dossier. The deckless Global tab and `stats.html` read
`board_standings` when it exists and fall back to the classic
`leaderboard` view when it does not.

## Proof

`tools/drill-boards.mjs` registers four pilots, flies a lesser run and a
best run from the same account, and checks the board row, the shared
rank, the JSON dossier, the HTML page, the season total, and the SQL the
mirror pump emits.

## Out of scope

Authoritative replay of a run from seed and inputs. Cursor pagination
past the existing offset cap of 190. Supabase as a gameplay store.
