# ADR 0005 — Removed the self-hosted deck in favor of Supabase

Date: 2026-10-23 · Status: **ACCEPTED** · Follows [ADR 0004](0004-supabase-source-of-truth.md).

## Context

ADR 0004 moved accounts and boards to Supabase and left the Node + SQLite "command deck" (`server.js`, `fly.toml`, `Dockerfile`) in the repo as history. It was never deployed, but CI still booted it, ran a smoke battery and fifteen drills against it, built a Docker image, and the game still fetched `deck.json` and probed `/api/health` on every boot. That cost CI minutes, confused readers and put 404s in the live site's console.

## Decision

Remove the deck completely: the server, its Fly and Docker config, the deck-only pages (`ops.html`, `deck.json`), its tools, drills, specs and CI jobs, and the docs that described running it. The game is static files on Vercel plus Supabase; nothing else runs.

## Consequences

- The browser suite and `?selftest` harness run against `tools/serve-static.mjs`, a test-only static server that mirrors what Vercel publishes.
- `deadscan` now pins `.vercelignore` instead of the deck's static allowlist.
- `stats.html` and `pilot.html` stay: they read Supabase's public views.
- `js/net.js` keeps its board rendering and local profile code; its remote deck path is dormant (no address is ever set) and can be pruned once the auth work on its own branch lands.
- Duels, cloud saves, the save vault and per-pilot dossiers are not part of the live game. Bringing any back means a Supabase migration, not a server.
