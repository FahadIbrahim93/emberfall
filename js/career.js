'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   career.js — Cloud careers, slice 1 (client + contract).

   Owned, versioned snapshots of a pilot's career. Local-first: the save
   lands in localStorage first, then syncs to the cloud through save_career
   with a compare-and-swap revision. A stale revision is never overwritten;
   instead both sides are kept and a conflict-choice screen is shown.

   The schema/version lives in the snapshot itself ('v'), so an older client's
   snapshot can be upgraded on read. The database side is additive only
   (the 20261115000000_cloud_careers migration).
   ═══════════════════════════════════════════════════════════════════════ */
const CAREER_SCHEMA_VERSION = 1;

/* ── snapshot format ─────────────────────────────────────────────────── */
const CAREER = {
  LOCAL_KEY: 'emberfall2.career',
  REV_KEY: 'emberfall2.career.rev',
  /* build a snapshot from the live META (career state). Excludes nothing
     secret; the snapshot is the whole career. */
  snapshot(meta) {
    const m = meta || (typeof META !== 'undefined' ? META : {});
    return { v: CAREER_SCHEMA_VERSION, data: clone(m), savedAt: Date.now() };
  },
  /* upgrade an older snapshot to the current schema version. Returns the
     upgraded snapshot, or null if it cannot be upgraded. */
  upgrade(snap) {
    if (!snap || typeof snap !== 'object') return null;
    let v = +snap.v || 0;
    if (!snap.data || typeof snap.data !== 'object') return null;
    let data = snap.data;
    // v0 -> v1: ensure the canonical META shape exists
    if (v < 1) {
      data = Object.assign({}, data);
      if (typeof data.alloy !== 'number') data.alloy = +data.alloy || 0;
      if (!Array.isArray(data.owned)) data.owned = ['vesper'];
      if (!data.refits || typeof data.refits !== 'object') data.refits = {};
      v = 1;
    }
    // future upgrades chain here
    return { v: CAREER_SCHEMA_VERSION, data, savedAt: snap.savedAt || Date.now() };
  },
  /* parse a raw (possibly string) snapshot, upgrading as needed */
  parse(raw) {
    let obj = raw;
    if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch (e) { return null; } }
    if (!obj || typeof obj !== 'object') return null;
    return this.upgrade(obj);
  },
  /* revision helpers */
  localRevision() {
    try { const v = localStorage.getItem(this.REV_KEY); return v === null ? null : +v; }
    catch (e) { return null; }
  },
  setLocalRevision(rev) {
    try { if (rev === null || rev === undefined) localStorage.removeItem(this.REV_KEY); else localStorage.setItem(this.REV_KEY, String(rev)); } catch (e) { }
  },
  /* local-first save: write to localStorage first, return the snapshot */
  saveLocal(meta) {
    const snap = this.snapshot(meta);
    try { localStorage.setItem(this.LOCAL_KEY, JSON.stringify(snap)); } catch (e) { }
    return snap;
  },
  loadLocal() {
    try {
      const raw = localStorage.getItem(this.LOCAL_KEY);
      if (raw === null) return null;
      return this.parse(raw);
    } catch (e) { return null; }
  },
  /* CAS decision: given the last-read revision and the server response,
     decide whether the save succeeded, conflicted, or failed. Pure. */
  casResult(baseRev, response) {
    const r = response || {};
    if (r.conflict) {
      return { ok: false, conflict: true,
        remoteRevision: r.remote_revision, remoteSnapshot: r.remote_snapshot,
        remoteUpdatedAt: r.remote_updated_at, baseRevision: baseRev };
    }
    if (r.ok) {
      return { ok: true, conflict: false, revision: r.revision };
    }
    return { ok: false, conflict: false, error: r.error || 'save failed' };
  },
  /* conflict resolution choices */
  resolveConflict(choice, localSnap, remoteSnap) {
    if (choice === 'keep-local') return localSnap;
    if (choice === 'keep-remote') return remoteSnap;
    if (choice === 'keep-both') {
      // never merge purchases; return both for caller to store as recovery
      return { local: localSnap, remote: remoteSnap };
    }
    return null;
  }
};

function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }

/* ── conflict-choice screen ──────────────────────────────────────────── */
const CAREER_CONFLICT = {
  overlay: null,
  /* show a modal offering keep-local / keep-remote / keep-both.
     onChoice(choice) is called with the user's decision. */
  show(localSnap, remoteSnap, onChoice) {
    if (this.overlay) this.hide();
    const el = document.createElement('div');
    el.id = 'careerConflict';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:420px;padding:20px;background:#1a1a2e;color:#eee;border:1px solid #444;border-radius:8px;font-family:sans-serif;';
    const title = document.createElement('h3');
    title.textContent = 'Career conflict';
    box.appendChild(title);
    const msg = document.createElement('p');
    msg.textContent = 'This device and the cloud copy of your career disagree. Choose which to keep. Purchases are never merged.';
    box.appendChild(msg);
    const mkBtn = (label, choice) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'margin:6px 4px;padding:8px 12px;cursor:pointer;';
      b.addEventListener('click', () => { this.hide(); if (typeof onChoice === 'function') onChoice(choice); });
      return b;
    };
    box.appendChild(mkBtn('Keep this device', 'keep-local'));
    box.appendChild(mkBtn('Keep cloud copy', 'keep-remote'));
    box.appendChild(mkBtn('Keep both (recovery)', 'keep-both'));
    el.appendChild(box);
    document.body.appendChild(el);
    this.overlay = el;
  },
  hide() {
    if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    this.overlay = null;
  }
};

/* ── cloud sync (slice 1 client) ─────────────────────────────────────── */
const CAREER_SYNC = {
  /* attempt a cloud save; returns a casResult. Caller handles conflict. */
  async saveCloud(sb, userId, meta, baseRev) {
    if (!sb || !userId) return { ok: false, conflict: false, error: 'not signed in' };
    const snap = CAREER.saveLocal(meta);
    try {
      const { data, error } = await sb.rpc('save_career', { p_snapshot: snap, p_base_revision: baseRev });
      if (error) return { ok: false, conflict: false, error: error.message };
      const res = CAREER.casResult(baseRev, data);
      if (res.ok) CAREER.setLocalRevision(res.revision);
      return res;
    } catch (e) {
      return { ok: false, conflict: false, error: String(e && e.message || e) };
    }
  },
  async loadCloud(sb) {
    if (!sb) return null;
    try {
      const { data, error } = await sb.rpc('load_career');
      if (error) return null;
      if (!data || !data.ok) return null;
      const snap = data.snapshot ? CAREER.parse(data.snapshot) : null;
      if (snap) CAREER.setLocalRevision(data.revision);
      return { snapshot: snap, revision: data.revision, updatedAt: data.updated_at };
    } catch (e) { return null; }
  }
};

/* expose for tests (Node) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CAREER, CAREER_SYNC, CAREER_CONFLICT, CAREER_SCHEMA_VERSION };
}

