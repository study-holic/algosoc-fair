// Runs the fair tests in the locally installed Microsoft Edge (no browser download needed).
// To use Chrome instead: PW_CHANNEL=chrome npx playwright test
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests',
  testMatch: /(fair|mobile)\.spec\.js/,
  timeout: 180000,
  workers: 6,
  reporter: [['list']],
  use: { channel: process.env.PW_CHANNEL || 'msedge', headless: true, acceptDownloads: true },
});
