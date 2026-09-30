const { defineConfig } = require('@playwright/test');

/* The browser suite must never write to a REAL deck's ledger. Specs hardcode
   http://127.0.0.1:8123 (the canonical origin; the game's client code and
   CSP assume it), so the suite boots its OWN deck on that port with a
   SCRATCH data dir — the first version of this isolation forgot the env in
   the command itself and the suite cheerfully registered pilots in the real
   emberfall-data ledger (115 → 116, caught by the before/after census).
   E2E_REUSE=1 attaches to whatever deck is already up instead (CI reuses
   the smoke deck there; locally that writes to the real ledger — your
   choice, your rows). */
const { mkdtempSync, writeFileSync: _wfs } = require('node:fs');
const fs = { writeFileSync: _wfs };
const { tmpdir } = require('node:os');
const path = require('node:path');
const PORT = Number(process.env.E2E_PORT) || 8123;
const BASE = 'http://127.0.0.1:' + PORT;

/* the data dir is minted here but ANNOUNCED by the deck itself: a seed
   script runs in a second process, and both re-requiring this config and
   trusting tmpdir-mtime heuristics failed live (the runner and the
   webServer each load the config, minting TWO tmpdirs; the newest marker
   belonged to the deck that never started). server.js writes the marker
   when EF_E2E_MARKER is set — the deck knows its own EF_DATA_DIR with
   certainty. */
const E2E_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'ef-e2e-'));
const E2E_MARKER = path.join(tmpdir(), 'ef-e2e-active-dir.txt');

/* v4.26 — the suite's deck also plays the Google game: a scratch JWKS file
   (drill-style throwaway RSA key) lets google-signin.spec.js mint REAL
   RS256 ID tokens the deck's verifier honestly accepts, with no network.
   Test-only: production decks never set EF_GOOGLE_JWKS_FILE.

   v4.26.1 — ONE PERSISTED KEYPAIR, claimed once, adopted by everyone.
   The old code generated a FRESH keypair on every config load and stomped
   the shared JWKS file. Every Playwright worker re-requires this config,
   so under parallel load the deck (reading the file lazily per token) saw
   the LAST writer's public key while other workers minted with their OWN
   private keys — 'google token refused: bad signature' (401), proven by
   the diag spec's error capture. Root cause of the google-signin spec's
   historical flake; workers=1 never lost the race, which is why it hid
   from single-spec runs and only bit bursts and full parallel suites.

   The protocol: the first process to load the config CLAIMS the keypair
   state file (flag 'wx' — exactly one winner); losers get EEXIST and
   ADOPT the winner's pair (with a bounded retry-parse for the torn-read
   window). The JWKS for the deck is then published atomically (tmp+rename)
   from that one agreed pair — idempotent for every later load. Deck,
   runner and all workers now agree forever. */
const crypto = require('node:crypto');
const realfs = require('node:fs');   /* the config's own `fs` shadow has writeFileSync only */
const GSI_JWKS_PATH = path.join(tmpdir(), 'ef-e2e-google-jwks.json');
const GSI_STATE_PATH = path.join(tmpdir(), 'ef-e2e-google-auth.json');
function readAgreedPair() {
  /* bounded retry-parse: a reader racing the winner's single small write
     can see a torn line; 20 retries × 25ms is orders of magnitude past it */
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 20; i++) {
    try { return JSON.parse(realfs.readFileSync(GSI_STATE_PATH, 'utf8')); }
    catch (e) { if (!realfs.existsSync(GSI_STATE_PATH)) return null; }
    Atomics.wait(sleeper, 0, 0, 25);   /* blocks 25ms — no CPU spin */
  }
  return null;
}
let PAIR = readAgreedPair();
if (!PAIR) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  PAIR = {
    jwk: { ...publicKey.export({ format: 'jwk' }), kid: 'e2e-key-1', alg: 'RS256', use: 'sig' },
    pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  };
  try {
    realfs.writeFileSync(GSI_STATE_PATH, JSON.stringify(PAIR), { flag: 'wx' });
  } catch (e) {
    /* lost the claim race — adopt the winner's pair, they own the key */
    PAIR = readAgreedPair();
  }
  if (!PAIR) throw new Error('e2e google keypair: claim lost and state unreadable');
}
/* publish the JWKS the deck reads (EF_GOOGLE_JWKS_FILE): atomic rename from
   the ONE agreed pair — every config load lands identical bytes */
const jwksTmp = GSI_JWKS_PATH + '.tmp' + process.pid;
realfs.writeFileSync(jwksTmp, JSON.stringify({ keys: [PAIR.jwk] }));
realfs.renameSync(jwksTmp, GSI_JWKS_PATH);
const PRIVATE_KEY = crypto.createPrivateKey(PAIR.pem);
const b64u = b => Buffer.from(b).toString('base64url');
const GOOGLE = {
  CLIENT_ID: 'e2e-google-client-id.apps.googleusercontent.com',
  JWKS_PATH: GSI_JWKS_PATH,
  mint(sub, email) {
    const head = b64u(JSON.stringify({ alg: 'RS256', kid: PAIR.jwk.kid, typ: 'JWT' }));
    const nowS = Math.floor(Date.now() / 1000);
    const payload = b64u(JSON.stringify({ sub, email, email_verified: true, aud: this.CLIENT_ID, iss: 'https://accounts.google.com', exp: nowS + 600, iat: nowS - 10 }));
    return head + '.' + payload + '.' + b64u(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + payload), PRIVATE_KEY));
  }
};

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  /* v4.23.1 — the live-ledger fence: globalSetup runs after the webServer
     resolves (booted fresh OR adopted via reuseExistingServer / E2E_REUSE),
     and refuses the whole suite if that deck self-identifies as LIVE. */
  globalSetup: './tests/global-live-guard.js',
  use: { browserName: 'chromium', headless: true, baseURL: BASE },
  /* local CPUs juggle the suite (three consecutive full runs flaked a
     DIFFERENT timing test each time; each passed on retry). CI keeps one
     retry — the report shows retried tests transparently. */
  retries: 1,
  webServer: process.env.E2E_REUSE ? undefined : {
    command: 'node server.js --port ' + PORT,
    env: {
      ...process.env,
      EF_DATA_DIR: E2E_DATA_DIR,
      EF_E2E_MARKER: E2E_MARKER,
      /* the suite's deck also plays the CORS game: deck-link.spec aims a
         second deck HERE (EF_CORS_ORIGINS names who may call this deck),
         and EF_CONNECT_SRC lets this deck's SERVED page dial that second
         deck back — the two knobs of ADR 0002's cross-origin story */
      EF_CORS_ORIGINS: 'http://127.0.0.1:8123',
      EF_CONNECT_SRC: 'http://127.0.0.1:8165',
      EF_GOOGLE_CLIENT_ID: GOOGLE.CLIENT_ID,
      EF_GOOGLE_JWKS_FILE: GOOGLE.JWKS_PATH
    },
    url: BASE + '/api/health',
    reuseExistingServer: true /* a deck already on this port is reused AS-IS —
      including its real data dir. The isolated path only applies when the
      suite boots the deck itself. */
  }
});
module.exports.E2E_DATA_DIR = E2E_DATA_DIR;
module.exports.E2E_PORT = PORT;
module.exports.GOOGLE = GOOGLE;
