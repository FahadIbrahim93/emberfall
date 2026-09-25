# Runbook — Wardenfall Sunday, 2026-09-27

*The rare Sunday arrives for real two days after this runbook was written.
Everything below is rehearsed; this page is the day-of checklist. The
mechanics: `dayDow(day) === 6 && hashStr('warden-' + day) % 7 === 0` — the
wave-5 capital becomes **Wardenfall**, and a wave-16 daily pays the
1,000-alloy honor plus the lifetime count and the gold dock plaque.*

## T-1 day (Saturday 2026-09-26)

- [ ] **Deck healthy:** `curl http://<deck>/api/health` → `"ok":true`, and
      `/api/stats` answers accepted-only totals.
- [ ] **The verdict is computable today:** run the pinned rehearsal once —
      `node tools/drill-rare-sunday.mjs` — proving the whole honor loop
      (wave-16 → medal + ledger + `/api/me` count) on the pinned day
      `2026-09-27`.
- [ ] **The client agrees the day is rare:** open the live game and check
      the Daily tile reads **WARDENFALL IN 1d** (the countdown shows 0 on
      the day itself — v4.14 fix, parity-gated across all 74 rare Sundays).
- [ ] **Backups:** `node tools/db-backup.js --verify` before the day —
      rare-Sunday payouts write the ledger; be able to restore it.
- [ ] **Mirror fresh:** run `node tools/db-sync.mjs` so the public mirror
      carries the pre-event state; the post-event sync will show the delta.

## Day-of (Sunday 2026-09-27, after 00:00 UTC)

- [ ] **The deck's clock flipped:** `GET /api/me` for any pilot shows
      `day: 2026-09-27` and the client tile says **WARDENFALL IS UP**.
- [ ] **Boot log is clean** — no rehearsal-clock line (`EF_DECK_DAY` must
      NOT be set in production; a pinned day in prod would be an incident).
- [ ] **First honest wave-16 run:** medal `Wardenfall` in the game-over
      notes, +1,000 alloy, the gold ✦ plaque on the dock.
- [ ] **No inflation:** re-fly a wave-16 daily the same day — the payout is
      exactly zero the second time (`daily_stats` one row per pilot/day).
- [ ] **Wave-15 on the rare day pays no honor** — the drill proved it on
      the pinned day; one live spot-check costs a run.

## After (Monday)

- [ ] **Ledger spot-check:** `wardenfalls` count in `/api/me` matches the
      plaque on every signed-in device (adoption paths all mint it).
- [ ] **Sync the mirror** (`node tools/db-sync.mjs --verify`): the public
      leaderboard now shows real `wardenfalls` columns.
- [ ] **Post-mortem is one line if all green** — the battery rehearsed this
      day before it arrived; deviations go in `docs/` with a drill that
      would have caught them.
