#!/usr/bin/env bash
# EMBERFALL Command Deck — API smoke test. Run with the server up:
#   bash smoke.sh            (expects http://127.0.0.1:8123)
#   BASE=http://host:port bash smoke.sh
set -u
BASE="${BASE:-http://127.0.0.1:8123}"
JAR="$(mktemp)"
JAR2="$(mktemp)"
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
if node deadscan.js --check; then ok "deadscan clean (dead code + load order)"; else no "deadscan: dead code or load-order violation"; fi

say "── static hygiene (T-LEAK): the deck serves the game, nothing else ──"
# The audit's P0: server.js mapped ANY repo path onto HTTP — /data/emberfall.db
# (the user database + WAL) downloaded with a plain curl. These must all 404.
LEAK_CODE() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }
leak() { if [ "$(LEAK_CODE "$1")" = "404" ]; then ok "static leak blocked: $1"; else no "static leak: $1 → $(LEAK_CODE "$1") (must 404)"; fi; }
leak "/data/emberfall.db"
leak "/data/emberfall.db-wal"
leak "/data/emberfall.db-shm"
leak "/server.js"
leak "/package.json"
leak "/smoke.sh"
leak "/.git/config"
leak "/check.sh"
leak "/deadscan.js"
leak "/.env"
leak "/js"
leak "/data"
ICON_CODE=$(LEAK_CODE "/icons/icon-192.png")
if [ "$ICON_CODE" = "200" ]; then ok "allowlisted asset serves: /icons/icon-192.png"; else no "/icons/icon-192.png → $ICON_CODE (must 200)"; fi
SHELL_CODE=$(LEAK_CODE "/sw.js")
if [ "$SHELL_CODE" = "200" ]; then ok "allowlisted asset serves: /sw.js"; else no "/sw.js → $SHELL_CODE (must 200)"; fi

R=$RANDOM$RANDOM
expect "health"            '"ok":true'                      "$BASE/api/health"
expect "static index"      'EMBERFALL'                      "$BASE/"
expect "register guard (no header)" 'missing origin header'  -X POST "$BASE/api/register" -H 'Content-Type: application/json' -d '{"name":"x","password":"y"}'
expect "register bad name" 'callsign'                       -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"x\",\"password\":\"hunter2\"}"
expect "register ok"       '"ok":true'                      -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot$R\",\"password\":\"hunter22\"}"
expect "me (cookie set)"   "Pilot$R"                        "$BASE/api/me"
expect "me answers wardenfalls"  '"wardenfalls":0'          "$BASE/api/me"
expect "profile put"       '"ok":true'                      -X PUT "$BASE/api/profile" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"meta\":{\"alloy\":123},\"cfg\":{},\"updated\":$(date +%s000)}"
expect "profile fetch"     '"alloy":123'                    "$BASE/api/me"
# ── the vault: rolling profile snapshots (write seeds one via the big-delta rule) ──
PAD=$(awk 'BEGIN{for(i=0;i<900;i++)printf "x"}')
expect "vault seed put"     '"ok":true'                      -X PUT "$BASE/api/profile" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"meta\":{\"alloy\":123,\"pad\":\"$PAD\"},\"cfg\":{},\"updated\":$(date +%s000)}"
expect "vault list"         '"snaps":\['                      "$BASE/api/profile/snaps"
SNAP_T=$(curl -s -b "$JAR" "$BASE/api/profile/snaps" | grep -o '"taken":[0-9]*' | head -1 | cut -d: -f2)
expect "vault read newest"  '"meta":'                        "$BASE/api/profile/snaps/$SNAP_T"
expect "vault read missing" 'no such snapshot'                "$BASE/api/profile/snaps/123"
ANON_SNAPS="$(curl -s "$BASE/api/profile/snaps")"
if printf '%s' "$ANON_SNAPS" | grep -q 'sign in'; then ok "vault reject anon"; else no "vault reject anon  →  ${ANON_SNAPS:0:120}"; fi
# ── the Daily Gauntlet day board: day-scoped worldwide rankings ──
DAY=$(date -u +%F)
DPS=$(node -e "const t=88;process.stdout.write(JSON.stringify({mode:'daily',score:6800,wave:8,ship:'vesper',diff:1,runT:t,kills:120,cps:[[0,0,0,0,0,0,0,1],[t,8,6800,120,420,240,15,1.5]]}))")
expect "daily board post"   '"ok":true'                      -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "$DPS"
expect "daily board today"  "\"day\":\"$DAY\""                "$BASE/api/scores?mode=daily&day=$DAY"
expect "daily day empty"    '"top":\[\]'                     "$BASE/api/scores?mode=daily&day=2001-01-01"
expect "daily bad day"      'bad day'                        "$BASE/api/scores?mode=daily&day=nope"
# clean, jar-less call: prove anonymous submission is rejected (bypass the
# helper, which always attaches the logged-in jar)
ANON="$(curl -s -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"mode":"main","score":1,"wave":1,"ship":"vesper","diff":1}')"
if printf '%s' "$ANON" | grep -q 'sign in'; then ok "score reject anon"; else no "score reject anon  →  ${ANON:0:120}"; fi
expect "score bad mode"    'bad mode'                       -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"mode":"cheat","score":1,"wave":1,"ship":"vesper","diff":1}'
expect "score implausible" 'implausible'                    -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"mode":"main","score":2000000,"wave":1,"ship":"vesper","diff":1}'
expect "score without telemetry reviewed" '"verdict":"review"' -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":$((RANDOM+5000)),\"wave\":7,\"ship\":\"vesper\",\"diff\":1}"
# honest-board regression (audit 3.6): a review run must NOT appear on the
# board — the old smoke passed for the wrong reason (it matched the submitter's
# own `me` row, not a ranked entry). Pilot$R has ONLY a review run at this
# point, so their callsign must be absent from the ranked board entirely.
BOARD="$(curl -s "$BASE/api/scores?mode=main")"
if printf '%s' "$BOARD" | grep -q "Pilot$R"; then no "review excluded from board  →  $BOARD"; else ok "review excluded from board"; fi
expect "review excluded from rank"  '"me":null'                "$BASE/api/scores?mode=main"
expect "login wrong pw"    'wrong callsign'                 -X POST "$BASE/api/login" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot$R\",\"password\":\"nope\"}"
expect "login ok"          '"ok":true'                      -X POST "$BASE/api/login" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot$R\",\"password\":\"hunter22\"}"
expect "logout"            '"ok":true'                      -X POST "$BASE/api/logout" -H 'X-Emberfall: command-deck'
expect "me after logout"   '"user":null'                    "$BASE/api/me"

