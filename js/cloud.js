'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   cloud.js — Supabase accounts + worldwide boards (ADR 0003).

   - Publishable key only (MIRROR_ORIGIN / MIRROR_KEY from mirror-public.js).
   - supabase-js v2 is VENDORED (js/vendor/supabase.js) and loaded lazily:
     only when a pilot opens the account panel, or already holds a session.
     Offline play, local scores and portal builds never touch it.
   - Writes go through submit_run_v2 (run receipts), submit_score (legacy
     compatibility) and set_callsign; the database refuses direct table writes
     (RLS + no grants).
   ═══════════════════════════════════════════════════════════════════════ */
const CLOUD = {
  sb: null, user: null, profile: null, loading: null,
  STORE: 'sb-rgmbexmodebegllahotc-auth-token',
  RUN_KEY: 'ef.pendingRun',
  _postingMode: null,
  _pendingPromise: null,
  _pendingDelivered: false,
  _pendingUser: null,

  /* Posting consent is independent of Auth. Keep the old guest flag so a
     previously chosen local-only session stays local after upgrading. */
  postingMode() {
    if (this._postingMode) return this._postingMode;
    try { return localStorage.getItem('ef.guest') === '1' ? 'guest' : 'account'; }
    catch (e) { return 'guest'; }
  },
  setPostingMode(mode) {
    if (mode !== 'guest' && mode !== 'account') return;
    this._postingMode = mode;
    try { localStorage.setItem('ef.guest', mode === 'guest' ? '1' : '0'); this._postingMode = null; } catch (e) { }
    this.paint();
  },
  canPost() {
    return this.available() && this.postingMode() === 'account' && !!this.sb &&
      !!this.user && !this.user.is_anonymous && !!this.profile;
  },
  useAccount() {
    if (!this.user || this.user.is_anonymous) return;
    this.setPostingMode('account');
    this.deliverPending().catch(() => { });
  },

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
    const uid = this.user && this.user.id || null;
    if (uid !== this._pendingUser) { this._pendingUser = uid; this._pendingDelivered = false; }
    if (this.canPost()) {
      try { await this.deliverPending(); } catch (e) { }
    }
    return this.user;
  },
  /* Guests need no account at all: no Supabase session, scores stay local
     (personal best). The database also refuses anonymous sessions, so the
     worldwide boards only ever hold signed-up pilots. */
  playGuest() {
    this.setPostingMode('guest');
  },
  /* passwordless: one email carries a magic link AND a 6-digit code (the code
     works in installed apps where the link opens another browser) */
  async sendOtp(email) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const e = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Enter a valid email.');
    const { error } = await sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    this.rememberOtp(e, 'email');
  },
  /* resend the sign-up confirmation (a new pilot whose first email never came,
     or a password sign-in refused with email_not_confirmed) */
  async resendSignup(email) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const e = String(email || this.otpEmail || '').trim();
    const { error } = await sb.auth.resend({ type: 'signup', email: e, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    this.rememberOtp(e, 'signup');
  },
  /* the pending code survives a reload: on phones, switching to the mail app
     often discards the tab */
  rememberOtp(e, kind) {
    this.otpEmail = e; this.otpKind = kind || 'email';
    try { localStorage.setItem('ef.otp', JSON.stringify({ e, k: this.otpKind, t: Date.now() })); } catch (x) { }
  },
  restoreOtp() {
    try {
      const o = JSON.parse(localStorage.getItem('ef.otp') || 'null');
      if (o && o.e && Date.now() - o.t < 15 * 60e3) { this.otpEmail = o.e; this.otpKind = o.k || 'email'; return o; }
    } catch (x) { }
    return null;
  },
  forgetOtp() { this.otpEmail = null; try { localStorage.removeItem('ef.otp'); } catch (x) { } },
  async verifyOtp(code) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const t = String(code || '').replace(/\D+/g, '');
    if (!/^\d{6,10}$/.test(t)) throw new Error('Enter the code from the email.');
    let { error } = await sb.auth.verifyOtp({ email: this.otpEmail, token: t, type: 'email' });
    /* a brand-new pilot's first email is a sign-up confirmation: its code verifies as 'signup' */
    if (error && /expired|invalid|not found/i.test(error.message || '')) {
      const r = await sb.auth.verifyOtp({ email: this.otpEmail, token: t, type: 'signup' });
      if (!r.error) error = null;
    }
    if (error) throw error;
    this.forgetOtp();
    await this.refresh();
  },
  /* Supabase errors -> words a pilot can act on. Returns { msg, wait } */
  explain(e) {
    const m = String(e && e.message || e || ''), code = e && (e.code || e.error_code) || '';
    const secs = /after (\d+) seconds?/i.exec(m);
    if (secs) return { msg: 'Please wait ' + secs[1] + ' s before asking for another code.', wait: +secs[1] };
    if (code === 'over_email_send_rate_limit' || /rate limit/i.test(m) || (e && e.status === 429))
      return { msg: 'Email limit reached for now. Wait a few minutes, or use a password below.', wait: 60 };
    if (code === 'email_not_confirmed' || /not confirmed/i.test(m)) return { msg: 'This email is not confirmed yet.', unconfirmed: true };
    if (code === 'invalid_credentials' || /invalid login/i.test(m)) return { msg: 'Wrong email or password.' };
    if (code === 'otp_expired' || /token has expired|invalid.*(otp|token)|expired or is invalid/i.test(m)) return { msg: 'That code is wrong or has expired. Tap Resend for a new one.' };
    if (code === 'user_already_exists' || /already registered/i.test(m)) return { msg: 'That email already has an account. Sign in instead.' };
    if (code === 'weak_password' || /password should/i.test(m)) return { msg: m.slice(0, 140) };
    if (m === 'offline' || /failed to fetch|network/i.test(m)) return { msg: 'Can\'t reach the server. Check your connection and try again.' };
    return { msg: m.slice(0, 140) || 'Something went wrong. Try again.' };
  },
  /* one cooldown for every "send me an email" button */
  cooldown(sec) {
    clearInterval(this._cd);
    const end = Date.now() + sec * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      ['cloudOtp', 'cloudResend'].forEach(id => {
        const b = document.getElementById(id); if (!b) return;
        if (!b.dataset.label) b.dataset.label = b.textContent;
        b.disabled = left > 0;
        b.textContent = left > 0 ? 'Send again in ' + left + ' s' : b.dataset.label;
      });
      if (!left) clearInterval(this._cd);
    };
    tick(); this._cd = setInterval(tick, 1000);
  },
  showCode(focus) {
    const row = document.getElementById('cloudCodeRow'); if (row) row.classList.remove('hidden');
    const to = document.getElementById('cloudSentTo'); if (to) to.textContent = this.otpEmail || '';
    const em = document.getElementById('cloudEmail'); if (em && this.otpEmail && !em.value) em.value = this.otpEmail;
    const c = document.getElementById('cloudCode'); if (c && focus) try { c.focus(); } catch (e) { }
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
  /* A completed account-mode run that could not post yet. The record carries
     the run's real identity and launch day, so a later delivery is the same
     run rather than a recomputed local best. */
  queuedRun() {
    try {
      const q = JSON.parse(localStorage.getItem(this.RUN_KEY) || 'null');
      if (!q || typeof q.id !== 'string' || !q.id) return null;
      if (q.mode !== 'main' && q.mode !== 'daily') return null;
      if (q.day !== null && q.day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(q.day))) return null;
      if (!(Number.isFinite(+q.score) && +q.score >= 1)) return null;
      if (!q.stats || typeof q.stats !== 'object') return null;
      return q;
    } catch (e) { return null; }
  },
  rememberRun(run) {
    if (!run || !run.id || (run.mode !== 'main' && run.mode !== 'daily')) return null;
    const score = Math.trunc(+run.score);
    if (!(score >= 1)) return null;
    const q = { id: String(run.id), mode: run.mode, day: run.day || null, score,
      stats: run.stats && typeof run.stats === 'object' ? run.stats : {}, owner: null, at: Date.now() };
    try { localStorage.setItem(this.RUN_KEY, JSON.stringify(q)); } catch (e) { return null; }
    this._pendingDelivered = false;
    return q;
  },
  forgetRun() {
    try { localStorage.removeItem(this.RUN_KEY); } catch (e) { }
  },
  /* Deliver the queued run once. A truthy acknowledgement is the only thing
     allowed to remove it; a transport error leaves it for the next refresh. */
  async deliverPending() {
    if (!this.canPost()) return null;
    const q = this.queuedRun();
    if (!q) return null;
    if (q.owner && q.owner !== this.user.id) return null;
    if (this._pendingPromise) return this._pendingPromise;
    if (!q.owner) {
      q.owner = this.user.id;
      try { localStorage.setItem(this.RUN_KEY, JSON.stringify(q)); } catch (e) { }
    }
    this._pendingPromise = (async () => {
      const res = await this.submit(q.mode, q.score, q.stats, { id: q.id, day: q.day || null });
      if (!res) return null;
      this.forgetRun();
      this._pendingDelivered = true;
      if (res.daily && typeof applyDailyResult === 'function') {
        try { applyDailyResult(res, q.day || undefined); } catch (e) { }
      }
      try {
        if (typeof note === 'function') note(res.daily
          ? 'Pending run posted · Daily rewards acknowledged'
          : 'Pending run posted to the worldwide board', 'good');
      } catch (e) { }
      return res;
    })();
    try { return await this._pendingPromise; } finally { this._pendingPromise = null; }
  },
  /* guest -> account: offer this device's Endless best to the board once */
  async carryGuestBest() {
    if (!this.canPost()) return null;
    let pending = null;
    try { pending = await this.deliverPending(); } catch (e) { return null; }
    if (pending) return pending;
    if (this._pendingDelivered) return true;
    let key = 'ef.carried.' + this.user.id;
    try { if (localStorage.getItem(key)) return null; } catch (e) { return null; }
    const best = (typeof loadBoard === 'function' ? loadBoard('main') : [])
      .reduce((a, r) => (r && +r.s > (a ? +a.s : 0) ? r : a), null);
    if (!best || !(+best.s >= 1)) return null;
    try {
      const res = await this.submit('main', +best.s, { wave: Math.max(1, +best.w || 1), ship: best.k, src: 'guest' });
      if (res) { try { localStorage.setItem(key, '1'); } catch (e) { } }
      return res;
    } catch (e) { return null; }
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
    this._pendingUser = null; this._pendingDelivered = false;
  },
  async setCallsign(cs) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { data, error } = await sb.rpc('set_callsign', { p_callsign: String(cs || '').trim() });
    if (error) throw error;
    this.profile = data;
    return data;
  },
  /* best-effort: the run is already saved locally before this is called.
     A launched run carries a stable id + launch-bound day and uses the receipt
     RPC; direct/legacy callers keep the compatibility RPC. */
  async submit(gameMode, score, stats, run) {
    const mode = MIRROR_MODE[gameMode];
    if (!mode || !this.canPost()) return null;
    if (run && run.id) {
      try {
        const { data, error } = await this.sb.rpc('submit_run_v2', {
          p_run_id: run.id, p_mode: mode, p_day: run.day || null,
          p_score: Math.trunc(score), p_stats: stats || {}, p_status: 'finished'
        });
        if (error) throw error;
        if (data && typeof data === 'object') return data;
      } catch (e) {
        const msg = String(e && e.message || e), code = e && e.code || '';
        /* The migration is owner-applied: an un-migrated project still posts
           through submit_score, but that response has no Daily block and is
           never presented as acknowledged. */
        if (!(code === 'PGRST202' || /could not find the function|schema cache/i.test(msg))) throw e;
      }
    }
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
    const resume = document.getElementById('cloudAccount');
    if (resume) resume.classList.toggle('hidden', !signed || this.postingMode() !== 'guest');
    this.paintTitle();
    this.paintProfile();
    this.sheetHead();
    if (!signed) { st.textContent = 'Guest scores stay on this device. Sign in with your email to post runs to the worldwide boards. No password needed.'; return; }
    const who = (this.user.email || '');
    const cs = document.getElementById('cloudCallsign');
    const pm = document.getElementById('pfMail'); if (pm) pm.textContent = who;
    st.textContent = this.postingMode() === 'guest'
      ? 'Playing as guest. Runs stay on this device. Use account to post future runs.'
      : this.profile
      ? 'Your Endless and Daily runs post to the worldwide boards.'
      : 'Signed in. Next, pick a callsign to start posting runs.';
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
    const tiles = v => { if (!st) return; st.querySelectorAll('.pf-s b').forEach((b, i) => { b.textContent = v[i]; }); };
    const n = x => (x ? (typeof fmt === 'function' ? fmt(x) : String(x)) : '—');
    if (st) st.classList.toggle('hidden', !this.profile);
    if (st && this.user && this.profile && !this._statsBusy) {
      this._statsBusy = true;
      st.classList.add('busy');
      this.stats().then(x => {
        if (x) tiles([n(x.best), x.rank ? '#' + n(x.rank) : '—', n(x.today), n(x.runs || 0)]);
      }).catch(() => {}).finally(() => { this._statsBusy = false; st.classList.remove('busy'); });
    }
  },
  /* title-screen account strip */
  paintTitle() {
    const meta = document.getElementById('acctMeta'), line = document.getElementById('acctLine');
    if (!meta || !line) return;
    const signed = !!this.user && this.postingMode() === 'account';
    meta.textContent = signed ? (this.profile ? this.profile.callsign : 'Signed in') : 'Guest';
    line.textContent = !signed
      ? this.user ? 'Guest runs stay on this device. Open Profile to resume account posting.'
        : 'Guest runs stay on this device. Sign in to post on the worldwide boards.'
      : this.profile ? 'Your Endless and Daily runs post to the worldwide boards.'
      : 'Signed in. Choose a callsign to start posting.';
    const pn = document.getElementById('pilotName'), ps = document.getElementById('pilotSub');
    if (pn) pn.textContent = signed ? (this.profile ? this.profile.callsign : 'Signed in') : 'Guest';
    if (ps) ps.textContent = signed ? (this.profile ? 'View profile' : 'Choose a callsign') : this.user ? 'Account posting paused' : 'Sign in to post scores';
    this.drawAv(document.getElementById('pilotAv'), (signed && this.profile && this.profile.avatar) || 'vesper');
    const sb = document.getElementById('btnAcctSign');
    if (sb) sb.textContent = this.user ? 'Profile' : 'Sign in';
  },
  /* game over: guests (or no callsign yet) get "Sign up to post this score" */
  overPrompt(eligible) {
    const el = document.getElementById('ovCloud');
    if (!el) return;
    const paused = !!this.user && this.postingMode() === 'guest';
    el.classList.toggle('hidden', !(eligible && this.available() && (!this.profile || paused)));
    el.querySelector('b').textContent = paused ? 'Guest run saved on this device' : 'Sign up to post this score';
    const btn = document.getElementById('btnOvSignUp');
    if (btn) btn.textContent = paused ? 'Use account' : 'Sign up';
  },
  /* Shared sheet navigation lives in NET so portal builds need no Auth. */
  sheetHead() {
    const t = document.getElementById('sheetTitle'), e = document.getElementById('sheetEyebrow');
    if (!t || !e) return;
    if (NET.sheetView === 'boards') { NET.sheetHead(); return; }
    e.textContent = 'Pilot account';
    t.textContent = !this.user ? 'Sign in' : this.profile ? 'Profile' : 'Choose a callsign';
  },
  openSheet(view) {
    if (typeof NET.openSheet === 'function') return NET.openSheet(view);
    // An older cached NET still supports its inline Global tab.
    if (typeof switchTab === 'function') switchTab('global');
    return false;
  },
  closeSheet() {
    if (typeof NET.closeSheet === 'function') NET.closeSheet();
  },
  showAccount() {
    this.openSheet('acct');
    if (typeof NET !== 'undefined') NET.renderGlobal(); else this.open().catch(() => {});
    const em = document.getElementById(this.user ? 'cloudCallsign' : 'cloudEmail');
    const fine = !matchMedia('(pointer:coarse)').matches;
    try { if (em && fine) em.focus({ preventScroll: true }); else document.querySelector('#acctSheet .sheet-card').focus({ preventScroll: true }); } catch (e) { }
  },
  showBoards() {
    if (typeof NET.showBoards === 'function') return NET.showBoards();
    this.openSheet('boards');
    if (typeof NET !== 'undefined') NET.renderGlobal();
    try { document.querySelector('.btab').focus({ preventScroll: true }); } catch (e) { }
  },
  say(msg, bad) {
    const el = document.getElementById('cloudMsg');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('err', !!bad);
    el.classList.toggle('ok', !bad && !!msg);
  },
  wire() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    const val = id => (document.getElementById(id) || {}).value || '';
    const run = fn => async ev => {
      const btn = ev && ev.currentTarget;
      if (btn) { btn.disabled = true; btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true'); }
      this.say('');
      let wait = 0;
      try { await fn(); this.paint(); } catch (e) {
        this.paint();
        const x = this.explain(e);
        wait = x.wait || 0;
        if (x.unconfirmed) {
          /* password sign-in refused: send a fresh confirmation code instead of a dead end */
          try { await this.resendSignup(val('cloudEmail')); this.showCode(true); this.say('This email is not confirmed yet. We sent a new code: enter it below.'); wait = 60; }
          catch (e2) { const y = this.explain(e2); wait = y.wait || 0; this.say('This email is not confirmed yet. ' + y.msg, true); }
        } else this.say(x.msg, true);
      }
      finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); } if (wait) this.cooldown(wait); }
    };
    on('cloudSignIn', run(async () => { await this.signInEmail(val('cloudEmail'), val('cloudPass')); this.say(this.profile ? 'Signed in.' : 'Signed in. Pick your callsign to post runs.'); }));
    on('cloudSignUp', run(async () => {
      const pending = await this.signUpEmail(val('cloudEmail'), val('cloudPass'));
      if (pending) { this.rememberOtp(String(val('cloudEmail')).trim(), 'signup'); this.showCode(false); this.cooldown(60); }
      this.say(pending ? 'Almost there: confirm your email. Enter the code from the email below, or tap its link.' : 'Account created. Pick your callsign to post runs.');
    }));
    on('cloudOtp', run(async () => {
      await this.sendOtp(val('cloudEmail'));
      this.showCode(true);
      this.say('Code sent. It can take a minute: check Spam and Promotions too.');
      this.cooldown(60);
    }));
    on('cloudResend', run(async () => {
      if (this.otpKind === 'signup') await this.resendSignup(this.otpEmail); else await this.sendOtp(this.otpEmail || val('cloudEmail'));
      this.say('New code sent to ' + this.otpEmail + '.');
      this.cooldown(60);
    }));
    on('cloudChange', () => {
      this.forgetOtp();
      const row = document.getElementById('cloudCodeRow'); if (row) row.classList.add('hidden');
      const em = document.getElementById('cloudEmail'); if (em) try { em.focus(); em.select(); } catch (e) { }
      this.say('');
    });
    /* digits only; a full 6-digit code (typed, pasted or autofilled) verifies itself */
    const code = document.getElementById('cloudCode');
    if (code) code.addEventListener('input', () => {
      const d = code.value.replace(/\D+/g, '').slice(0, 10);
      if (d !== code.value) code.value = d;
      clearTimeout(this._auto);
      if (d.length === 6) this._auto = setTimeout(() => { const b = document.getElementById('cloudVerify'); if (b && !b.disabled && code.value.length === 6) b.click(); }, 700);
    });
    on('cloudVerify', run(async () => { await this.verifyOtp(val('cloudCode')); this.say(this.profile ? 'Signed in.' : 'Signed in. Pick your callsign to post runs.'); }));
    on('cloudGoogle', run(async () => { await this.signInGoogle(); }));
    on('btnPilot', () => this.showAccount());
    if (typeof NET.wireBoards === 'function') NET.wireBoards();
    else on('btnBoards', () => this.showBoards());
    /* Enter submits the field's primary action */
    const enter = (inp, btn) => { const i = document.getElementById(inp); if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const b = document.getElementById(btn); if (b) b.click(); } }); };
    enter('cloudEmail', 'cloudOtp'); enter('cloudCode', 'cloudVerify'); enter('cloudPass', 'cloudSignIn'); enter('cloudCallsign', 'cloudSave');
    /* the virtual keyboard must not cover the field being typed in */
    document.querySelectorAll('#cloudBox input').forEach(i => i.addEventListener('focus', () => {
      setTimeout(() => { try { i.scrollIntoView({ block: 'center' }); } catch (e) { } }, 300);
    }));
    if (window.visualViewport) visualViewport.addEventListener('resize', () => {
      const a = document.activeElement;
      if (a && a.closest && a.closest('#cloudBox')) try { a.scrollIntoView({ block: 'center' }); } catch (e) { }
    });
    on('cloudGuest', () => { this.playGuest(); this.say('Playing as guest: scores stay on this device.'); });
    on('cloudAccount', () => {
      this.useAccount();
      this.say(this.profile ? 'Account posting resumed for future runs.' : 'Choose a callsign to post future runs.');
      const target = document.getElementById(this.profile ? 'cloudOut' : 'cloudCallsign');
      if (target) target.focus();
    });
    on('btnAcctGuest', () => { this.playGuest(); if (typeof startRun === 'function') startRun('endless'); });
    on('btnAcctSign', () => this.showAccount());
    on('btnOvSignUp', () => this.showAccount());
    on('cloudSave', run(async () => {
      await this.setCallsign(val('cloudCallsign'));
      const carried = await this.carryGuestBest();
      this.say(carried ? 'Callsign saved. Your guest run is on the board.' : 'Callsign saved.');
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
    if (!this.user && this.restoreOtp()) { this.showCode(false); this.say('Enter the code we emailed to ' + this.otpEmail + '.'); }
  },
  boot() {
    if (!this.available()) return;
    this.wire();
    window.addEventListener('storage', e => { if (e.key === 'ef.guest' || e.key === null) this.paint(); });
    this.paint();
    if (this.pending()) this.refresh().then(() => this.paint()).catch(() => {});
  }
};
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => CLOUD.boot());
  else CLOUD.boot();
}
