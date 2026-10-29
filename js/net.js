/* NET — the Global tab's worldwide boards, plus the shared title-screen
   renderers (boards, roster, feats, hangar, screen flow) — extracted from the
   original monolith. Classic script: shares globals with index.html's inline
   core. Load order is enforced in index.html; file:// play still works.
   Accounts and score posting are js/cloud.js (Supabase, ADR 0004). */

/* Portal mode (window.EMBERFALL_PORTAL, or ?portal=1) is the build web
   game portals ship: no accounts, no public boards, no other host. Scores
   stay in localStorage. Framed arcade players (Bounty Board et al.) get the
   same auth-off path: no sign-in, sign-up, or email prompts. The flag is
   read at load, before any request. */
function emberfallFramed() {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch (e) {
    /* cross-origin parent: treat as framed */
    return true;
  }
}
function emberfallPortal() {
  try {
    if (typeof window !== 'undefined' && window.EMBERFALL_PORTAL) return true;
    if (typeof location !== 'undefined' && /(?:^|[?&])portal=1(?:&|$)/.test(String(location.search || ''))) return true;
    if (emberfallFramed()) return true;
  } catch (e) { }
  return false;
}
