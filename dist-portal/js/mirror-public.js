'use strict';
/* Bounty Board / framed arcade: no sign-in, sign-up, or email prompts.
   Sets portal mode before cloud.js boots; hides auth chrome once DOM is ready. */
(function () {
  var framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }
  if (!framed) return;
  window.EMBERFALL_PORTAL = true;
  function hideAuth() {
    ['btnInstall', 'swRegister', 'btnPilot', 'btnAcctSign', 'btnAcctGuest', 'acctPanel', 'ovCloud', 'cloudBox'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideAuth);
  else hideAuth();
})();

/* Public Supabase board client (ADR 0004). Publishable key only — safe to embed. */
const MIRROR_ORIGIN = '';
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

/* Exact decimal text for a bigint score. Number() would round past 2^53. */
function fmtScore(n) {
  const s = String(n == null ? '' : n).trim();
  if (!/^[0-9]+$/.test(s)) return '0';
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const SOURCE_LABEL = { endless: 'Endless', daily: 'Daily', school: 'School' };
function sourceLabel(mode) {
  return SOURCE_LABEL[mode] || '';
}

/* Compatibility rank: count pilots strictly ahead on the folded endless view.
   standings_page is the ranked read once that migration is applied. */
async function mirrorMainRank(bestScore) {
  const s = String(bestScore == null ? '' : bestScore).trim();
  if (!/^[0-9]+$/.test(s) || s === '0') return null;
  const n = s;
  const r = await mirrorRest('/rest/v1/leaderboard_global?mode=eq.endless&score=gt.' + encodeURIComponent(n) + '&select=user_id', {
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

/* Cursor page of the frozen best-run board. missing: true means this project
   has not applied 20261111000000_standings_cursor.sql yet. */
async function mirrorStandings(opts) {
  const o = opts || {};
  const cursor = o.cursor || null;
  const r = await mirrorRest('/rest/v1/rpc/standings_page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_board: o.board,
      p_day: o.day || null,
      p_limit: o.limit || 50,
      p_watermark: o.watermark || null,
      p_cursor_score: cursor ? String(cursor.score) : null,
      p_cursor_at: cursor ? cursor.created_at : null,
      p_cursor_user: cursor ? cursor.user_id : null
    })
  });
  if (r.status === 404) return { missing: true, watermark: null, rows: [] };
  if (!r.ok) throw new Error('mirror ' + r.status);
  const data = await r.json();
  return { missing: false, watermark: data && data.watermark, rows: (data && data.rows) || [] };
}

async function mirrorPilotDossier(callsign) {
  const raw = String(callsign || '').trim();
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(raw)) return { missing: false, card: null };
  const r = await mirrorRest('/rest/v1/rpc/pilot_dossier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_callsign: raw })
  });
  if (r.status === 404) return { missing: true, card: null };
  if (!r.ok) throw new Error('mirror ' + r.status);
  return { missing: false, card: await r.json() };
}
