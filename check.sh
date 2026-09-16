#!/usr/bin/env bash
# EMBERFALL build check: syntax-verify every script — each js/*.js module
# AND each inline <script> payload in index.html. After the monolith split
# there are four script blocks; first-match extraction would check nothing.
set -e
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
if (!n) { console.error("no inline payload found in index.html"); process.exit(1); }
console.log("SYNTAX-OK: js/*.js modules + " + n + " inline payload(s)");
'
