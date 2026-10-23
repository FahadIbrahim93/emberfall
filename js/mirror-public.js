'use strict';
/* Public Supabase board client (ADR 0004). Publishable key only — safe to embed. */
const MIRROR_ORIGIN = 'https://rgmbexmodebegllahotc.supabase.co';
const MIRROR_KEY = 'sb_publishable_AXsBx7XpoUMLPVTyb4Rkhg_EDt_gB1Y';
/* Game mode -> worldwide board mode (migrations: endless|daily|school).
   Rush has no public board: it stays on the device. */
const MIRROR_MODE = { main: 'endless', daily: 'daily', school: 'school' };

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

/* Rank on the endless board: count pilots strictly ahead (no full board). */
async function mirrorMainRank(bestScore) {
  const n = Number(bestScore);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  const r = await mirrorRest('/rest/v1/leaderboard_global?mode=eq.endless&score=gt.' + n + '&select=user_id', {
    headers: { Prefer: 'count=exact' }
  });
  if (!r.ok) throw new Error('mirror rank ' + r.status);
  const range = r.headers.get('content-range') || '';
  const m = range.match(/\/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) + 1 : 1;
}

/* A public profile: callsign (case-insensitive, exact) + best endless run.
   Shape kept close to the old mirror row so pilot.html renders it as-is. */
async function mirrorPilotRow(callsign) {
  const raw = String(callsign || '').trim();
  if (!raw) return null;
  /* ILIKE wildcards would turn a crafted name into a match against someone else. */
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(raw)) return null;
  const enc = encodeURIComponent(raw.replace(/_/g, '\\_'));
  const rows = await mirrorJson('/rest/v1/profiles?callsign=ilike.' + enc + '&select=id,callsign,created_at&limit=1');
  const p = rows[0];
  if (!p) return null;
  const best = await mirrorJson('/rest/v1/leaderboard_global?user_id=eq.' + p.id + '&mode=eq.endless&select=score&limit=1');
  return { deck_id: p.id, callsign: p.callsign, created_at: p.created_at,
    best_score: best[0] ? best[0].score : 0, runs: null, best_streak: 0, wardenfalls: 0 };
}

async function mirrorModeBest(pilotId, mode) {
  const id = String(pilotId || '');
  const m = MIRROR_MODE[mode];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !m) return null;
  const view = m === 'daily' ? 'leaderboard_daily' : 'leaderboard_global';
  const rows = await mirrorJson('/rest/v1/' + view + '?user_id=eq.' + id +
    (m === 'daily' ? '' : '&mode=eq.' + m) +
    '&select=score,stats&order=score.desc,created_at.asc&limit=1');
  const r = rows[0];
  if (!r) return null;
  const st = r.stats || {};
  return { score: r.score, wave: Number.isFinite(+st.wave) ? Math.trunc(+st.wave) : 1, ship: typeof st.ship === 'string' ? st.ship : null };
}
