# ═══════════════════════════════════════════════════════════════════════
# EMBERFALL Command Deck — one image, gates in the build.
#
#   docker build -t emberfall-deck .
#   docker run -d -p 8123:8123 -v emberfall-data:/data emberfall-deck
#
# Stage 1 (gates) runs the no-browser battery: syntax, dead-code,
# copy-guard, SQL-binding audit, parity, economy sim, sim unit tests.
# Stage 2 (runtime) copies ONE file out of the gates stage — a broken
# gate can never produce a runnable image, and `docker build` doubles
# as a full gate run.
#
# Runtime is deliberately minimal: server.js imports only node: builtins
# (http/fs/path/crypto/os/sqlite), so the runtime stage needs no npm at
# all. node:sqlite needs node >= 22 (the repo floor).
# ═══════════════════════════════════════════════════════════════════════

# ── stage 1: gates (validation only — nothing here ships) ──────────────
FROM node:22-alpine AS gates
# bash for check.sh; git only because vitest consumes the worktree info
RUN apk add --no-cache bash
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
# every file the gates actually read: stubguard/deadscan/econsim/parity
# parse index.html; copyguard audits README + ARCHITECTURE + docs/; vitest
# needs its config. Keep this list equal to the battery's true appetite.
COPY check.sh deadscan.js server.js ./
COPY index.html sw.js manifest.webmanifest ./
COPY README.md ARCHITECTURE.md ./
COPY docs ./docs
COPY vitest.config.ts ./
COPY tools ./tools
COPY packages ./packages
COPY goldens ./goldens
COPY js ./js
RUN bash check.sh \
 && node deadscan.js --check \
 && node tools/copyguard.js \
 && node tools/audit-sql-bindings.js \
 && node tools/parity-daily.js \
 && node tools/econsim.js --json > /dev/null \
 && npm run test:sim

# ── stage 2: runtime (non-root, data on a volume, health-checked) ──────
FROM node:22-alpine AS runtime
# the single COPY --from=gates makes the runtime STRICTLY depend on the
# gates stage: no green gates, no image.
COPY --from=gates /app/package.json /app/package.json
WORKDIR /app
COPY index.html stats.html sw.js manifest.webmanifest server.js ./
COPY js ./js
COPY icons ./icons
COPY fonts ./fonts

# non-root runtime user; /data owned by it (EF_DATA_DIR default)
RUN addgroup -S ember && adduser -S -G ember -u 1001 ember \
 && mkdir -p /data && chown -R ember:ember /data
ENV NODE_ENV=production \
    PORT=8123 \
    EF_DATA_DIR=/data
VOLUME ["/data"]
USER ember
EXPOSE 8123

# the deck must answer /api/health; a wedged deck is unhealthy, and
# orchestrators restart it
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" | grep -q '"ok":true' || exit 1

CMD ["node", "server.js"]
