/* v4.23.1 — the browser suite's live-ledger fence (see tools/live-guard.mjs
   and EF_LIVE_LEDGER in server.js). Runs once after the webServer resolves:
   if the deck we ended up against self-identifies as LIVE, the suite
   refuses to run. Self-contained CJS on purpose — globalSetup loads before
   test modules and must not depend on ESM interop. */
module.exports = async function () {
  const base = 'http://127.0.0.1:' + (Number(process.env.E2E_PORT) || 8123);
  let h = null;
  try {
    const res = await fetch(base + '/api/health', { signal: AbortSignal.timeout(5000) });
    if (res.ok) h = await res.json();
  } catch { /* unreachable: let the suite fail its own way */ }
  if (h && h.live) {
    console.error(`browser suite: REFUSING — ${base} is a LIVE deck (EF_LIVE_LEDGER=1, ${h.pilots ?? '?'} pilots).`);
    console.error('browser suite:   the suite never writes to production. Boot it on a scratch dir or move the live deck.');
    process.exit(1);
  }
};
