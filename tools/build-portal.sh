#!/usr/bin/env bash
# Portal payload for web game portals (CrazyGames, GamePix, and the like).
# Copies the playable shell into dist-portal/, injects window.EMBERFALL_PORTAL,
# and writes dist-portal.zip with index.html at the archive root.
# No extra runtime dependencies: bash, node, and either zip or python3.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ROOT
OUT="$ROOT/dist-portal"
ZIP="$ROOT/dist-portal.zip"
LIMIT=$((20 * 1024 * 1024))

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT/js" "$OUT/fonts" "$OUT/icons"

# Playable shell only. Ops, stats, tests, tools, goldens, docs, the deck
# server, package metadata, and markdown stay out. LICENSE stays.
cp "$ROOT/index.html" "$OUT/index.html"
cp "$ROOT/js/"*.js "$OUT/js/"
cp "$ROOT/fonts/"*.woff2 "$OUT/fonts/"
cp "$ROOT/icons/"*.png "$OUT/icons/"
cp "$ROOT/manifest.webmanifest" "$ROOT/sw.js" "$ROOT/LICENSE" "$OUT/"

node <<'EOF'
const fs = require('fs');
const path = require('path');
const root = process.env.ROOT || process.cwd();
const out = path.join(root, 'dist-portal');

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const flag = '<script>window.EMBERFALL_PORTAL=true;</script>\n';
const netTag = '<script src="js/net.js"></script>';
if (!html.includes(netTag)) {
  console.error('build-portal: js/net.js script tag missing');
  process.exit(1);
}
if (!html.includes('window.EMBERFALL_PORTAL=true')) {
  html = html.replace(netTag, flag + netTag);
}
// Social / off-site share cards point at the project site. A portal copy
// does not carry them.
html = html.replace(/^[ \t]*<meta (?=[^>]*(?:property="og:|name="twitter:))[^>]*content="https?:[^"]*"[^>]*>\n/gm, '');
html = html.replace(
  "ok(deckUrlAllowed('https://emberfall-deck.fly.dev'), 'https deck');",
  "ok(deckUrlAllowed('https://deck.example.com'), 'https deck');"
);
html = html.replace(
  "s.src = 'https://accounts.google.com/gsi/client';",
  "s.src = '';"
);
html = html.replace(/Supabase/g, 'public');
fs.writeFileSync(path.join(out, 'index.html'), html);

/* Supabase accounts never ship in a portal build: scores stay on the device. */
fs.rmSync(path.join(out, 'js', 'cloud.js'), { force: true });
html = fs.readFileSync(path.join(out, 'index.html'), 'utf8').replace('<script src="js/cloud.js"></script>\n', '');
fs.writeFileSync(path.join(out, 'index.html'), html);

const mirrorPath = path.join(out, 'js', 'mirror-public.js');
let mirror = fs.readFileSync(mirrorPath, 'utf8');
const host = "const MIRROR_ORIGIN = 'https://rgmbexmodebegllahotc.supabase.co';";
if (!mirror.includes(host)) {
  console.error('build-portal: mirror host literal missing from js/mirror-public.js');
  process.exit(1);
}
mirror = mirror.replace(host, "const MIRROR_ORIGIN = '';");
fs.writeFileSync(mirrorPath, mirror);

let sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
sw = sw.replace(" './stats.html', './pilot.html',", '').replace(" './js/cloud.js',", '');
fs.writeFileSync(path.join(out, 'sw.js'), sw);
EOF

# Syntax of the shipped scripts, including every inline payload.
for f in "$OUT"/js/*.js; do node --check "$f"; done
node -e '
const fs = require("fs");
const vm = require("vm");
const html = fs.readFileSync(process.argv[1], "utf8");
const re = /<script>([\s\S]*?)<\/script>/g;
let m, n = 0;
while ((m = re.exec(html))) {
  if (!m[1].trim()) continue;
  new vm.Script(m[1], { filename: "dist-portal/index.html#inline" + (++n) });
}
if (!html.includes("window.EMBERFALL_PORTAL=true")) {
  console.error("portal flag was not injected");
  process.exit(1);
}
if (!n) { console.error("no inline payload"); process.exit(1); }
' "$OUT/index.html"

# Exclusions the portal zip must not carry.
for bad in \
  ops.html stats.html server.js Dockerfile fly.toml smoke.sh check.sh deadscan.js \
  package.json package-lock.json deck.json \
  tests tools goldens docs packages .github
do
  if [ -e "$OUT/$bad" ]; then
    echo "build-portal: excluded path leaked into dist-portal: $bad" >&2
    exit 1
  fi
done
if find "$OUT" -name '*.md' -print -quit | grep -q .; then
  echo "build-portal: markdown leaked into dist-portal" >&2
  exit 1
fi
if [ ! -f "$OUT/LICENSE" ] || [ ! -f "$OUT/index.html" ]; then
  echo "build-portal: LICENSE or index.html missing" >&2
  exit 1
fi

if grep -R -a -n -F -e 'supabase' -e 'fly.dev' -e 'github.com' "$OUT"; then
  echo "build-portal: forbidden host string in dist-portal" >&2
  exit 1
fi

# `zip` is preferred. When it is not installed, python3's stdlib still
# writes the archive so the root and size checks below always run.
# A missing archive is a hard failure either way — do not continue.
if command -v zip >/dev/null 2>&1; then
  ( cd "$OUT" && zip -r -X -q "$ZIP" . )
elif command -v python3 >/dev/null 2>&1; then
  echo "build-portal: zip is not installed; packing with python3" >&2
  python3 - "$OUT" "$ZIP" <<'PY'
import os, sys, zipfile
src, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames.sort()
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            if os.path.abspath(full) == os.path.abspath(dest):
                continue
            rel = os.path.relpath(full, src).replace(os.sep, "/")
            zf.write(full, rel)
PY
else
  echo "build-portal: zip is not installed and python3 is unavailable" >&2
  exit 1
fi
if [ ! -f "$ZIP" ]; then
  echo "build-portal: dist-portal.zip was not created" >&2
  exit 1
fi

# index.html at the archive root, not under a directory prefix.
if ! unzip -Z1 "$ZIP" | grep -qx 'index.html'; then
  echo "build-portal: index.html is not at the zip root" >&2
  exit 1
fi

size=$(stat -c%s "$ZIP")
if [ "$size" -ge "$LIMIT" ]; then
  echo "build-portal: dist-portal.zip is $size bytes (limit $LIMIT)" >&2
  exit 1
fi

echo "portal build ok: dist-portal/ and dist-portal.zip ($size bytes, limit $LIMIT)"
