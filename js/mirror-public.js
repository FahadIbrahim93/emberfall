'use strict';
/* Public Supabase mirror client (ADR 0001). Publishable key only — safe to embed. */
const MIRROR_ORIGIN = 'https://bhcczyyhadornihhzpsu.supabase.co';
const MIRROR_KEY = 'sb_publishable_rcBoR0FTobKUc_2-QqH2fQ_jS4mqd5O';
/* Public pilot columns only. last_seen_at is login activity; select=*
   would request it and fail once the column privilege is revoked. */
const MIRROR_PILOT_COLS = 'deck_id,callsign,created_at,runs,best_score,best_wave,total_paid,best_streak,wardenfalls';

/* A profile page may link back to a deck the visitor named. Only a plain
   http(s) URL qualifies — a javascript: or data: deck parameter must not
   become a clickable href. */
function mirrorDeckHref(deck, callsign) {
  const raw = String(deck || '').trim().replace(/\/$/, '');
  if (!raw || /[\u0000-\u0020"'<>\\]/.test(raw)) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (u.username || u.password) return '';
  } catch (e) { return ''; }
  return raw + '/pilot/' + encodeURIComponent(String(callsign || ''));
}

function mirrorRest(path, opts) {
  const o = opts || {};
  const headers = Object.assign({ apikey: MIRROR_KEY }, o.headers || {});
  return fetch(MIRROR_ORIGIN + path, Object.assign({}, o, { headers }));
}

async function mirrorJson(path, opts) {
  const r = await mirrorRest(path, opts);
  if (!r.ok) throw new Error('mirror ' + r.status);
  return r.json();
}

/* O(1) mirror payload: count pilots strictly ahead on best_score (no full board). */
async function mirrorMainRank(bestScore) {
  const n = Number(bestScore);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  const r = await mirrorRest('/rest/v1/pilots?best_score=gt.' + n + '&select=deck_id', {
    headers: { Prefer: 'count=exact' }
  });
  if (!r.ok) throw new Error('mirror rank ' + r.status);
  const range = r.headers.get('content-range') || '';
  const m = range.match(/\/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) + 1 : 1;
}

async function mirrorPilotRow(callsign) {
  const raw = String(callsign || '').trim();
  if (!raw) return null;
  const enc = encodeURIComponent(raw);
  const cols = '&select=' + MIRROR_PILOT_COLS + '&limit=1';
  let rows = await mirrorJson('/rest/v1/pilots?callsign=eq.' + enc + cols);
  if (rows[0]) return rows[0];
  /* ILIKE wildcards would turn a crafted name into a match against someone else. */
  if (/[%_*\\]/.test(raw)) return null;
  rows = await mirrorJson('/rest/v1/pilots?callsign=ilike.' + enc + cols);
  return rows[0] || null;
}

async function mirrorModeBest(pilotDeckId, mode) {
  const id = Number(pilotDeckId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const rows = await mirrorJson('/rest/v1/scores?pilot=eq.' + id +
    '&mode=eq.' + encodeURIComponent(mode) +
    '&select=score,wave,ship&order=score.desc,flown_at.asc&limit=1');
  return rows[0] || null;
}
