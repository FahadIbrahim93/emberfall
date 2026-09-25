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

STATS="$(curl -s "$BASE/api/stats")"
if printf '%s' "$STATS" | grep -q '"ok":true'; then ok "public stats endpoint answers"; else no "stats endpoint  →  ${STATS:0:140}"; fi
# the stats limiter: 31 rapid pulls, one must 429 (generous for humans,
# hostile to scrapers — and it proves the bucket exists)
ST429=0
for i in $(seq 1 31); do
  C=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/stats")
  [ "$C" = "429" ] && ST429=1 && break
done
if [ "$ST429" = "1" ]; then ok "stats limiter 429s within 31 rapid pulls"; else no "stats limiter never fired in 31 pulls"; fi

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
# the stats page must serve AND the mirror-origin CSP allowance must be
# exactly where it belongs: stats.html (public boards) + index.html (the
# deckless worldwide tab) — and nowhere else, e.g. sw.js never carries it
expect "stats page serves" 'world stats'                    "$BASE/stats.html"
CSP_STATS="$(curl -s -I "$BASE/stats.html" | grep -i content-security-policy)"
CSP_INDEX="$(curl -s -I "$BASE/index.html" | grep -i content-security-policy)"
CSP_SW="$(curl -s -I "$BASE/sw.js" | grep -i content-security-policy)"
if printf '%s' "$CSP_STATS" | grep -q 'supabase.co' && printf '%s' "$CSP_INDEX" | grep -q 'supabase.co'; then
  ok "CSP: mirror origin allowed on stats.html + index.html (the deckless worldwide tab)"
else
  no "CSP missing mirror origin — stats: $(printf '%s' "$CSP_STATS" | head -c 80) index: $(printf '%s' "$CSP_INDEX" | head -c 80)"
fi
if [ -z "$CSP_SW" ]; then ok "sw.js carries no CSP (nothing to leak)"; else no "unexpected CSP on sw.js: $(printf '%s' "$CSP_SW" | head -c 80)"; fi
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
# (This burst shares the per-IP login window with everything after it: the
# duels drill drain-waits one window rather than racing this.)
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

say ""; say "── v4.16: account self-management ──"
# A dedicated pilot + dedicated jar, so the deletion cascade is proven
# without touching the battery's main identity. The register limiter
# (10/min/IP) has ~5 spent at this point — these three fit in the rest.
# Every probe here uses $JAR2 (expect() hardcodes $JAR on purpose).
REG2="$(curl -s -c "$JAR2" -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot2$R\",\"password\":\"hunter22\"}")"
if printf '%s' "$REG2" | grep -q '"ok":true'; then ok "account pilot registered (own jar)"; else no "account pilot registered  →  ${REG2:0:140}"; fi
ACCT() { curl -s -b "$JAR2" -c "$JAR2" "$@"; }
PWR="$(ACCT -X POST "$BASE/api/account/password" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"current":"nope","next":"brave42"}')"
if printf '%s' "$PWR" | grep -q 'wrong password'; then ok "password change refuses a wrong current"; else no "password wrong-current  →  ${PWR:0:140}"; fi
PWR="$(ACCT -X POST "$BASE/api/account/password" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"current":"hunter22","next":"brave42"}')"
if printf '%s' "$PWR" | grep -q '"ok":true'; then ok "password change accepts the right one"; else no "password change  →  ${PWR:0:140}"; fi
# The swap proof rides the account endpoint, not /api/login — the battery's
# own 20-login burst has already drained that per-IP bucket by this point.
PWR="$(ACCT -X POST "$BASE/api/account/password" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"current":"hunter22","next":"brave42x"}')"
if printf '%s' "$PWR" | grep -q 'wrong password'; then ok "OLD password no longer unlocks the account"; else no "old password still valid  →  ${PWR:0:140}"; fi
PWR="$(ACCT -X POST "$BASE/api/account/password" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"current":"brave42","next":"brave42"}')"
if printf '%s' "$PWR" | grep -q '"ok":true'; then ok "NEW password unlocks the account"; else no "new password invalid  →  ${PWR:0:140}"; fi
SESS="$(ACCT "$BASE/api/account/sessions")"
if printf '%s' "$SESS" | grep -Eq '"current":[0-9]'; then ok "sessions list marks the caller's own row"; else no "sessions current marker  →  ${SESS:0:140}"; fi
# Deletion: refusal, then the real thing. The pilot ranked on main above,
# so the board-eviction cascade is observable in the same battery.
DELW="$(ACCT -X POST "$BASE/api/account/delete" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"password":"nope"}')"
if printf '%s' "$DELW" | grep -q 'wrong password'; then ok "deletion refuses a wrong password"; else no "deletion wrong-pw  →  ${DELW:0:140}"; fi
DEL="$(ACCT -X POST "$BASE/api/account/delete" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d '{"password":"brave42"}')"
if printf '%s' "$DEL" | grep -q '"deleted":true'; then ok "deletion commits"; else no "deletion commits  →  ${DEL:0:160}"; fi
DEAD="$(curl -s -b "$JAR2" "$BASE/api/me")"
if printf '%s' "$DEAD" | grep -q '"user":null'; then ok "deleted pilot's cookie is dead"; else no "deleted cookie still alive  →  ${DEAD:0:140}"; fi
BOARD2="$(curl -s "$BASE/api/scores?mode=main")"
if printf '%s' "$BOARD2" | grep -q "Pilot2${R}"; then no "deleted pilot evicted from boards  →  ${BOARD2:0:140}"; else ok "deleted pilot evicted from boards"; fi
RET1="$(curl -s -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"Pilot2$R\",\"password\":\"zzzzzz\"}")"
RET2="$(curl -s -X POST "$BASE/api/register" -H 'Content-Type: application/json' -H 'X-Emberfall: command-deck' -d "{\"name\":\"pilot2$R\",\"password\":\"zzzzzz\"}")"
if printf '%s' "$RET1$RET2" | grep -q 'retired'; then ok "retired callsign cannot re-register (case-insensitive)"; else no "retired callsign  →  ${RET1:0:100} / ${RET2:0:100}"; fi

say ""
say "── $PASS passed, $FAIL failed ─────────────────────"
[ "$FAIL" -eq 0 ]
