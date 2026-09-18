const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { browserName: 'chromium', headless: true },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:8123/api/health',
    reuseExistingServer: !process.env.CI
  }
});
