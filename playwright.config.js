const { defineConfig } = require('@playwright/test');

/* The browser suite runs against the static game exactly as Vercel serves
   it: tools/serve-static.mjs serves the public payload on 127.0.0.1:8123
   (specs and the in-game selftest use that origin). There is no API server;
   accounts and boards live on Supabase, and specs that touch them stub the
   network. E2E_REUSE=1 attaches to a server already on the port. */
const PORT = Number(process.env.E2E_PORT) || 8123;
const BASE = 'http://127.0.0.1:' + PORT;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { browserName: 'chromium', headless: true, baseURL: BASE },
  retries: 1,
  webServer: process.env.E2E_REUSE ? undefined : {
    command: 'node tools/serve-static.mjs --port ' + PORT,
    url: BASE + '/index.html',
    reuseExistingServer: true
  }
});
module.exports.E2E_PORT = PORT;
