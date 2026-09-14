#!/usr/bin/env bash
# EMBERFALL build check: extract <script> payload and syntax-verify with node --check
S=$(grep -n "<script>" index.html | head -1 | cut -d: -f1)
E=$(grep -n "</script>" index.html | head -1 | cut -d: -f1)
OUT="${TEMP:-/tmp}/emberfall_check.js"
sed -n "$((S+1)),$((E-1))p" index.html > "$OUT"
node --check "$OUT" && echo "SYNTAX-OK ($(wc -l < "$OUT") lines of script)"
