# AGENTS.md — rules for coding agents working on EMBERFALL

1. Read first: `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`,
   `docs/LEADERBOARD-AND-ACCOUNTS.md`, `docs/DATABASE.md` and the spec in `docs/specs/`
   that your issue links (accounts work: `docs/specs/accounts-v2.md`).
2. Take **one issue at a time**. Work on a branch named `issue-<n>` (the issue number).
3. Open a PR that links the issue (`Closes #<n>`). Keep it small and on-topic.
4. Get CI green: `bash check.sh`, `node deadscan.js --check`, `node tools/copyguard.js`,
   `node tools/econsim.js --json`, `npm run test:sim`, `npm run test:browser`,
   `node tools/selftest-ci.js`. Bump the version/SW cache the way CHANGELOG entries do.
5. **Never merge, never push to or rewrite `main`.** A human merges.
6. **Never commit secrets** (tokens, service-role keys, `.env` files, OAuth client secrets).
7. Client code may use **only the Supabase publishable key** (`js/mirror-public.js`).
   Writes go through the RPCs (`submit_score`, `set_callsign`, `set_avatar`), never direct
   table writes. New SQL goes in `supabase/migrations/` as additive files; do not apply
   migrations to the live project yourself.
8. The plane name stays **WRAITH**. Keep the game's art style (existing panels, buttons,
   fonts and palette).
