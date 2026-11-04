const { defineConfig } = require('@playwright/test');

/* The browser suite runs against the verified dist/site release artifact:
   tools/serve-static.mjs serves only its manifest assets on 127.0.0.1:8123
   (specs and the in-game selftest use that origin). There is no API server;
   accounts and boards live on Supabase, and specs that touch them stub the
   network. CI always starts its own verified release server. */
const PORT = Number(process.env.E2E_PORT) || 8123;
const BASE = 'http://127.0.0.1:' + PORT;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { browserName: 'chromium', headless: true, baseURL: BASE },
  retries: 1,
  webServer: {
    command: 'node tools/serve-static.mjs --release' + (process.env.EMBERFALL_SITE_ROOT ? '' : ' --build') + ' --port ' + PORT,
    url: BASE + '/release-manifest.json',
    reuseExistingServer: false
  }
});
module.exports.E2E_PORT = PORT;
