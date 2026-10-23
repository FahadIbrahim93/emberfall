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
      const { data: rows } = await sb.from('profiles').select('id,callsign').eq('id', this.user.id).limit(1);
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
    if (!signed) { st.textContent = 'Playing as guest: scores stay on this device. Sign in or create an account to post worldwide.'; return; }
    const who = (this.user.email || 'pilot');
    const cs = document.getElementById('cloudCallsign');
    st.textContent = this.profile
      ? 'Signed in as ' + this.profile.callsign + ' (' + who + ') · endless and daily runs post worldwide.'
      : 'Signed in (' + who + ') · first flight: pick a callsign to post runs.';
    if (!this.profile && cs && !cs.value) { try { cs.focus(); } catch (e) { } }
    if (this.profile && !cs.value) cs.value = this.profile.callsign;
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
    if (em) { try { em.scrollIntoView({ block: 'center' }); em.focus(); } catch (e) { } }
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
    on('cloudGuest', () => { this.playGuest(); this.say('Playing as guest: scores stay on this device.'); });
    on('btnAcctGuest', () => { this.playGuest(); if (typeof startRun === 'function') startRun('endless'); });
    on('btnAcctSign', () => this.showAccount());
    on('btnOvSignUp', () => this.showAccount());
    on('cloudSave', run(async () => { await this.setCallsign(val('cloudCallsign')); this.say('Callsign saved.'); }));
    on('cloudOut', run(async () => { await this.signOut(); this.say('Signed out. Local scores stay on this device.'); }));
  },
  async open() {
    this.paint();
    if (!this.available()) return;
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
