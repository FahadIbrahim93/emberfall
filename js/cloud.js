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
  sb: null, user: null, profile: null, anonOk: false, loading: null,
  STORE: 'sb-rgmbexmodebegllahotc-auth-token',

  available() {
    if (typeof emberfallPortal === 'function' && emberfallPortal()) return false;
    return typeof fetch === 'function' && typeof document !== 'undefined';
  },
  /* a session exists (or is arriving in the URL from a magic link) */
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
    try {
      const st = await fetch(MIRROR_ORIGIN + '/auth/v1/settings', { headers: { apikey: MIRROR_KEY } });
      if (st.ok) { const j = await st.json(); this.anonOk = !!(j.external && j.external.anonymous_users); }
    } catch (e) { /* offline: keep the last answer */ }
    const { data } = await sb.auth.getSession();
    this.user = data && data.session ? data.session.user : null;
    this.profile = null;
    if (this.user) {
      const { data: rows } = await sb.from('profiles').select('id,callsign').eq('id', this.user.id).limit(1);
      this.profile = rows && rows[0] ? rows[0] : null;
    }
    return this.user;
  },
  async signInAnon() {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { error } = await sb.auth.signInAnonymously();
    if (error) throw error;
    await this.refresh();
  },
  async sendEmail(email) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { error } = await sb.auth.signInWithOtp({
      email: String(email || '').trim(),
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
  },
  async verifyCode(email, token) {
    const sb = await this.load(); if (!sb) throw new Error('offline');
    const { error } = await sb.auth.verifyOtp({ email: String(email || '').trim(), token: String(token || '').trim(), type: 'email' });
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
    if (!mode || !this.sb || !this.user || !this.profile) return null;
    const { data, error } = await this.sb.rpc('submit_score', { p_mode: mode, p_score: Math.trunc(score), p_stats: stats || {} });
    if (error) throw error;
    return data;
  },

  /* ── account panel in the Global tab ── */
  paint() {
    const box = document.getElementById('cloudBox');
    if (!box) return;
    if (!this.available()) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const st = document.getElementById('cloudStatus');
    const signed = !!this.user;
    document.getElementById('cloudIn').classList.toggle('hidden', signed);
    document.getElementById('cloudMe').classList.toggle('hidden', !signed);
    document.getElementById('cloudAnon').classList.toggle('hidden', !this.anonOk);
    if (!signed) { st.textContent = 'Sign in to post runs to the worldwide boards.'; return; }
    const who = this.user.is_anonymous ? 'guest pilot' : (this.user.email || 'pilot');
    st.textContent = this.profile
      ? 'Signed in as ' + this.profile.callsign + ' (' + who + ') · endless and daily runs post worldwide.'
      : 'Signed in (' + who + ') · pick a callsign to post runs.';
    const cs = document.getElementById('cloudCallsign');
    if (this.profile && !cs.value) cs.value = this.profile.callsign;
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
      try { await fn(); this.paint(); } catch (e) { this.say(String(e && e.message || e).slice(0, 140), true); }
    };
    on('cloudSend', run(async () => { await this.sendEmail(val('cloudEmail')); this.say('Check your inbox: open the link, or type the code below.'); }));
    on('cloudVerify', run(async () => { await this.verifyCode(val('cloudEmail'), val('cloudCode')); this.say('Signed in.'); }));
    on('cloudAnon', run(async () => { await this.signInAnon(); this.say('Signed in as a guest on this device.'); }));
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
