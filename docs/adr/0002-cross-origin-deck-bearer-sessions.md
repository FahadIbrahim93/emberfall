# ADR 0002 — Cross-origin pilots: deck addressing, bearer sessions, CORS allowlist

Date: 2026-09-27 · Status: **ACCEPTED** · Decides how the GitHub Pages game
reaches a self-hosted Command Deck, and how accounts feel for real players.

## Context

ADR 0001 fixed the *storage* question (SQLite authoritative, Supabase
mirror read-only) but left the *path* question open. Three facts chained
into one outcome — real players could never see a live leaderboard:

1. **The authoritative store was invisible.** The deck (accounts, boards,
   duels, the SQLite ledger) ran on the operator's machine; the game ships
   from GitHub Pages. Every real visitor was "deckless" — the Global tab
   fell back to the public mirror, which stays empty until an operator
   runs the sync.
2. **The client could not even dial a remote deck.** `js/net.js` spoke
   only same-origin relative URLs (`fetch('/api/…')`), so even a
   public deck would have been unreachable from Pages.
3. **Cookies cannot cross origins.** Sessions are `HttpOnly`
   `SameSite=Lax` cookies; they never ride cross-site fetches, and Safari
   blocks third-party cookies outright. "Just add CORS" is a dead end for
   authentication.

## Options considered

1. **Proxy through Pages** (functions/rewrites to the deck). *Rejected:*
   Pages has no functions; an edge proxy re-introduces a third party on
   the hot path and the repo's zero-build posture.
2. **Move auth to the mirror / Supabase Auth.** *Rejected:* ADR 0001 —
   gameplay writes never touch the cloud; accounts are the deck's.
3. **WebSocket-style handoff or postMessage relays.** *Rejected:*
   complexity theater for what is a plain HTTP API.
4. **Deck addressing + bearer tokens + an exact-origin CORS allowlist on
   the deck.** ✅ The deck is a normal HTTP API; the client learns its
   address; cross-origin sessions present a token instead of a cookie.

## Decision

4.

- **Deck addressing (client).** `NET.deck` (localStorage
  `emberfall2.deck`, settable via Settings → Command deck → "deck
  address", or `?deck=<url>` which persists once). Empty = auto: this
  origin's own deck (LAN + self-hosted play, unchanged since v3.2). Set =
  a remote deck; all `NET.req` calls go there. `setDeck` clears the
  bearer — decks do not share sessions.
- **Bearer sessions (server + client).** `register`/`login` return the
  raw session token in `X-Emberfall-Token` for **allowed origins only**,
  exposed via `Access-Control-Expose-Headers`. The client stores it and
  sends `Authorization: Bearer`. `sessionUser` accepts bearer-first,
  cookie-second; `clearSession` kills the bearer's row too. Same session
  rows, same 30-day expiry, same sweep — a token is a second handle on
  the same session, not a second session system.
- **CORS allowlist (server).** `EF_CORS_ORIGINS` (comma-separated exact
  origins, `*` = any origin for public data) gates every grant: exact
  echo, `Vary: Origin`, no `Access-Control-Allow-Credentials` ever.
  Preflights answer 204 for allowed origins and 204-without-grant for
  everyone else — a disallowed preflight must never hang. Empty env = the
  historical same-origin-only deck; nothing changes for LAN play.
- **Pilot profiles (server).** `GET /pilot/<callsign>` (case-insensitive,
  404 honest) serves the minimum public fact set a board row promises:
  bests per mode, wardenfalls, flew days, alloy paid, worn paint (from
  the profile snapshot, allowlisted). Board names link there.
- **Pagination (server + client).** `/api/scores?offset=N` pages past the
  top 10 in DISTINCT-pilot rows (`more` flag, hard cap 190, garbage
  floors to 0 — the ladder is public and unauthenticated). The Global tab
  renders "Show more pilots".
- **Deck-to-deck pages (server).** `EF_CONNECT_SRC` extends the CSP
  `connect-src` of pages the deck SERVES, so a LAN game can fly a remote
  deck from a phone. Pages needs no such permission (it serves no CSP
  header).

## Consequences

- The global leaderboard becomes *actually working*: one operator deploys
  the deck with `EF_CORS_ORIGINS=https://fahadibrahim93.github.io` and
  every Pages player gets accounts, live boards, duels and cloud saves —
  no fork of the game, no third party in the write path.
- The token lives in localStorage: XSS on the game origin could read it.
  Accepted — the game is a zero-dependency monolith with no third-party
  scripts, CSP locked to `'self'`, and the token is scoped to the deck's
  own API. Sessions remain server-side rows; logout and expiry are real.
- `*` allows public reads from anywhere but STILL never mints tokens for
  unknown origins — account writes demand an explicit allowlist entry.
- The battery proves the whole contract: `tools/drill-cross-origin.mjs`
  (23 checks, own scratch deck) and `tests/deck-link.spec.js` (real
  browser on a foreign origin). The disallowed-origin case is asserted
  both raw and in-browser.
