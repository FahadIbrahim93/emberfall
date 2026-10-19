'use strict';
/* Public Supabase mirror client (ADR 0001). Publishable key only — safe to embed. */
const MIRROR_ORIGIN = 'https://bhcczyyhadornihhzpsu.supabase.co';
const MIRROR_KEY = 'sb_publishable_rcBoR0FTobKUc_2-QqH2fQ_jS4mqd5O';

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
  if (!bestScore) return null;
  const r = await mirrorRest('/rest/v1/pilots?best_score=gt.' + bestScore + '&select=deck_id', {
    headers: { Prefer: 'count=exact' }
  });
  if (!r.ok) throw new Error('mirror rank ' + r.status);
  const range = r.headers.get('content-range') || '';
  const m = range.match(/\/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) + 1 : 1;
}

async function mirrorPilotRow(callsign) {
  const enc = encodeURIComponent(String(callsign || '').trim());
  if (!enc) return null;
  let rows = await mirrorJson('/rest/v1/pilots?callsign=eq.' + enc + '&select=*&limit=1');
  if (rows[0]) return rows[0];
  rows = await mirrorJson('/rest/v1/pilots?callsign=ilike.' + enc + '&select=*&limit=1');
  return rows[0] || null;
}

async function mirrorModeBest(pilotDeckId, mode) {
  const rows = await mirrorJson('/rest/v1/scores?pilot=eq.' + pilotDeckId +
    '&mode=eq.' + encodeURIComponent(mode) +
    '&select=score,wave,ship&order=score.desc,flown_at.asc&limit=1');
  return rows[0] || null;
}
