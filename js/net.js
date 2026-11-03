/* NET — the Global tab's worldwide boards, plus the shared title-screen
   renderers (boards, roster, feats, hangar, screen flow) — extracted from the
   original monolith. Classic script: shares globals with index.html's inline
   core. Load order is enforced in index.html; file:// play still works.
   Accounts and score posting are js/cloud.js (Supabase, ADR 0004). */

/* Portal mode (window.EMBERFALL_PORTAL, or ?portal=1) is the build web
   game portals ship: no accounts, no public boards, no other host. Scores
   stay in localStorage. The flag is read at load, before any request. */
function emberfallPortal() {
  try {
    if (typeof window !== 'undefined' && window.EMBERFALL_PORTAL) return true;
    if (typeof location !== 'undefined' && /(?:^|[?&])portal=1(?:&|$)/.test(String(location.search || ''))) return true;
  } catch (e) { }
  return false;
}
const NET = {
  /* the Global tab: worldwide boards read from the public Supabase views
     (js/mirror-public.js). Accounts and score posting live in js/cloud.js. */
  async renderGlobal() {
    const status = $('globalStatus');
    if (!status) return;
    if (typeof CLOUD !== 'undefined') CLOUD.open().catch(() => {});
    status.textContent = emberfallPortal() ? 'Scores stay on this device.' : 'Worldwide boards';
    this.renderMirrorBoards();
  },

  /* read-only projections from the public views. Everything here is
     best-effort: a failure leaves an honest line, never an error. */
  async renderMirrorBoards() {
    const body = $('globalBody');
    body.classList.remove('hidden');
    NET.boardTab(NET.board || 'daily');
    if (emberfallPortal()) {
      const stat = $('dailyStat');
      if (stat && typeof todaySeedKey === 'function') stat.textContent = 'this device · ' + todaySeedKey();
      if (typeof renderBoard === 'function') {
        const mode = typeof boardMode === 'function' ? boardMode() : 'main';
        const box = $('globalBoard');
        if (box) renderBoard(box, mode, null);
        const day = $('dailyBoard');
        if (day) renderBoard(day, 'daily', null);
      }
      return;
    }
    const box = $('globalBoard');
    box.innerHTML = '<div class="skel" role="status" aria-label="Loading board"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
    const dayEl = $('dailyBoard'); if (dayEl && !dayEl.querySelector('.row')) dayEl.innerHTML = '<div class="skel" role="status" aria-label="Loading board"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
    const mode = (typeof boardMode === 'function') ? boardMode() : 'main';
    const AV = NET.avatars || (NET.avatars = {});
    const avIcon = uid => AV[uid] ? '<img class="av" alt="" src="' + avatarUrl(AV[uid]) + '">' : '';
    /* avatars ride beside the board rows: one extra read of profiles.avatar */
    const withAvatars = async rows => {
      const ids = rows.map(r => r.user_id).filter(id => id && !(id in AV));
      if (ids.length) {
        try {
          const ps = await mirrorJson('/rest/v1/profiles?id=in.(' + ids.join(',') + ')&select=id,avatar');
          for (const p of ps) AV[p.id] = p.avatar || null;
        } catch (e) { }
      }
      return rows;
    };
    const rowHtml = (r2, i, tag) => {
      const st = r2.stats || {};
      const h = (typeof HULLS !== 'undefined') && typeof st.ship === 'string' && HULLS.find(x => x.id === st.ship);
      const wave = Number.isFinite(+st.wave) ? Math.trunc(+st.wave) : 1;
      const mine = typeof CLOUD !== 'undefined' && CLOUD.user && r2.user_id === CLOUD.user.id;
      return '<div class="row' + (mine ? ' me' : '') + (i < 3 ? ' top' : '') + '">' +
        '<span class="rk">' + (i + 1) + '</span>' +
        '<span class="nm">' + avIcon(r2.user_id) + '<a href="' + esc(pilotUrl(r2.callsign)) + '">' + esc(r2.callsign) + '</a>' +
        (h ? '<span class="hl">' + esc(h.name) + '</span>' : '') + '</span>' +
        '<span class="sc">' + fmt(r2.score) + '</span>' +
        '<span class="wv" title="' + (tag === 'D' ? 'Daily' : 'Worldwide') + ' wave">' + wave + '</span></div>';
    };
    /* the Daily board: today's UTC seed, best run per pilot */
    const dayBox = $('dailyBoard'), dstat = $('dailyStat');
    if (dayBox) {
      const day = new Date().toISOString().slice(0, 10);
      if (dstat) dstat.textContent = day + ' UTC';
      mirrorJson('/rest/v1/leaderboard_daily?day=eq.' + day +
        '&select=user_id,callsign,score,stats&order=score.desc,created_at.asc&limit=50').then(withAvatars).then(rows => {
        dayBox.innerHTML = rows.length
          ? rows.map((r2, i) => rowHtml(r2, i, 'D')).join('')
          : '<div class="empty"><b>No runs yet today</b>Fly today\u2019s seed to set the first score.</div>';
      }).catch(() => { dayBox.innerHTML = '<div class="empty err"><b>Board unavailable</b>The day board could not be reached. Try again shortly.</div>'; });
    }
    /* rush has no worldwide board and the daily lives above: both show endless */
    const gmode = MIRROR_MODE[mode] && mode !== 'daily' ? MIRROR_MODE[mode] : 'endless';
    try {
      const rows = await mirrorJson('/rest/v1/leaderboard_global?mode=eq.' + gmode +
        '&select=user_id,callsign,score,stats&order=score.desc,created_at.asc&limit=50').then(withAvatars);
      NET.paintMyRank(rows, gmode);
      if (!rows.length) {
        box.innerHTML = '<div class="empty"><b>No ranked pilots on the public board yet</b>Sign in, choose a callsign and fly an Endless run.</div>';
        return;
      }
      box.innerHTML = rows.map((r2, i) => rowHtml(r2, i, 'W')).join('') +
        '<p class="note-s board-foot">Best run per pilot, live from the public mirror. <a href="stats.html">World stats</a></p>';
    } catch (e) {
      box.innerHTML = '<div class="empty err"><b>Board unavailable</b>The public mirror is not answering. Your runs are saved on this device.</div>';
    }
  }
};

