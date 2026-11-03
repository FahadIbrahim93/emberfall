# ADR 0003 — One best-run dossier, three surfaces

Date: 2026-10-19 · Status: **HISTORICAL** (applied only to the Command Deck, which was never deployed and was removed in [ADR 0005](0005-remove-self-hosted-deck.md); kept as a decision record, the code it describes is gone) · Extends ADR 0001 and ADR 0002.
Does not move accounts or score writes off the Command Deck.

## Context

Accounts, sessions, and plausibility-checked scores already live in the
deck's SQLite. The public Supabase project is a read-only mirror. Three
surfaces were drifting:

1. **The live board attributed the wrong flight.** `MAX(score)` grouped by
   pilot, then took wave, hull, and paint from an arbitrary row (and
   `MAX(paint)` / `MAX(mastery)` from yet another). A louder earlier run
   could paint a later record.
2. **`/pilot/<name>` was a JSON blob**, while the boards promised a profile
   page. Browsers opening the link saw raw JSON. The dossier also reported
   `MAX(score)` and `MAX(wave)` independently, so the wave was not the
   wave of the best score.
3. **The mirror was a different board.** Deckless play and `stats.html`
   read a career-wide `leaderboard` view with no hull, no paint, no rank,
   and no season history. The in-game Global tab, the day board, and the
   world page could not name the same flight.

## Options considered

1. **Move accounts and boards to Supabase Auth + Postgres.** *Rejected.*
   ADR 0001. Gameplay writes stay on the deck; drills stay self-contained;
   a cloud outage must not sit on the scoring path.
2. **Keep the grouped `MAX(score)` query and document the mismatch.**
   *Rejected.* A leaderboard that shows another run's hull is wrong, and
   the cost of the window query is one index the board already wants.
3. **One best-run query on the deck, projected to every public surface.**
   ✅ The deck remains the only writer. The mirror, the HTML profile, and
   the in-game boards render that projection.

## Decision

3.

- **Best run.** Per pilot, per mode, the accepted row with the highest
  score, then the earliest `created`, then the lowest id. Competition
  rank: pilots with the same best share a number. Listed order among ties
  is the earlier flight.
- **Paint.** Only the wardrobe allowlist is stored on a score or returned
  on a dossier. Anything else is "no paint".
- **Pilot page.** `GET /pilot/<name>` returns the JSON dossier by default
  (drills and `fetch` keep working). A browser `Accept: text/html` gets
  the same facts as a page. No profile JSON, no telemetry.
- **Mirror.** `tools/mirror-schema.sql` adds `board_standings`, `seasons`,
  and `pilot_cards` with RLS forced and `anon` SELECT only. `db-sync`
  upserts them and deletes rows the deck no longer has. Until the schema
  is applied, the classic `leaderboard` view still answers and the client
  falls back to it.
- **Seasons.** The mirror's week key is the deck's `seasonKey` (Monday UTC,
  best five classic runs). History is every week, not only the current one.

## Consequences

- A pilot's hull on a board is the hull that scored it, on the deck and,
  after a sync, on the world page.
- Supabase remains unreachable from the scoring path. The deck never holds
  a service key.
- Operators apply `tools/mirror-schema.sql` once. `db-sync` says so when
  the new tables are missing, and still pumps the classic tables.
