'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   cloud.js — Supabase accounts + worldwide boards (ADR 0003).

   - Publishable key only (MIRROR_ORIGIN / MIRROR_KEY from mirror-public.js).
   - supabase-js v2 is VENDORED (js/vendor/supabase.js) and loaded lazily:
     only when a pilot opens the account panel, or already holds a session.
     Offline play, local scores and portal builds never touch it.
   - Writes go through the RPCs submit_score / set_callsign only; the
     database refuses direct table writes (RLS + no grants).
   ═══════════════════════════════════════════════════════════════════════ */
const CLOUD = {
  sb: null, user: null, profile: null, loading: null,
  STORE: 'sb-rgmbexmodebegllahotc-auth-token',

  available() {
    if (typeof emberfallPortal === 'function' && emberfallPortal()) return false;
    return typeof fetch === 'function' && typeof document !== 'undefined';
  },
  /* a session exists (or is arriving in the URL from an email confirmation link) */
  pending() {
    try {
      return /access_token=|[?&]code=/.test(location.hash + location.search) || !!localStorage.getItem(this.STORE);
    } catch (e) { return false; }
  },
  load() {
    if (!this.available()) return Promise.resolve(null);
    if (this.sb) return Promise.resolve(this.sb);
    if (this.loading) return this.loading;
    this.loading = new Promise(res => {
      const go = () => {
        try {
          this.sb = window.supabase.createClient(MIRROR_ORIGIN, MIRROR_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
          });
          this.sb.auth.onAuthStateChange(() => { setTimeout(() => this.refresh().then(() => this.paint()), 0); });
        } catch (e) { this.sb = null; }
        res(this.sb);
      };
      if (window.supabase && window.supabase.createClient) return go();
      const s = document.createElement('script');
      s.src = 'js/vendor/supabase.js';
      s.async = true;
      s.onload = go;
      s.onerror = () => { this.loading = null; res(null); };
      document.head.appendChild(s);
    });
    return this.loading;
  },
  async refresh() {
    const sb = await this.load();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    this.user = data && data.session ? data.session.user : null;
    if (this.user && this.user.is_anonymous) { try { await sb.auth.signOut(); } catch (e) { } this.user = null; }
    this.profile = null;
    if (this.user) {
      const { data: rows } = await sb.from('profiles').select('id,callsign,avatar').eq('id', this.user.id).limit(1);
      this.profile = rows && rows[0] ? rows[0] : null;
    }
    return this.user;
  },
  /* Guests need no account at all: no Supabase session, scores stay local
     (personal best). The database also refuses anonymous sessions, so the
     worldwide boards only ever hold signed-up pilots. */
  playGuest() {
    try { localStorage.setItem('ef.guest', '1'); } catch (e) { }
  },
  /* passwordless: one email carries a magic link AND a 6-digit code (the code
     works in installed apps where the link opens another browser) */
  async sendOtp(email) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const e = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Enter a valid email.');
    const { error } = await sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    this.otpEmail = e;
  },
  async verifyOtp(code) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const t = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(t)) throw new Error('Enter the code from the email.');
    const { error } = await sb.auth.verifyOtp({ email: this.otpEmail, token: t, type: 'email' });
    if (error) throw error;
    await this.refresh();
  },
  /* providers on in the Supabase dashboard (public settings endpoint) */
  async providers() {
    if (this._prov) return this._prov;
    try {
      const r = await fetch(MIRROR_ORIGIN + '/auth/v1/settings', { headers: { apikey: MIRROR_KEY } });
      this._prov = r.ok ? ((await r.json()).external || {}) : {};
    } catch (e) { this._prov = {}; }
    return this._prov;
  },
  async signInGoogle() {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw error;
  },
  async setAvatar(id) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { data, error } = await sb.rpc('set_avatar', { p_avatar: id });
    if (error) throw error;
    this.profile = data;
    return data;
  },
  /* guest -> account: offer this device's Endless best to the board once */
  async carryGuestBest() {
    if (!this.profile) return null;
    let key = 'ef.carried.' + this.user.id;
    try { if (localStorage.getItem(key)) return null; } catch (e) { return null; }
    const best = (typeof loadBoard === 'function' ? loadBoard('main') : [])
      .reduce((a, r) => (r && +r.s > (a ? +a.s : 0) ? r : a), null);
    try { localStorage.setItem(key, '1'); } catch (e) { }
    if (!best || !(+best.s >= 1)) return null;
    try { return await this.submit('main', +best.s, { wave: Math.max(1, +best.w || 1), ship: best.k, src: 'guest' }); } catch (e) { return null; }
  },
  async stats() {
    if (!this.user || typeof mirrorJson !== 'function') return null;
    const id = this.user.id, day = new Date().toISOString().slice(0, 10);
    const [g, d, n] = await Promise.all([
      mirrorJson('/rest/v1/leaderboard_global?mode=eq.endless&user_id=eq.' + id + '&select=score&limit=1').catch(() => []),
      mirrorJson('/rest/v1/leaderboard_daily?day=eq.' + day + '&user_id=eq.' + id + '&select=score&limit=1').catch(() => []),
      mirrorRest('/rest/v1/player_scores?user_id=eq.' + id + '&select=id', { headers: { Prefer: 'count=exact', Range: '0-0' } })
        .then(r => +((r.headers.get('content-range') || '').split('/')[1] || 0)).catch(() => 0)
    ]);
    const best = g[0] ? g[0].score : 0;
    const rank = best && typeof mirrorMainRank === 'function' ? await mirrorMainRank(best).catch(() => null) : null;
    return { best, rank, today: d[0] ? d[0].score : 0, runs: n };
  },
  async signUpEmail(email, password) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { data, error } = await sb.auth.signUp({
      email: String(email || '').trim(), password: String(password || ''),
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    await this.refresh();
    return !(data && data.session); /* true = confirmation email sent */
  },
  async signInEmail(email, password) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { error } = await sb.auth.signInWithPassword({ email: String(email || '').trim(), password: String(password || '') });
    if (error) throw error;
    await this.refresh();
  },
  async signOut() {
    const sb = await this.load(); if (!sb) return;
    await sb.auth.signOut();
    this.user = null; this.profile = null;
  },
  async setCallsign(cs) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { data, error } = await sb.rpc('set_callsign', { p_callsign: String(cs || '').trim() });
    if (error) throw error;
    this.profile = data;
    return data;
  },
  /* best-effort: the run is already saved locally before this is called */
  async submit(gameMode, score, stats) {
    const mode = MIRROR_MODE[gameMode];
    if (!mode || !this.sb || !this.user || this.user.is_anonymous || !this.profile) return null;
    const { data, error } = await this.sb.rpc('submit_score', { p_mode: mode, p_score: Math.trunc(score), p_stats: stats || {} });
    if (error) throw error;
    return data;
  },

  /* ── account panel in the Global tab ── */
  paint() {
    const box = document.getElementById('cloudBox');
    if (!box) return;
    const ap = document.getElementById('acctPanel');
    if (ap) ap.classList.toggle('hidden', !this.available());
    if (!this.available()) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const st = document.getElementById('cloudStatus');
    const signed = !!this.user;
    document.getElementById('cloudIn').classList.toggle('hidden', signed);
    document.getElementById('cloudMe').classList.toggle('hidden', !signed);
    this.paintTitle();
    this.paintProfile();
    if (!signed) { st.textContent = 'Playing as guest: scores stay on this device. Sign in or create an account to post worldwide.'; return; }
    const who = (this.user.email || 'pilot');
    const cs = document.getElementById('cloudCallsign');
    st.textContent = this.profile
      ? 'Signed in as ' + this.profile.callsign + ' (' + who + ') · endless and daily runs post worldwide.'
      : 'Signed in (' + who + ') · first flight: pick a callsign to post runs.';
    if (!this.profile && cs && !cs.value) { try { cs.focus(); } catch (e) { } }
    if (this.profile && !cs.value) cs.value = this.profile.callsign;
  },
  drawAv(canvas, id) {
    if (!canvas || typeof HULL_ART === 'undefined') return;
    const g = canvas.getContext('2d'), w = canvas.width;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, w);
    g.setTransform(w / 92, 0, 0, w / 92, w / 2, w / 2);
    try { (HULL_ART[id] || HULL_ART.vesper)(g, { thrust: 1, boost: false, t: 1 }); } catch (e) { }
  },
  paintProfile() {
    const av = (this.profile && this.profile.avatar) || 'vesper';
    this.drawAv(document.getElementById('pfAv'), av);
    const nm = document.getElementById('pfName');
    if (nm) nm.textContent = this.profile ? this.profile.callsign : 'New pilot';
    const pick = document.getElementById('avPick');
    if (pick && !pick.dataset.built && typeof AVATARS !== 'undefined') {
      pick.dataset.built = '1';
      for (const id of AVATARS) {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.av = id; b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', (typeof HULLS !== 'undefined' && (HULLS.find(h => h.id === id) || {}).name) || id);
        const c = document.createElement('canvas'); c.width = c.height = 72; b.appendChild(c);
        this.drawAv(c, id);
        b.addEventListener('click', async () => {
          if (!this.profile) { this.say('Save a callsign first.', true); return; }
          try { await this.setAvatar(id); this.say('Avatar saved.'); } catch (e) { this.say(String(e && e.message || e).slice(0, 140), true); }
          this.paint();
        });
        pick.appendChild(b);
      }
    }
    if (pick) pick.querySelectorAll('button').forEach(b => { const on = b.dataset.av === av; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    const st = document.getElementById('pfStats');
    if (st && this.user && this.profile && !this._statsBusy) {
      this._statsBusy = true;
      this.stats().then(x => {
        if (x) st.textContent = 'All-time best ' + (x.best || '—') + (x.rank ? ' · rank #' + x.rank : '') +
          ' · today ' + (x.today || '—') + ' · ' + x.runs + ' runs posted';
      }).finally(() => { this._statsBusy = false; });
    } else if (st && !this.profile) st.textContent = 'Pick a callsign to post runs and appear on the boards.';
  },
  /* title-screen account strip */
  paintTitle() {
    const meta = document.getElementById('acctMeta'), line = document.getElementById('acctLine');
    if (!meta || !line) return;
    const signed = !!this.user;
    meta.textContent = signed ? (this.profile ? this.profile.callsign : 'Signed in') : 'Guest';
    line.textContent = !signed
      ? 'Guest runs stay on this device. Sign up to post on the worldwide boards.'
      : this.profile ? 'Your endless and daily runs post to the worldwide boards.'
      : 'Signed in. Pick a callsign in the Global tab to start posting.';
    const pn = document.getElementById('pilotName'), ps = document.getElementById('pilotSub');
    if (pn) pn.textContent = signed ? (this.profile ? this.profile.callsign : 'Signed in') : 'Guest';
    if (ps) ps.textContent = signed ? (this.profile ? 'Profile · posting worldwide' : 'Pick a callsign') : 'Sign in · post worldwide';
    this.drawAv(document.getElementById('pilotAv'), (this.profile && this.profile.avatar) || 'vesper');
    const sb = document.getElementById('btnAcctSign');
    if (sb) sb.firstChild.textContent = signed ? 'Account' : 'Sign in / Sign up';
  },
  /* game over: guests (or no callsign yet) get "Sign up to post this score" */
  overPrompt(eligible) {
    const el = document.getElementById('ovCloud');
    if (!el) return;
    el.classList.toggle('hidden', !(eligible && this.available() && !this.profile));
  },
  showAccount() {
    if (typeof toTitle === 'function' && !document.getElementById('s-title').classList.contains('on')) toTitle();
    if (typeof switchTab === 'function') switchTab('global');
    this.open().catch(() => {});
    const em = document.getElementById(this.user ? 'cloudCallsign' : 'cloudEmail');
    if (em) { try { em.scrollIntoView({ block: 'center' }); if (!matchMedia('(pointer:coarse)').matches) em.focus(); } catch (e) { } }
  },
  say(msg, bad) {
    const el = document.getElementById('cloudMsg');
    if (!el) return;
    el.textContent = msg;
    el.style.color = bad ? 'var(--crimson)' : 'var(--dim)';
  },
  wire() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    const val = id => (document.getElementById(id) || {}).value || '';
    const run = fn => async () => {
      try { await fn(); this.paint(); } catch (e) { this.paint(); this.say(String(e && e.message || e).slice(0, 140), true); }
    };
    on('cloudSignIn', run(async () => { await this.signInEmail(val('cloudEmail'), val('cloudPass')); this.say(this.profile ? 'Signed in.' : 'Signed in. Pick your callsign to post runs.'); }));
    on('cloudSignUp', run(async () => {
      const pending = await this.signUpEmail(val('cloudEmail'), val('cloudPass'));
      this.say(pending ? 'Check your inbox to confirm your email, then sign in.' : 'Account created. Pick your callsign to post runs.');
    }));
    on('cloudOtp', run(async () => {
      await this.sendOtp(val('cloudEmail'));
      const row = document.getElementById('cloudCodeRow'); if (row) row.classList.remove('hidden');
      this.say('Check your inbox: tap the link, or type the code here.');
      const c = document.getElementById('cloudCode'); if (c) try { c.focus(); } catch (e) { }
    }));
    on('cloudVerify', run(async () => { await this.verifyOtp(val('cloudCode')); this.say(this.profile ? 'Signed in.' : 'Signed in. Pick your callsign to post runs.'); }));
    on('cloudGoogle', run(async () => { await this.signInGoogle(); }));
    on('btnPilot', () => this.showAccount());
    on('btnBoards', () => {
      this.showAccount();
      const b = document.getElementById('globalBody'); if (b) try { b.scrollIntoView({ block: 'start' }); } catch (e) { }
    });
    /* the virtual keyboard must not cover the field being typed in */
    document.querySelectorAll('#cloudBox input').forEach(i => i.addEventListener('focus', () => {
      setTimeout(() => { try { i.scrollIntoView({ block: 'center' }); } catch (e) { } }, 300);
    }));
    if (window.visualViewport) visualViewport.addEventListener('resize', () => {
      const a = document.activeElement;
      if (a && a.closest && a.closest('#cloudBox')) try { a.scrollIntoView({ block: 'center' }); } catch (e) { }
    });
    on('cloudGuest', () => { this.playGuest(); this.say('Playing as guest: scores stay on this device.'); });
    on('btnAcctGuest', () => { this.playGuest(); if (typeof startRun === 'function') startRun('endless'); });
    on('btnAcctSign', () => this.showAccount());
    on('btnOvSignUp', () => this.showAccount());
    on('cloudSave', run(async () => {
      await this.setCallsign(val('cloudCallsign'));
      const carried = await this.carryGuestBest();
      this.say(carried ? 'Callsign saved. Your guest best is on the board.' : 'Callsign saved.');
    }));
    on('cloudOut', run(async () => { await this.signOut(); this.say('Signed out. Local scores stay on this device.'); }));
  },
  async open() {
    this.paint();
    if (!this.available()) return;
    /* only once the pilot opens the account UI: boot stays off the network */
    this.providers().then(p => { const g = document.getElementById('cloudGoogle'); if (g) g.classList.toggle('hidden', !p.google); });
    await this.refresh();
    this.paint();
  },
  boot() {
    if (!this.available()) return;
    this.wire();
    this.paint();
    if (this.pending()) this.refresh().then(() => this.paint()).catch(() => {});
  }
};
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => CLOUD.boot());
  else CLOUD.boot();
}
