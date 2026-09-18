const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { browserName: 'chromium', headless: true },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:8123/api/health',
    /* CI starts the Command Deck for the API smoke before this suite. Reuse it
       there, while still starting a server automatically for local test runs. */
    reuseExistingServer: true
  }
});
