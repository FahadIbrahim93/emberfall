#!/usr/bin/env bash
# EMBERFALL build check: syntax-verify every script — each js/*.js module
# (the simulation now lives in js/sim.js, so there are no inline payloads).
set -e
# stubguard first (2026-09-21 incident): fail in seconds with focused
# recovery guidance if index.html ever stops being the game.
node tools/stubguard.js
node tools/stubguard-output.test.js
# the SHIPPED simulation, stepped headlessly against a committed digest (no
# browser, no dependencies): any change to scored gameplay math fails here
node --test tools/parity.test.mjs
# types are a gate, not documentation (docs/expansion/REALITIES.md §3)
if [ -x node_modules/.bin/tsc ]; then
  node_modules/.bin/tsc --noEmit
else
  echo "check.sh: tsc missing — run npm ci before the gate" >&2
  exit 1
fi
# coverage is REPORTED, never gated: a threshold on the facade would invent
# confidence, and the simulation itself is covered by the parity and golden
# gates below. Printing covered/total keeps the denominator next to every
# percentage this repo ever quotes.
node_modules/.bin/vitest run --coverage --reporter=dot >/dev/null
node -e '
const s = require("./coverage/coverage-summary.json").total;
const part = k => `${k} ${s[k].pct}% (${s[k].covered}/${s[k].total})`;
console.log("COVERAGE: " + ["statements", "branches", "functions", "lines"].map(part).join(" · "));
'
node tools/check-actions.mjs
node tools/release-policy.mjs
node tools/ui-audit.js
node --test tools/check-actions.test.mjs
for f in js/*.js; do node --check "$f"; done
node -e '
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const re = /<script>([\s\S]*?)<\/script>/g;
let m, n = 0;
while ((m = re.exec(html))) {
  if (!m[1].trim()) continue;
  new vm.Script(m[1], { filename: "index.html#inline" + (++n) });
}
console.log("SYNTAX-OK: js/*.js modules + " + n + " inline payload(s)");
'
