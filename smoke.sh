#!/usr/bin/env bash
# EMBERFALL Command Deck — API smoke test. Run with the server up:
#   bash smoke.sh            (expects http://127.0.0.1:8123)
#   BASE=http://host:port bash smoke.sh
set -u
BASE="${BASE:-http://127.0.0.1:8123}"
JAR="$(mktemp)"
PASS=0; FAIL=0
say() { printf '%s\n' "$*"; }
ok()  { PASS=$((PASS+1)); say "PASS  $*"; }
no()  { FAIL=$((FAIL+1)); say "FAIL  $*"; }

# $1 name, $2 expected regex in body, then curl args...
expect() {
  local name="$1" want="$2"; shift 2
  local body
  body="$(curl -s -b "$JAR" -c "$JAR" "$@")" || body=""
  if printf '%s' "$body" | grep -Eq "$want"; then ok "$name"; else no "$name  →  ${body:0:200}"; fi
}

trap 'rm -f "$JAR"' EXIT

R=$RANDOM$RANDOM
expect "health"            '"ok":true'                      "$BASE/api/health"
expect "static index"      'EMBERFALL'                      "$BASE/"
expect "register guard (no header)" 'missing origin header'  -X POST "$BASE/api/register" -H 'Content-Type: application/json' -d '{"name":"x","password":"y"}'
expect "register bad name" 'callsign'                       -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"x\",\"password\":\"hunter2\"}"
expect "register ok"       '"ok":true'                      -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot$R\",\"password\":\"hunter22\"}"
expect "me (cookie set)"   "Pilot$R"                        "$BASE/api/me"
expect "profile put"       '"ok":true'                      -X PUT "$BASE/api/profile" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"meta\":{\"alloy\":123},\"cfg\":{},\"updated\":$(date +%s000)}"
expect "profile fetch"     '"alloy":123'                    "$BASE/api/me"
# clean, jar-less call: prove anonymous submission is rejected (bypass the
# helper, which always attaches the logged-in jar)
ANON="$(curl -s -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"mode":"main","score":1,"wave":1,"ship":"vesper","diff":1}')"
if printf '%s' "$ANON" | grep -q 'sign in'; then ok "score reject anon"; else no "score reject anon  →  ${ANON:0:120}"; fi
expect "score bad mode"    'bad mode'                       -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"mode":"cheat","score":1,"wave":1,"ship":"vesper","diff":1}'
expect "score implausible" 'implausible'                    -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"mode":"main","score":2000000,"wave":1,"ship":"vesper","diff":1}'
expect "score ok"          '"ok":true'                      -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":$((RANDOM+5000)),\"wave\":7,\"ship\":\"vesper\",\"diff\":1}"
expect "board has entry"   "Pilot$R"                        "$BASE/api/scores?mode=main"
expect "login wrong pw"    'wrong callsign'                 -X POST "$BASE/api/login" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot$R\",\"password\":\"nope\"}"
expect "login ok"          '"ok":true'                      -X POST "$BASE/api/login" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot$R\",\"password\":\"hunter22\"}"
expect "logout"            '"ok":true'                      -X POST "$BASE/api/logout" -H 'X-Emberfall: command-deck'
expect "me after logout"   '"user":null'                    "$BASE/api/me"

say ""
say "── $PASS passed, $FAIL failed ──────────────────────"
[ "$FAIL" -eq 0 ]
