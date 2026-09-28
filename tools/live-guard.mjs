/* v4.23.1 — the live-ledger guard (see EF_LIVE_LEDGER in server.js).
   Every battery tool that can reach a deck it must not write imports
   this: if /api/health says live:true, the tool REFUSES. There is no
   override — a production ledger is never a test target. (Dirt-census
   keeps its older escape hatch, ALLOW_DIRTY_LEDGER=1, for scratch
   decks that got muddy; live is a different, harder line.)
   Born 2026-09-27, when a release battery's smoke run seeded five
   machine pilots into the production Wardenfall deck on 8123. */

export async function probeHealth(base, timeoutMs = 5000) {
  try {
    const res = await fetch(base + '/api/health', { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }   /* unreachable ≠ live; callers treat as absent */
}

export function assertNotLive(h, base, tool) {
  if (h && h.live) {
    console.error(`${tool}: REFUSING — ${base} is a LIVE deck (EF_LIVE_LEDGER=1, ${h.pilots ?? '?'} pilots).`);
    console.error(`${tool}:   the battery never writes to production. Point at a scratch deck or boot one (see docs/runbooks).`);
    process.exit(1);
  }
}

/* For drills that boot their OWN scratch deck on a fixed port: an
   occupied port means a stranger (or a zombie deck) is already there —
   the boot would silently adopt it, which is exactly how a live deck
   gets written. Refuse and name the env var that moves the port. */
export function assertPortFree(h, base, tool, portEnv) {
  if (!h) return;
  const live = h.live ? ' — and it is LIVE (EF_LIVE_LEDGER=1)' : '';
  console.error(`${tool}: REFUSING — ${base} already serves a deck${live} (${h.pilots ?? '?'} pilots).`);
  console.error(`${tool}:   ${tool} boots its own scratch deck; kill the squatter or set ${portEnv}=<free port>.`);
  process.exit(1);
}
