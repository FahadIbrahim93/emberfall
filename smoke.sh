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

# ── static hygiene gate — runs before the API battery, no server needed.
# Fails the battery when true-positive dead code appears anywhere in the repo:
# client (inline payload + js/*.js), server.js, shell functions, CSS classes.
say "── dead code scan (repo-wide) ──"
if node deadscan.js --check; then ok "deadscan clean"; else no "deadscan found dead code"; fi

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

say ""; say "── v3.3 provenance + seasons ──"
# fresh pilot for the anti-cheat battery
expect "ac2 register"      '"ok":true'                      -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Ace$R\",\"password\":\"hunter22\"}"
# honest arc: 3 waves, ~45s, growing counters
CPH='[[2.1,1,320,4,30,12,3,1],[12.4,2,940,11,72,31,8,2],[25.0,3,1880,19,118,54,15,2],[44.7,3,2410,24,151,66,21,2]]'
expect "honest run verified" '"verdict":"verified"'           -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":2410,\"wave\":3,\"ship\":\"vesper\",\"diff\":1,\"runT\":44.7,\"kills\":24,\"cps\":$CPH}"
# replay: identical arc again → rejected
REPLAY="$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":2410,\"wave\":3,\"ship\":\"vesper\",\"diff\":1,\"runT\":44.7,\"kills\":24,\"cps\":$CPH}")"
if printf '%s' "$REPLAY" | grep -q 'replay'; then ok "replay rejected"; else no "replay rejected  →  ${REPLAY:0:140}"; fi
# cheat: impossible depth — 40 waves in 60s
expect "depth cheat rejected" 'depth faster'                 -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":900000,\"wave\":40,\"ship\":\"vesper\",\"diff\":1,\"runT\":60,\"kills\":900,\"cps\":[[60,40,900000,900,4000,3900,300,5]]}"
# cheat: score mass beyond the economy ceiling for 6 waves
expect "mass cheat rejected"  'score impossible'             -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":5000000,\"wave\":6,\"ship\":\"vesper\",\"diff\":1,\"runT\":200,\"kills\":300,\"cps\":[[200,6,5000000,300,2000,1900,100,5]]}"
# cheat: velocity — 3M in 90s
expect "velocity rejected"    'velocity'                     -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":3000000,\"wave\":14,\"ship\":\"vesper\",\"diff\":1,\"runT\":90,\"kills\":800,\"cps\":[[90,14,3000000,800,5000,4900,400,5]]}"
# tamper: monotonicity break inside the arc
expect "non-monotonic rejected" 'non-monotonic'              -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":3000,\"wave\":3,\"ship\":\"vesper\",\"diff\":1,\"runT\":50,\"kills\":20,\"cps\":[[10,1,900,8,50,20,2,1],[20,2,1500,12,90,40,5,2],[30,3,1400,16,110,50,8,2]]}"
# flagged: final score disagrees with the arc tail
expect "mismatch flagged"     '"verdict":"flagged"'          -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":9000,\"wave\":3,\"ship\":\"vesper\",\"diff\":1,\"runT\":44.7,\"kills\":24,\"cps\":$CPH}"
# seasons
expect "season endpoint"      '"season":"'                   "$BASE/api/season"
expect "season has structure" '"ends":'                      "$BASE/api/season"

say ""; say "── v3.3 duels ──"
# Ace$R sends a duel to Pilot$R; Pilot$R logs in, fetches inbox + ghost, marks beaten
GH="\"ghost\":{\"frames\":[\"250,500\",\"252,498\",\"249,495\"]}"
DSEND="$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/challenges" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"to\":\"Pilot$R\",\"day\":\"$(date -u +%F)\",\"score\":777,\"wave\":2,\"ship\":\"vesper\",$GH}")"
if printf '%s' "$DSEND" | grep -q '"id":'; then ok "duel sent"; else no "duel sent  →  ${DSEND:0:140}"; fi
expect "self-duel rejected"   'yourself'                     -X POST "$BASE/api/challenges" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"to\":\"Ace$R\",\"day\":\"$(date -u +%F)\",\"score\":1,\"ship\":\"vesper\",$GH}"
expect "stale-day rejected"   'today'                        -X POST "$BASE/api/challenges" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"to\":\"Pilot$R\",\"day\":\"2020-01-01\",\"score\":1,\"ship\":\"vesper\",$GH}"
expect "logout again"         '"ok":true'                    -X POST "$BASE/api/logout" -H 'X-Emberfall: command-deck'
expect "login as target"      '"ok":true'                    -X POST "$BASE/api/login" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot$R\",\"password\":\"hunter22\"}"
INBOX="$(curl -s -b "$JAR" -c "$JAR" "$BASE/api/challenges")"
if printf '%s' "$INBOX" | grep -q "Ace${R}"; then ok "inbox shows duel"; else no "inbox shows duel  →  ${INBOX:0:140}"; fi
CID=$(printf '%s' "$INBOX" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
GHOSTJ="$(curl -s -b "$JAR" -c "$JAR" "$BASE/api/challenges/ghost?id=$CID")"
if printf '%s' "$GHOSTJ" | grep -q '"frames"'; then ok "ghost delivered"; else no "ghost delivered  →  ${GHOSTJ:0:140}"; fi
expect "duel marked beaten"   '"beaten":true'                -X POST "$BASE/api/challenges/beat" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"id\":$CID}"

say ""
say "── $PASS passed, $FAIL failed ─────────────────────"
[ "$FAIL" -eq 0 ]
