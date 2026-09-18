# EMBERFALL — how to run this worktree

(release v3.6 — SERAPH prism-lance hull, reduced-motion sky, prompt-free save transfer, battery default)

## Reproduce artifacts

Nothing to generate: the client is `index.html` plus three classic-script
modules — `js/audio.js`, `js/sky.js`, `js/net.js` — loaded in order before the
inline core (no bundler, no ESM: classic scripts with shared globals, so
`file://` play still works). The backend is a single `server.js` with **zero
npm dependencies** (Node ≥ 22 uses the built-in `node:sqlite`). There is no
`.env` — configuration is environment/CLI only:

- `PORT=9000 node server.js` or `node server.js --port 9000` (default port **8123**)
- Database lives at `data/emberfall.db` (created on first boot; WAL mode; git-ignored)

If `data/` is missing, the server recreates it. If the port is busy, kill the
stale listener (`netstat -ano | grep :8123` → `taskkill //PID <pid> //F`) or
pick another port and adapt the preview URL.

## Run the server (detached, survives the session)

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory 'G:\emberfall' -RedirectStandardOutput 'G:\emberfall\.freebuff\server.log' -RedirectStandardError 'G:\emberfall\.freebuff\server.log.err' -WindowStyle Hidden -PassThru).Id"
```

(The shell may report a timeout — harmless; confirm with
`netstat -ano | grep :8123` that a pid is LISTENING, then
`curl http://127.0.0.1:8123/api/health`.)

## Verify

- `bash check.sh` — syntax-verifies every `js/*.js` module AND the inline payload(s)
- `bash smoke.sh` — dead-code gate (`node deadscan.js --check`, scans modules too) + full API battery, all must pass
- `http://127.0.0.1:8123/index.html?selftest` — 31 client tests, all must pass
- Title screen → Settings → Command deck panel shows the account state

The game also still runs with **no server at all**: open `index.html` directly
or serve the folder statically — the client probes `/api/health` and silently
stays in local mode when the deck is absent.