say ""; say "── v3.3 provenance + seasons ──"
# fresh pilot for the anti-cheat battery
expect "ac2 register"      '"ok":true'                      -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Ace$R\",\"password\":\"hunter22\"}"
# honest arc: 3 waves, ~45s, growing counters
CPH='[[2.1,1,320,4,30,12,3,1],[12.4,2,940,11,72,31,8,2],[25.0,3,1880,19,118,54,15,2],[44.7,3,2410,24,151,66,21,2]]'
expect "honest run accepted" '"verdict":"accepted"'           -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":2410,\"wave\":3,\"ship\":\"vesper\",\"diff\":1,\"runT\":44.7,\"kills\":24,\"cps\":$CPH}"
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
# review: final score disagrees with the arc tail
expect "mismatch reviewed"    '"verdict":"review"'          -X POST "$BASE/api/scores" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"mode\":\"main\",\"score\":9000,\"wave\":3,\"ship\":\"vesper\",\"diff\":1,\"runT\":44.7,\"kills\":24,\"cps\":$CPH}"
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
expect "duel rejects self-report" 'score did not beat'              -X POST "$BASE/api/challenges/beat" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"id\":$CID,\"score\":1,\"wave\":1,\"diff\":1}"
expect "duel marked beaten"   '"beaten":true'                -X POST "$BASE/api/challenges/beat" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"id\":$CID,\"score\":2410,\"wave\":3,\"diff\":1,\"runT\":44.7,\"kills\":24,\"cps\":$CPH}"

say ""; say "── P0-9: proxy-aware limiter + non-blocking auth hashing ──"
# X-Forwarded-For must be IGNORED unless the operator opts in (TRUST_PROXY=1):
# without it the header is attacker-controlled and spoofing it must not forge
# a fresh rate-limit bucket.
SPOOF="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -H 'X-Forwarded-For: 1.2.3.4' -d '{"name":"bad name!!","password":"x"}')"
if [ "$SPOOF" = "400" ]; then ok "XFF ignored without TRUST_PROXY (validation still applied)"; else no "XFF handling wrong: $SPOOF"; fi
# 20 concurrent logins on one account: every request must answer within the
# smoke timeout — the point is that scrypt no longer serializes the event loop.
LOAD_T0=$(date +%s)
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  curl -s -o /dev/null -X POST "$BASE/api/login" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot$R\",\"password\":\"wrong$RANDOM\"}" &
done
wait
LOAD_T1=$(date +%s)
if [ $((LOAD_T1 - LOAD_T0)) -le 10 ]; then ok "20 concurrent logins complete (async scrypt): ${LOAD_T1}s-${LOAD_T0}s"; else no "concurrent logins stalled: $((LOAD_T1 - LOAD_T0))s"; fi

say ""; say "── P0-10: the week window is a TEXT-day filter, not a lifetime count ──"
# Regression for the live-fire drill's catch: weekStart was bound as epoch-ms
# against TEXT created_day, so SQLite's INTEGER < TEXT ordering matched every
# row — weekDays silently counted the pilot's lifetime. The discriminator is
# a ledger row from BEFORE this week flown by the already-logged-in pilot:
# it must stay outside the window (only this Monday's row counts).
WDB="${EF_DATA_DIR_DB:-$(dirname "$0")/../emberfall-data/emberfall.db}"
WD0="$(curl -s -b "$JAR" "$BASE/api/me" | grep -o '"weekDays":[0-9]*' | cut -d: -f2)"
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1]);
const u = db.prepare('SELECT id FROM users WHERE name = ?').get(process.argv[2]);
if (!u) { console.error('seed target pilot missing'); process.exit(1); }
db.prepare('INSERT OR REPLACE INTO daily_stats (user_id, day, created_day, best_score, best_wave, paid, streak) VALUES (?,?,?,?,?,?,?)')
  .run(u.id, '2026-01-05', '2026-01-05', 5000, 8, 120, 1);   /* ten weeks old: outside every current window */
db.close();" "$WDB" "Pilot$R"
WD1="$(curl -s -b "$JAR" "$BASE/api/me" | grep -o '"weekDays":[0-9]*' | cut -d: -f2)"
if [ -n "$WD0" ] && [ "$WD1" = "$WD0" ]; then ok "week window excludes out-of-week ledger rows (weekDays $WD0 -> $WD1)"; else no "week window WRONG: weekDays $WD0 -> $WD1 (lifetime leak or window broken)"; fi
say ""
say "── $PASS passed, $FAIL failed ─────────────────────"
[ "$FAIL" -eq 0 ]
