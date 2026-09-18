const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { browserName: 'chromium', headless: true },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:8123/api/health',
    reuseExistingServer: true /* CI starts the deck for smoke.sh; the browser
      suite must reuse THAT instance so it tests the same server (starting a
      second one would EADDRINUSE). Locally this also lets `npm run test:browser`
      attach to an already-running deck instead of failing on a busy port. */
  }
});