/* Daily / All-time board tabs (accounts v2) */
NET.boardTab = function (name) {
  NET.board = name === 'all' ? 'all' : 'daily';
  const body = $('globalBody');
  if (body) { body.classList.toggle('b-all', NET.board === 'all'); body.classList.toggle('b-daily', NET.board === 'daily'); }
  document.querySelectorAll('.btab').forEach(b => { const on = b.dataset.board === NET.board; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
};
/* "your rank": pinned under the top 50 when the signed-in pilot is not on it */
NET.paintMyRank = async function (rows, gmode) {
  const el = $('myRank');
  if (!el) return;
  el.classList.add('hidden');
  const me = typeof CLOUD !== 'undefined' && CLOUD.user && CLOUD.profile;
  if (!me || rows.some(r => r.user_id === CLOUD.user.id)) return;
  try {
    const mine = await mirrorJson('/rest/v1/leaderboard_global?mode=eq.' + gmode + '&user_id=eq.' + CLOUD.user.id + '&select=score&limit=1');
    if (!mine[0]) { el.innerHTML = '<p class="note-s">You have no ranked run yet. Your next Endless run posts here.</p>'; el.classList.remove('hidden'); return; }
    const rk = gmode === 'endless' ? await mirrorMainRank(mine[0].score) : null;
    el.innerHTML = '<div class="row me"><span class="rk">' + (rk ? fmt(rk) : '—') + '</span><span class="nm">' + esc(CLOUD.profile.callsign) + '<span class="hl">You</span></span><span class="sc">' + fmt(mine[0].score) + '</span><span class="wv"></span></div>';
    el.classList.remove('hidden');
  } catch (e) { }
};
if (typeof document !== 'undefined') document.addEventListener('click', e => {
  const b = e.target && e.target.closest && e.target.closest('.btab');
  if (!b) return;
  NET.boardTab(b.dataset.board);
  const t = $(b.dataset.board === 'all' ? 'globalBoard' : 'dailyBoard');
  if (t) try { t.scrollIntoView({ block: 'nearest' }); } catch (e2) { }
});
const AVATARS = ['vesper', 'halcyon', 'atlas', 'wraith', 'seraph'];
const _avUrl = {};
function avatarUrl(id) {
  if (!AVATARS.includes(id)) id = 'vesper';
  if (_avUrl[id]) return _avUrl[id];
  try { return (_avUrl[id] = hullPreview(id, 16).toDataURL()); } catch (e) { return ''; }
}

function renderBoard(el, mode, highlight, _remote, myPaint) {
  const honor = honorOf(META.donated || 0);
  const star = honor && honor.at >= 25000 ? '<span style="color:var(--gold)">✦ </span>' : '';
  const list = loadBoard(mode);
  if (!list.length) {
    el.innerHTML = '<div class="empty">No runs recorded yet.<br>The first one is yours.</div>';
    return;
  }
  el.innerHTML = list.map((r, i) => {
    const h = HULLS.find(x => x.id === r.k);
    const pt = r.p && PAINTS.find(x => x.id === r.p);
    const dot = pt ? '<i class="pdot" style="background:' + pt.hull + '"></i>' : (r.p && r.p !== 'yard' && r.p === myPaint && PAINTS.find(x => x.id === myPaint) ? '<i class="pdot" style="background:' + PAINTS.find(x => x.id === myPaint).hull + '"></i>' : '');
    const mine = r.d === highlight || r.n === (DB.get('callsign', '') || '').toUpperCase();
    return '<div class="row' + (mine ? ' me' : '') + '">' +
      '<span class="rk">' + pad2(i + 1) + '</span>' +
      '<span class="nm">' + dot + (mine ? star : '') + esc(r.n).slice(0, 12) + (h ? ' · ' + esc(h.name) : '') + '</span>' +
      '<span class="sc">' + padN(r.s, 7) + '</span>' +
      '<span class="wv">W' + pad2(r.w || 1) + '</span></div>';
  }).join('');
}
function renderRoster() {
  const box = $('tab-roster');
  if (box.dataset.built) return;
  const rows = [];
  rows.push(['th', 'Hostiles']);
  for (const k of ['drone', 'striker', 'weaver', 'splitter', 'cruiser', 'lancer', 'orbiter', 'warden', 'minelayer', 'carrier', 'ram', 'sniper', 'shieldbreaker']) {
    rows.push(['foe', k]);
  }
  rows.push(['th', 'Capital ships']);
  for (const b of BOSSES) rows.push(['boss', b.id]);
  rows.push(['th', 'Salvage']);
  for (const k of ['gun', 'shield', 'over', 'pulse', 'hull', 'alloy']) rows.push(['pick', k]);

  const FOE_TEXT = FOE_TIPS;   // shared doctrine — also powers the in-run codex cards
  const BOSS_TEXT = BOSS_TIPS;
  const PICK_TEXT = {
    gun: 'One more ordnance lane, up to six.',
    shield: 'Absorbs a single hit and rebuilds with the right refit.',
    over: 'Eleven seconds of extra thrust and fire rate.',
    pulse: 'Stores a nova charge. Clears every round on screen.',
    hull: 'A spare hull, up to six.',
    alloy: 'Currency. Spends in the hangar between runs.'
  };
  box.innerHTML = '';
  for (const [kind, key] of rows) {
    if (kind === 'th') {
      const d = document.createElement('div');
      d.className = 'th'; d.textContent = key;
      box.appendChild(d);
      continue;
    }
    const c = document.createElement('canvas');
    c.width = c.height = 92;
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 46, 46);
    let label, text;
    if (kind === 'foe') {
      g.scale(1.25, 1.25);
      FOE_ART[key](g, { type: key, col: PAL.foe, t: .4, glow: 0, flash: 0, ht: 0, swf: 0, ph: 0 });
      label = FOE_LABEL[key]; text = FOE_TEXT[key];
    } else if (kind === 'boss') {
      const def = BOSSES.find(b => b.id === key);
      g.scale(.28, .28);
      BOSS_ART[def.art](g, { col: PAL.foe, t: .5, glow: .4, spin: .4, phase: 1, nodes: def.nodes });
      label = def.name; text = BOSS_TEXT[key];
    } else {
      const spr = SPR[PICK_SPR[key]];
      g.globalAlpha = .45; g.drawImage(spr, -22, -22, 44, 44); g.globalAlpha = 1;
      g.strokeStyle = PICK_COL[key](); g.lineWidth = 1.3;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + PI / 6, x = Math.cos(a) * 13, y = Math.sin(a) * 13;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.stroke();
      drawPickIcon(g, key, 1);
      label = key === 'gun' ? 'Ordnance' : key === 'over' ? 'Overdrive' : key === 'pulse' ? 'Nova pulse'
        : key === 'hull' ? 'Spare hull' : key === 'alloy' ? 'Alloy' : 'Shield';
      text = PICK_TEXT[key];
    }
    const d = document.createElement('div');
    d.innerHTML = '<b>' + esc(label) + '</b><p>' + esc(text) + '</p>';
    box.appendChild(c);
    box.appendChild(d);
  }
  box.dataset.built = '1';   // only after a complete build — a mid-render crash must be retryable
}
function renderFeats() {
  const box = $('tab-feats');
  const done = FEATS.filter(f => META.feats[f.id]).length;
  box.innerHTML = '<div class="empty" style="padding:0 0 12px">' + done + ' of ' + FEATS.length + ' earned</div>' +
    FEATS.map(f => {
      const got = !!META.feats[f.id];
      // career feats carry prog(): [current, goal] straight from the same
      // counters their check reads — progress lives with the feat
      const prog = !got && f.prog ? f.prog() : null;
      if (prog) prog[0] = Math.min(prog[0], prog[1]);   // 2/1 reads wrong — clamp at the goal
      const sub = prog
        ? '<span style="color:var(--gold)">' + prog[0] + '/' + prog[1] + '</span> · ' + esc(f.desc)
        : esc(f.desc);
      return '<div class="row" style="grid-template-columns:1fr auto">' +
        '<span class="nm" style="' + (got ? 'color:var(--ink)' : 'color:var(--dimmer)') + '">' +
        esc(f.name) + '<br><span style="font-size:.62rem;color:var(--dim)">' + sub + '</span></span>' +
        '<span class="sc" style="' + (got ? '' : 'color:var(--dimmer)') + '">' + (got ? 'done' : '—') + '</span></div>';
    }).join('');
}
/* the Registry's Sky tab — the archive, newest first, with the career
   totals re-derived from the log so the ledger always sums honestly */
function renderSkyLog() {
  const box = $('tab-sky');
  /* explicit newest-first sort: appends are chronological and the merge
     sorts, but a skewed device clock must not scramble the ledger */
  const rows = META.skyLog.slice().sort((a, b) => b.t - a.t);
  /* display names + colors come from SKY_EVENTS (js/sky.js) — the single
     owner of what each sky event is called and how it's tinted */
  const KIND = Object.fromEntries(Object.entries(SKY_EVENTS).map(([k, ev]) =>
    [k, [ev.name, 'rgb(' + ev.rgb + ')']]));
  const when = t => {
    const d = new Date(t), days = (Date.now() - t) / 864e5;
    if (days < 1) return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (days < 7) return Math.ceil(days) + 'd ago';
    return (d.getMonth() + 1) + '/' + d.getDate();
  };
  /* the live streak is the audit's most-engaging stat — show it in the sky
     career header, amber while alive, gray once broken, absent for new pilots */
  const cur = META.sky.streakCur || 0, best = META.sky.streakBest || 0;
  const streak = (cur > 0 || best > 0)
    ? '<br><span style="color:' + (cur > 0 ? 'var(--amber)' : 'var(--dimmer)') + '">comet streak ' +
      (cur > 0 ? cur + ' alive' : 'none') + '</span>' +
      '<span style="color:var(--dimmer)"> · best ' + best + '</span>'
    : '';
  const head = '<div class="empty" style="padding:0 0 12px">' +
    META.sky.comets + ' comets · ' + META.sky.golden + ' golden · ' +
    META.sky.fleets + ' fleets · ' + META.sky.pyres + ' pyres' +
    (META.sky.escorts ? ' · ' + META.sky.escorts + (META.sky.escorts === 1 ? ' convoy' : ' convoys') : '') +
    ' — newest 60 kept' + streak + '</div>';
  if (!rows.length) { box.innerHTML = head + '<div class="empty">The sky has been quiet. It will not stay that way.</div>'; return; }
  box.innerHTML = head + rows.map(e => {
    const kind = KIND[e.k] || KIND.comet;
    return '<div class="row" style="grid-template-columns:1fr auto auto">' +
      '<span class="nm" style="color:' + kind[1] + '">' + kind[0] +
      ' <span style="color:var(--dimmer);font-size:.6rem">W' + pad2(e.w) + ' · ' +
      ((DIFF[e.d] || DIFF[1]).name) + (e.m && e.m !== 'endless' ? ' · ' + esc(e.m) : '') + '</span></span>' +
      '<span class="wv">' + when(e.t) + '</span>' +
      '<span class="sc">' + (e.a ? '+' + fmt(e.a) : '—') + '</span></div>';   // school/pyre/fleet paid nothing — an honest dash
  }).join('');
}
function switchTab(name) {
  /* the Global tab's content lives in the account sheet while it is open */
  if (name === 'global' && typeof CLOUD !== 'undefined' && CLOUD.closeSheet) CLOUD.closeSheet();
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
  ['scores', 'roster', 'feats', 'sky', 'global'].forEach(n => $('tab-' + n).classList.toggle('hidden', n !== name));
  if (name === 'roster') renderRoster();
  if (name === 'feats') renderFeats();
  if (name === 'sky') renderSkyLog();
  if (name === 'scores') renderBoard($('tab-scores'), boardMode(), null);
  if (name === 'global') NET.renderGlobal();
}

/* ─────────────────── hangar ─────────────────── */
function hullPreview(id, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  g.setTransform(2, 0, 0, 2, size, size);
  g.scale(size / 46, size / 46);
  (HULL_ART[id] || HULL_ART.vesper)(g, { thrust: 1, boost: false, t: 1 });
  return c;
}
function statBar(label, v) {
  return '<span>' + label + '</span><i><b style="transform:scaleX(' + clamp(v, .05, 1) + ')"></b></i>';
}
/* v4.2 sigil bay — wear one, price and all. Rush boards and drills
   fly vanilla (sigil stripped at launch, stated here, not hidden). */
function renderSigils() {
  const sgl = $('sigilList');
  if (!sgl) return;
  sgl.innerHTML = '';
  for (const g of [{ id: '', name: 'None', tier: '—', cost: 0, perk: 'Fly plain. No edge, no price.', weakness: '' },
    ...SIGILS]) {
    const owned = g.id === '' || (META.sigils || []).includes(g.id);
    const sel = (META.sigil || '') === g.id;
    const b = document.createElement('button');
    b.className = 'sigil' + (sel ? ' sel' : '') + (owned ? '' : ' locked');
    b.innerHTML =
      '<span class="sg-t ' + (g.tier || 'x') + '">' + (g.tier || '—') + '</span>' +
      '<span><b>' + esc(g.name) + '</b><p class="perk">' + esc(g.perk) + '</p>' +
      (g.weakness ? '<p class="price">Its price: ' + esc(g.weakness) + '</p>' : '') + '</span>' +
      '<span class="sg-buy ' + (sel ? 'worn' : owned ? '' : 'no') + '">' +
      (sel ? 'worn' : owned ? 'wear' : fmt(g.cost) + '<br>alloy') + '</span>';
    b.onclick = () => {
      AU.ui();
      if (sel) return;
      if (owned) { META.sigil = g.id || null; saveMeta(); renderHangar(); if (g.id) note(g.name + ' worn', 'good'); }
      else if (META.alloy >= g.cost) {
        META.alloy -= g.cost; META.sigils.push(g.id); META.sigil = g.id;
        saveMeta(); renderHangar(); note(g.name + ' acquired — read its price twice', 'rare'); AU.unlock();
      } else note('Need ' + fmt(g.cost - META.alloy) + ' more alloy', 'bad');
    };
    sgl.appendChild(b);
  }
  const worn = META.sigil && (META.sigils || []).includes(META.sigil);
  $('sigilNote').textContent = worn
    ? SIGILS.find(s => s.id === META.sigil).name + ' rides every flight (except drills and rush boards)'
    : 'Flying plain — no edge, no price';
}
/* yard donations — irreversible alloy → honor. Buttons ask twice. */
function renderDonations() {
  const box = $('donateBox');
  if (!box) return;
  box.innerHTML = '';
  const next = DONATIONS.find(t => META.donated < t.at);
  for (const t of [...DONATIONS].reverse()) {
    const earned = META.donated >= t.at;
    const d = document.createElement('div');
    d.className = 'ms' + (earned ? ' maxed' : '');
    d.innerHTML = '<b>' + esc(t.name) + '</b>' +
      '<span class="ms-l">' + fmt(t.at) + '</span>' +
      '<span class="ms-sub">' + (earned ? '✦ ' : '') + esc(t.perk) + '</span>';
    box.appendChild(d);
  }
  const b = document.createElement('button');
  b.className = 'up';
  if (next) {
    const need = next.at - META.donated;
    b.innerHTML = '<span><b>Donate to the yard</b><p>Alloy becomes honor. It does not come back. ' +
      'Next honor: ' + esc(next.name) + '.</p></span>' +
      '<span class="buy ' + (META.alloy >= need ? '' : 'no') + '">' + fmt(need) + '<br>to ' + esc(next.name) + '</span>';
    b.onclick = () => {
      AU.ui();
      const amount = next.at - META.donated;
      if (META.alloy < amount) { note('Need ' + fmt(amount - META.alloy) + ' more alloy', 'bad'); return; }
      /* confirm() is blocked when the arcade frames the game */
      askConfirm('Donate ' + fmt(amount) + ' alloy to the yard? Honor is permanent; the alloy is not.', 'Donate', () => {
        META.alloy -= amount;
        META.donated += amount;
        saveMeta();
        renderHangar();
        note('The yard thanks you — ' + next.name, 'rare');
        AU.unlock();
      });
    };
  } else {
    b.innerHTML = '<span><b>' + esc('Yardmaster') + '</b><p>' + esc('The highest honor is yours. The yard flies your colors.') + '</p></span>' +
      '<span class="buy max">✦ ' + fmt(META.donated) + '</span>';
    b.onclick = () => { AU.ui(); };   /* nothing left to buy — by design */
  }
  box.appendChild(b);
}
/* hull mastery — the docked hull leads the list with its live XP bar */
function renderMastery() {
  const msl = $('masteryList');
  if (!msl) return;
  msl.innerHTML = '';
  for (const h of [hull(), ...HULLS.filter(x => x.id !== META.ship)]) {
    const e = (META.mastery || {})[h.id] || { xp: 0 };
    const lvl = masteryLevel(h.id);
    const nxt = MASTERY_TIERS.find(t => t.lvl === lvl + 1);
    const floorXp = lvl ? MASTERY_TIERS[lvl - 1].xp : 0;
    const frac = nxt ? clamp((e.xp - floorXp) / (nxt.xp - floorXp), 0, 1) : 1;
    const d = document.createElement('div');
    d.className = 'ms' + (h.id === META.ship ? ' active' : '') + (lvl >= 5 ? ' maxed' : '');
    d.innerHTML = '<b>' + esc(h.name) + (h.id === META.ship ? ' · docked' : '') + '</b>' +
      '<span class="ms-l">' + (lvl ? 'M' + lvl : 'unflown') + '</span>' +
      '<span class="ms-bar"><i style="width:' + Math.round(frac * 100) + '%"></i></span>' +
      '<span class="ms-sub">' + (lvl ? MASTERY_TIERS[lvl - 1].sub : 'fly it to earn') +
      ' · ' + (plaqueOf((META.hullKills || {})[h.id] || 0)
        ? esc(plaqueOf((META.hullKills || {})[h.id] || 0).name) + ' · ' + fmt((META.hullKills || {})[h.id] || 0) + ' kills'
        : fmt((META.hullKills || {})[h.id] || 0) + ' kills') +
      (nxt ? ' · next ' + fmt(Math.max(0, nxt.xp - e.xp)) + ' xp' : ' · mastered') + '</span>';
    msl.appendChild(d);
  }
}
function renderHangar() {
  setText('alloyN', fmt(META.alloy));
  renderSigils();
  renderMastery();
  renderDonations();
  /* v4.1 paint shop — buy, equip, fly in it. High contrast keeps its white. */
  const pl = $('paintList');
  const hc = PAL.name === 'High contrast';
  $('dockName').textContent = hull().name;
  $('dockSub').textContent = META.ship === 'wraith' ? 'Recovered from the gate — it keeps its own color' :
    hc ? 'High contrast keeps its hull — paints apply on other styles' :
    PAINTS.find(p => p.id === META.paint).name + ' · worn in flight, on the boards';
  pl.innerHTML = '';
  for (const p of PAINTS) {
    const owned = META.paints.includes(p.id), sel = META.paint === p.id;
    const gifted = !!p.gift;   /* streak laurels: earned, never sold */
    const b = document.createElement('button');
    b.className = 'paint' + (sel ? ' sel' : '') + (owned ? '' : ' locked');
    const d = document.createElement('i');
    d.style.background = 'radial-gradient(circle at 34% 30%, ' + p.lit + ', ' + p.hull + ' 62%, rgba(0,0,0,.55))';
    b.appendChild(d);
    const lbl = document.createElement('b');
    lbl.textContent = owned ? (sel ? 'worn' : p.name) : (gifted ? p.giftDesc : fmt(p.cost));
    b.appendChild(lbl);
    b.onclick = () => {
      AU.ui();
      if (sel) return;
      if (owned) { META.paint = p.id; saveMeta(); applyPaint(); renderHangar(); }
      else if (gifted) note('Fly the Daily ' + (p.gift === 'streak14' ? '14' : '30') + ' days in a row to earn it', 'dim');
      else if (META.alloy >= p.cost) {
        META.alloy -= p.cost; META.paints.push(p.id); META.paint = p.id;
        saveMeta(); applyPaint(); renderHangar(); note(p.name + ' acquired', 'rare'); AU.unlock();
      } else note('Need ' + fmt(p.cost - META.alloy) + ' more alloy', 'bad');
    };
    pl.appendChild(b);
  }
  /* tour wall — world progress, sealed worlds glow green */
  const twl = $('tourWall');
  if (twl) {
    twl.innerHTML = '';
    for (let i = 0; i < STAGES.length; i++) {
      const s = STAGES[i];
      const d = document.createElement('div');
      const sealed = (META.tourBest || 0) > i;
      d.className = 'tw' + (sealed ? ' seal' : '');
      d.innerHTML = '<b>' + esc(s.name) + '</b><span>' +
        (sealed ? 'sealed · wave ' + ((META.tourRecords || {})['w' + i] || s.waves) : 'unsealed') + '</span>';      
      twl.appendChild(d);
    }
  }
  /* schematic hot-spots — refit locations pinned on the docked machine;
     the pip number is the installed level, click jumps to the row */
  const spots = $('dockSpots');
  if (spots) {
    spots.innerHTML = '';
    const at = { plating: [50, 68], ordnance: [50, 20], thrusters: [50, 86], capacitor: [50, 44], magnet: [27, 54], fortune: [73, 54] };
    for (const r of REFITS) {
      const b = document.createElement('button');
      b.className = 'spot';
      b.style.left = at[r.id][0] + '%';
      b.style.top = at[r.id][1] + '%';
      b.textContent = String(refit(r.id));
      b.title = r.name + ' — level ' + refit(r.id) + ' of ' + r.max;
      b.setAttribute('aria-label', b.title);
      b.onclick = () => {
        const row = [...document.querySelectorAll('#upList .up')].find(x => x.textContent.indexOf(r.name) >= 0);
        if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.focus(); AU.ui(); }
      };
      spots.appendChild(b);
    }
  }
  const hl = $('hullList');
  hl.innerHTML = '';
  for (const h of HULLS) {
    const owned = META.owned.includes(h.id);
    const sel = META.ship === h.id;
    const b = document.createElement('button');
    b.className = 'hull' + (sel ? ' sel' : '') + (owned ? '' : ' locked');
    b.appendChild(hullPreview(h.id, 31));
    const d = document.createElement('div');
    d.innerHTML =
      '<b>' + esc(h.name) + '</b>' +
      '<div class="cls">' + esc(h.cls) + '</div>' +
      '<p>' + esc(h.desc) + '</p>' +
      '<div class="bars">' +
      statBar('Hull', h.lives / 5) +
      statBar('Speed', h.speed / 1.3) +
      statBar('Guns', h.dmg / 1.4) +
      statBar('Score', h.scoreMul / 1.7) +
      '</div>' +
      (owned
        ? '<span class="cost' + (sel ? '' : ' no') + '">' + (sel ? 'Selected' : 'Tap to fly') + '</span>'
        : '<span class="cost' + (META.alloy >= h.cost ? '' : ' no') + '">' + fmt(h.cost) + ' alloy</span>');
    b.appendChild(d);
    b.onclick = () => {
      AU.ui();
      if (owned) { META.ship = h.id; saveMeta(); renderHangar(); }
      else if (META.alloy >= h.cost) {
        META.alloy -= h.cost; META.owned.push(h.id); META.ship = h.id;
        saveMeta(); renderHangar();
        note(h.name + ' acquired', 'rare'); AU.unlock();
      } else {
        note('Need ' + fmt(h.cost - META.alloy) + ' more alloy', 'bad');
      }
    };
    hl.appendChild(b);
  }
  const ul = $('upList');
  ul.innerHTML = '';
  for (const r of REFITS) {
    const lv = refit(r.id);
    const maxed = lv >= r.max;
    const price = maxed ? 0 : r.cost(lv);
    const can = !maxed && META.alloy >= price;
    const b = document.createElement('button');
    b.className = 'up';
    b.disabled = maxed;
    let dots = '';
    for (let i = 0; i < r.max; i++) dots += '<i class="' + (i < lv ? 'on' : '') + '"></i>';
    b.innerHTML =
      '<span><b>' + esc(r.name) + '</b><p>' + esc(r.desc) + '</p><span class="dots">' + dots + '</span></span>' +
      '<span class="buy ' + (maxed ? 'max' : can ? '' : 'no') + '">' + (maxed ? 'Max' : fmt(price) + '<br>alloy') + '</span>';
    b.onclick = () => {
      if (maxed) return;
      AU.ui();
      if (META.alloy >= price) {
        META.alloy -= price;
        META.refits[r.id] = lv + 1;
        saveMeta(); renderHangar();
        note(r.name + ' → ' + (lv + 1), 'good'); AU.pickup();
      } else note('Need ' + fmt(price - META.alloy) + ' more alloy', 'bad');
    };
    ul.appendChild(b);
  }
}

/* ─────────────────── screen flow ─────────────────── */
function showScreen(id, on) { const el = $(id); if (el) el.classList.toggle('on', on); }
function closeAllScreens() {
  if (typeof dismissAsk === 'function') dismissAsk();
  ['s-boot', 's-title', 's-hangar', 's-pause', 's-set', 's-over', 's-boons', 's-notes', 's-ask'].forEach(id => showScreen(id, false));
}
function blurActive() { const a = document.activeElement; if (a && a.blur) a.blur(); }
