/* NET + OUTBOX — command-deck client, durable score queue — extracted from the original monolith.
   Classic script: shares globals with index.html's inline core. Load order
   is enforced in index.html; file:// play still works. */
/* ═══════════════════════════ command deck client ═══════════════════════ */
/* Talks to the self-hosted backend (server.js) when it is reachable.
   Every path degrades silently to pure-local play — the game never
   blocks, never errors, and never requires the network. */
const NET = {
  on: false, user: null, probed: false,
  hdrs: { 'Content-Type': 'application/json', 'X-Emberfall': 'command-deck' },
  meDaily: null,   /* last /api/me daily block — streak display on the day board */

  async probe() {
    if (this.probed) return this.on;
    this.probed = true;
    try {
      const ctl = new AbortController(); const kill = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch('/api/health', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(kill);
      if (!r.ok) return false;
      const j = await r.json();
      this.on = !!(j && j.ok);
      if (this.on) await this.whoami();
    } catch (e) { this.on = false; }
    if (this.on) this.pushProfile();          // converge any local changes made offline
    return this.on;
  },

  async req(method, path, body) {
    const r = await fetch(path, {
      method, headers: this.hdrs, credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) {
      // status rides the error so callers can tell definitive rejections
      // (422 — never retry) from transient failures (offline, 429, 5xx)
      const err = new Error(j.error || ('http ' + r.status));
      err.status = r.status;
      throw err;
    }
    return j;
  },

  async whoami() {
    try {
      const j = await this.req('GET', '/api/me');
      this.user = j.user || null;
      this.meDaily = j.daily || null;
      if (j.user && j.profile) { this.mergeProfile(j.profile); kickOutbox(); this.vaultOfferRestore(); }
      return this.user;
    } catch (e) { this.user = null; this.meDaily = null; return null; }
  },

  async register(name, password) { const j = await this.req('POST', '/api/register', { name, password }); this.user = j.user || { name }; return j; },
  async login(name, password)    { const j = await this.req('POST', '/api/login', { name, password }); this.user = j.user || { name }; if (j.profile) { this.mergeProfile(j.profile); kickOutbox(); this.vaultOfferRestore(); } return j; },
  async logout() {
    try { await this.req('POST', '/api/logout'); } catch (e) { }
    this.user = null;
  },

  /* ---- the vault: deck-side rolling profile snapshots (read-only) ----
     The server snapshots on real deltas; restoring is a local replace +
     a normal profile push, so the deck never overwrites a live profile
     on behalf of a snapshot. */
  /* replace the local save with a validated snapshot, then push the
     result as a normal profile write (shared by panel + boot offer) */
  async applySnapshot(clean) {
    Object.assign(META, clean);
    META.owned = Array.from(new Set(['vesper'].concat(clean.owned)));
    META.paints = Array.from(new Set(['yard'].concat(clean.paints)));
    META.sigils = Array.from(new Set([''].concat(clean.sigils)));
    saveMeta();
    renderHangar();
    await this.pushProfile();
  },

  /* boot-time restore offer: if the deck remembers a clearly richer save
     than this device carries (wiped browser, new device, wrecked store),
     say so once per day and put it back on acceptance. */
  async vaultOfferRestore() {
    try {
      if (!this.on || !this.user || GAME.state === 'playing') return;
      if (DB.get('vaultOfferSeen', '') === todaySeedKey()) return;
      const snaps = await this.listSnaps().catch(() => null);
      if (!snaps || !snaps.length) return;
      const newest = await this.readSnap(snaps[0].taken).catch(() => null);
      const clean = sanitizeSnapMeta(newest && newest.meta);
      if (!vaultOfferWorthy(clean, META)) return;
      const when = new Date(snaps[0].taken).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      DB.set('vaultOfferSeen', todaySeedKey());          // asked today — accepted or not
      const owned = clean.owned.length, alloy = clean.alloy || 0;
      if (!confirm('The deck remembers a richer save from ' + when + ' (' + owned +
        (owned === 1 ? ' hull' : ' hulls') + ', ' + alloy + ' alloy). Restore it on this device? Your current progress here will be replaced.')) return;
      await this.applySnapshot(clean);
      note('Vault restored from ' + when, 'good');
    } catch (e) { /* an offer must never break boot */ }
  },

  async listSnaps() {
    const j = await this.req('GET', '/api/profile/snaps');
    return j.snaps || [];
  },
  async readSnap(taken) {
    const j = await this.req('GET', '/api/profile/snaps/' + Math.floor(Number(taken) || 0));
    return j.data || null;
  },

  /* cloud save: push local meta+cfg, adopt server copy if it is newer.
     The server is the tiebreaker on equal timestamps? No — local wins
     ties, because the local copy includes the live session's changes. */
  async pushProfile() {
    if (!this.on || !this.user) return;
    try {
      const stamp = DB.get('meta.updated', 0) || Date.now() - 1;
      const j = await this.req('PUT', '/api/profile', {
        meta: META, cfg: CFG, updated: stamp
      });
      if (j.conflicted && j.profile) this.mergeProfile(j.profile);
    } catch (e) { /* offline progress stays local; retried next visit */ }
  },

  mergeProfile(profile) {
    try {
      const srv = profile.data || {};
      const localT = DB.get('meta.updated', 0);
      if ((profile.updated || 0) <= localT) return;   // local is newer or equal
      if (srv.meta && typeof srv.meta === 'object') {
        const sMeta = srv.meta;
        META.alloy = Math.max(META.alloy, +sMeta.alloy || 0);
        META.runs = Math.max(META.runs, +sMeta.runs || 0);
        META.totalKills = Math.max(META.totalKills, +sMeta.totalKills || 0);
        META.bestWave = Math.max(META.bestWave, +sMeta.bestWave || 0);
        if (Array.isArray(sMeta.owned)) for (const id of sMeta.owned) {
          if (HULLS.some(h => h.id === id) && !META.owned.includes(id)) META.owned.push(id);
        }
        if (sMeta.ship && META.owned.includes(sMeta.ship)) META.ship = sMeta.ship;
        if (sMeta.refits) for (const r of REFITS) {
          META.refits[r.id] = Math.max(META.refits[r.id] || 0, clamp(+sMeta.refits[r.id] || 0, 0, r.max));
        }
        if (sMeta.feats) for (const k in sMeta.feats) if (!META.feats[k]) META.feats[k] = sMeta.feats[k];
        if (sMeta.sky && typeof sMeta.sky === 'object') for (const k of ['comets', 'golden', 'fleets', 'pyres', 'escorts', 'streakCur', 'streakBest'])
          META.sky[k] = Math.max(META.sky[k] || 0, +sMeta.sky[k] || 0);   // sky career counters travel with the account
        if (sMeta.codex && typeof sMeta.codex === 'object')
          META.codex = Object.assign({}, sMeta.codex, META.codex);   // seen is seen — union wins
        if (Array.isArray(sMeta.skyLog)) {
          // sky archive: union by timestamp+kind so merged devices interleave
          const seen = new Set(META.skyLog.map(e => e.t + ':' + e.k));
          for (const e of sMeta.skyLog) {
            const key = (e && e.t) + ':' + (e && e.k);
            if (!seen.has(key)) { META.skyLog.push(e); seen.add(key); }
          }
          META.skyLog.sort((a, b) => a.t - b.t);
          if (META.skyLog.length > 60) META.skyLog.splice(0, META.skyLog.length - 60);
        }
        saveMeta();
      }
      if (srv.cfg && typeof srv.cfg === 'object') {
        for (const k in CFG) if (k in srv.cfg) CFG[k] = srv.cfg[k];
        saveCfg();
      }
    } catch (e) { /* a malformed cloud profile must never break boot */ }
  },

  /* submit a finished run with its provenance; returns { rank, verdict } or null */
  async  submitScore(mode, score, wave, ship, diff, tele, extra) {
    if (!this.on || !this.user) return null;
    // no catch: callers need the error status to decide queue vs drop
    return this.req('POST', '/api/scores', {
      mode, score, wave, ship, diff,
      runT: tele ? tele.runT : 0, kills: tele ? tele.kills : 0,
      cps: tele ? tele.cps : [],
      paint: extra && extra.paint ? String(extra.paint).slice(0, 24) : null,
      mastery: extra && extra.mastery ? Math.floor(Number(extra.mastery)) || 0 : 0
    }).then(j => ({ rank: j.rank, top: j.top, verdict: j.verdict, season: j.season, seasonMe: j.seasonMe,
      daily: j.daily }));
  },

  async fetchBoard(mode) {
    if (!this.on) return null;
    try {
      const j = await this.req('GET', '/api/scores?mode=' + encodeURIComponent(mode));
      return j;
    } catch (e) { return null; }
  },

  /* the shared Daily Gauntlet board: day is the seed contract itself, so a
     board can never disagree with a run about what "today" was */
  async fetchDayBoard(day) {
    if (!this.on) return null;
    return this.req('GET', '/api/scores?mode=daily&day=' + encodeURIComponent(day));
  },

  async fetchSeason() {
    if (!this.on) return null;
    try { return await this.req('GET', '/api/season'); } catch (e) { return null; }
  },

  async renderSeason() {
    const box = $('seasonBox');
    if (!box) return;
    const j = await this.fetchSeason();
    if (!j || !j.season) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    $('seasonName').textContent = j.season;
    const left = Math.max(0, (j.ends || 0) - Date.now());
    const d = Math.floor(left / 86400000), h = Math.floor(left % 86400000 / 3600000);
    $('seasonTimer').textContent = d > 0 ? d + 'd ' + h + 'h remaining' : h + 'h remaining';
    const bd = $('seasonBoard');
    bd.innerHTML = (j.top && j.top.length)
      ? j.top.map((r, i) => {
          const medal = i < 3 ? 'color:var(--gold)' : '';
          return '<div class="row">' +
            '<span class="rk" style="' + medal + '">' + pad2(i + 1) + '</span>' +
            '<span class="nm">' + esc(r.n) + '</span>' +
            '<span class="sc">' + fmt(r.pts) + '</span>' +
            '<span class="wv">' + r.runs + ' runs</span></div>';
        }).join('')
      : '<div class="empty">No plausibility-checked runs this week yet.<br>The ladder is wide open.</div>';
    const you = $('seasonYou');
    if (j.me && j.me.runs > 0) {
      you.classList.remove('hidden');
      you.innerHTML = '<div class="row me"><span class="rk">#' + j.me.rank + '</span>' +
        '<span class="nm">' + esc(this.user ? this.user.name : 'you') + '</span>' +
        '<span class="sc">' + fmt(j.me.pts) + '</span><span class="wv">' + j.me.runs + ' runs</span></div>';
    } else you.classList.add('hidden');
  },

  /* ── duels: send today's best ghost to another pilot ── */
  async sendDuel(to, ghost) {
    if (!this.on || !this.user) return null;
    try {
      return await this.req('POST', '/api/challenges', {
        to, day: todaySeedKey(), score: ghost.score, wave: 1,
        ship: ghost.ship, ghost: { frames: ghost.frames, paint: META.paint }, paint: META.paint
      });
    } catch (e) { return { error: String((e && e.message) || e) }; }
  },

  async inbox() {
    if (!this.on || !this.user) return null;
    try { return await this.req('GET', '/api/challenges'); } catch (e) { return null; }
  },

  async fetchGhost(id) {
    if (!this.on) return null;
    try { return await this.req('GET', '/api/challenges/ghost?id=' + id); } catch (e) { return null; }
  },

  async beatDuel(id, run) {
    if (!this.on) return null;
    try {
      return await this.req('POST', '/api/challenges/beat', {
        id, score: run.score, wave: run.wave, diff: run.diff,
        runT: run.runT, kills: run.kills, cps: run.cps
      });
    } catch (e) { return null; }
  },

  async renderDuels() {
    const box = $('duelBox');
    if (!box) return;
    const j = await this.inbox();
    if (!j || !j.list || !j.list.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const bd = $('duelList');
    bd.innerHTML = '';
    for (const c of j.list) {
      const row = document.createElement('button');
      row.className = 'up';
      row.style.textAlign = 'left';
      const cpt = c.paint && PAINTS.find(x => x.id === c.paint);
      row.innerHTML = '<span><b style="letter-spacing:.16em">' +
        (cpt ? '<i class="pdot" style="background:' + cpt.hull + '"></i>' : '') +
        esc(c.from_name) +
        ' challenges you</b><p style="font-size:.62rem;color:var(--dim);margin-top:3px">Today\'s run · ' +
        fmt(c.score) + ' pts · W' + pad2(c.wave || 1) +
        (c.beaten ? ' · <span style="color:var(--mint)">BEATEN</span>' : ' · open') + '</p></span>';
      row.onclick = async () => {
        AU.ui();
        const g = await this.fetchGhost(c.id);
        if (!g || !g.ghost) { note('Duel ghost unavailable', 'bad'); return; }
        DB.set('ghost.rival', { score: c.score, ship: g.ghost.ship, frames: g.ghost.frames, paint: g.ghost.paint || 'yard', duelId: c.id });
        note('Rival ghost armed — fly Today\'s run', 'good');
        toTitle();
      };
      bd.appendChild(row);
    }
  },

  /* render into the title screen Global tab */
  async renderGlobal() {
    const status = $('globalStatus'), body = $('globalBody');
    if (!status) return;
    await this.probe();
    if (!this.on) {
      status.textContent = 'Command deck offline — playing in local mode.\nHost server.js to enable accounts and worldwide boards.';
      body.classList.add('hidden');
      return;
    }
    status.textContent = 'Linked to command deck' + (this.user ? ' · signed in as ' + this.user.name : '');
    body.classList.remove('hidden');
    this.renderSeason();
    this.renderDuels();
    this.renderDayBoard();
    const j = await this.fetchBoard(boardMode());
    const box = $('globalBoard');
    if (!j || !j.top || !j.top.length) {
      box.innerHTML = '<div class="empty">No worldwide runs yet.<br>Be the first. Make it count.</div>';
    } else {
      box.innerHTML = j.top.map((r, i) => {
        const h = HULLS.find(x => x.id === r.ship);
        const mine = this.user && r.n === this.user.name;
        const gpt = r.p && PAINTS.find(x => x.id === r.p);
        const gstar = honor && honor.at >= 25000 && mine ? '<span style="color:var(--gold)">✦ </span>' : '';
        return '<div class="row' + (mine ? ' me' : '') + '">' +
          '<span class="rk">' + pad2(i + 1) + '</span>' +
          '<span class="nm">' + (gpt ? '<i class="pdot" style="background:' + gpt.hull + '"></i>' : '') + gstar +
          esc(r.n) + (h ? ' · ' + esc(h.name) : '') +
          (r.m ? ' <span style="color:var(--gold);font-size:.6rem">M' + r.m + '</span>' : '') + '</span>' +
          '<span class="sc">' + padN(r.s, 7) + '</span>' +
          '<span class="wv">W' + pad2(r.w || 1) + '</span></div>';
      }).join('');
    }
    const you = $('globalYou');
    if (j && j.me) {
      you.classList.remove('hidden');
      you.innerHTML = '<div class="row me"><span class="rk">#' + j.me.rank + '</span>' +
        '<span class="nm">' + esc(j.me.name) + '</span>' +
        '<span class="sc">' + padN(j.me.s, 7) + '</span><span class="wv">you</span></div>';
    } else you.classList.add('hidden');
    $('globalSignin').classList.toggle('hidden', !!this.user);
  },

  /* today's gauntlet, worldwide — everyone flew the same seed */
  async renderDayBoard() {
    const box = $('dailyBoard'), stat = $('dailyStat'), you = $('dailyYou');
    if (!box) return;
    const day = todaySeedKey();
    stat.textContent = 'today · ' + day + ' · ' + todayMutator().name;
    box.innerHTML = '<div class="empty">Reading today\u2019s gauntlet…</div>';
    if (!this.on) { box.innerHTML = '<div class="empty">Deck offline — the day board needs the command deck.</div>'; you.classList.add('hidden'); return; }
    const dj = await this.fetchDayBoard(day).catch(() => null);
    if (!dj) { box.innerHTML = '<div class="empty">The day board could not be reached.</div>'; you.classList.add('hidden'); return; }
    if (!dj.top || !dj.top.length) {
      box.innerHTML = '<div class="empty">Nobody has flown today\u2019s seed.<br>The first one is yours.</div>';
    } else {
      box.innerHTML = dj.top.map((r, i) => {
        const h = HULLS.find(x => x.id === r.ship);
        const mine = this.user && r.n === this.user.name;
        const pt = r.p && PAINTS.find(x => x.id === r.p);
        const dstar = honorOf(META.donated || 0) && honorOf(META.donated || 0).at >= 25000 && mine ? '<span style="color:var(--gold)">✦ </span>' : '';
        /* v4.10 medal pips: the deck's ledger says what this pilot earned today */
        const pips = medalPips(dj.md && dj.md[r.n]);
        return '<div class="row' + (mine ? ' me' : '') + '">' +
          '<span class="rk">' + pad2(i + 1) + '</span>' +
          '<span class="nm">' + (pt ? '<i class="pdot" style="background:' + pt.hull + '"></i>' : '') + dstar +
          esc(r.n) + (h ? ' · ' + esc(h.name) : '') + '</span>' +
          '<span class="sc">' + padN(r.s, 7) + '</span>' +
          '<span class="wv">D' + pad2(r.w || 1) + pips + '</span></div>';
      }).join('');
    }
    if (dj.me) {
      you.classList.remove('hidden');
      const streak = this.meDaily && this.meDaily.streak > 1 ? ' · streak ' + this.meDaily.streak : '';
      const myPips = medalPips(dj.me.mds);
      you.innerHTML = '<div class="row me"><span class="rk">#' + dj.me.rank + '</span>' +
        '<span class="nm">' + esc(dj.me.name) + '</span>' +
        '<span class="sc">' + padN(dj.me.s, 7) + '</span><span class="wv">you · today' + streak + myPips + '</span></div>';
    } else you.classList.add('hidden');
  }
};

/* restore-worthiness: the deck must remember clearly MORE than this device —
   richer ownership or a strictly longer service record. Equal-or-lesser
   snapshots stay in the panel; boot never nags over nothing. */
function vaultOfferWorthy(clean, local) {
  if (!clean) return false;
  return clean.owned.length > (local.owned || []).length ||
    (clean.totalKills || 0) > (local.totalKills || 0);
}

/* v4.10 medal pips: render the deck's earned-medal names as a compact
   gold tag — pure so the suite pins its exact output. Always gold: medals
   are achievements, and they must never read as a second callsign color. */
function medalPips(md) {
  if (!md || !md.length) return '';
  return ' <span style="color:var(--gold)">' + md.map(esc).join('·') + '</span>';
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
      ((DIFF[e.d] || DIFF[1]).name) + (e.m && e.m !== 'endless' ? ' · ' + e.m : '') + '</span></span>' +
      '<span class="wv">' + when(e.t) + '</span>' +
      '<span class="sc">' + (e.a ? '+' + fmt(e.a) : '—') + '</span></div>';   // school/pyre/fleet paid nothing — an honest dash
  }).join('');
}
function switchTab(name) {
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
      if (!confirm('Donate ' + fmt(amount) + ' alloy to the yard? Honor is permanent; the alloy is not.')) return;
      META.alloy -= amount;
      META.donated += amount;
      saveMeta();
      renderHangar();
      note('The yard thanks you — ' + next.name, 'rare');
      AU.unlock();
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
  ['s-boot', 's-title', 's-hangar', 's-pause', 's-set', 's-over', 's-boons', 's-notes'].forEach(id => showScreen(id, false));
}
function blurActive() { const a = document.activeElement; if (a && a.blur) a.blur(); }

/* ══════════════════════════════════════════════════════════════════════
   OUTBOX — finished runs always survive. A score that cannot post right
   now (offline, rate-limited, deck down) is queued durably in localStorage
   and drained automatically whenever the deck is reachable again — online
   or freshly signed-in. Accepted community scores are never lost to a dropped
   connection, and stale runs are never resurrected: anything older than
   3 days (or that would finish the daily of a day already closed) is
   dropped at drain time so the ladder stays honest.
   ══════════════════════════════════════════════════════════════════════ */
const OUTBOX = {
  MAX: 10, MAX_AGE: 3 * 864e5,
  load() { const q = DB.get('outbox', []); return Array.isArray(q) ? q : []; },
  save(q) { DB.set('outbox', q.slice(-this.MAX)); },
  /* pure: which queued entries may still post — freshness cap, and no
     posting a daily after its day has rotated out. Tested in selftests. */
  fresh(q) {
    const now = Date.now();
    return q.filter(e => now - e.at <= this.MAX_AGE &&
      !(e.mode === 'daily' && e.day && e.day !== todaySeedKey()));
  },
  queue(entry) {
    const q = this.load();
    q.push({
      mode: entry.mode, score: entry.score, wave: entry.wave, ship: entry.ship,
      diff: entry.diff, runT: entry.runT, kills: entry.kills, cps: entry.cps, paint: entry.paint || null,
      day: entry.mode === 'daily' ? todaySeedKey() : null,
      at: Date.now()
    });
    this.save(q);
  },
  drainIfPossible() {
    let q = this.load();
    if (!q.length || !NET.on || !NET.user) return Promise.resolve(0);
    // stale guard: too-old runs, and daily runs whose day has rotated out
    // (a daily posted a day late would pollute a ladder nobody raced)
    q = this.fresh(q);
    this.save(q);
    if (!q.length) return Promise.resolve(0);
    const head = q[0];
    return NET.submitScore(head.mode, head.score, head.wave, head.ship, head.diff,
      { runT: head.runT, kills: head.kills, cps: head.cps }, head.paint ? { paint: head.paint } : null)
      .then(r => {
        if (!r) return 0;                      // deck vanished mid-drain — retry later
        const rest = this.load().filter(e => e.at !== head.at);
        this.save(rest);
        try {
          note(r.verdict === 'rejected'
            ? 'Queued run failed plausibility checks — discarded'
            : 'Recovered — queued run posted · rank #' + r.rank,
            r.verdict === 'rejected' ? 'bad' : 'good');
        } catch (e) { }
        return 1 + this.drainIfPossible();
      })
      .catch(err => {
        // definitive server rejection (422): drop the head, never retry it
        if (err && (err.status === 422 || err.status === 400)) {
          this.save(this.load().filter(e => e.at !== head.at));
          try { note('Queued run failed plausibility checks — discarded', 'bad'); } catch (e) { }
          return 1 + this.drainIfPossible();
        }
        return 0;                            // transient — try again later
      });
  }
};
let outboxTimer = 0;
function kickOutbox() {
  clearTimeout(outboxTimer);
  outboxTimer = setTimeout(() => { OUTBOX.drainIfPossible().then(n => { if (n > 0) kickOutbox(); }); }, 2500);
}
