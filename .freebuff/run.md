# EMBERFALL — how to run this worktree

## Reproduce artifacts

Nothing to generate: the game is a single `index.html`, and the backend is a
single `server.js` with **zero npm dependencies** (Node ≥ 22 uses the built-in
`node:sqlite`). There is no `.env` — configuration is environment/CLI only:

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

- `bash smoke.sh` — 17 API tests, all must pass
- `http://127.0.0.1:8123/index.html?selftest` — 21 client tests, all must pass
- Title screen → Settings → Command deck panel shows the account state

The game also still runs with **no server at all**: open `index.html` directly
or serve the folder statically — the client probes `/api/health` and silently
stays in local mode when the deck is absent.
