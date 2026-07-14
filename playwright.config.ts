import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  retries: 1,
  // Sequential on purpose: each test boots a full Python runtime, and the
  // offline test's network emulation must not overlap other contexts
  // (Chromium's offline emulation leaks across contexts via service workers).
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // In environments with a pre-installed Chromium (e.g. Claude Code remote),
    // point at it instead of downloading a version-matched browser build.
    launchOptions: process.env.PICOPY_CHROMIUM ? { executablePath: process.env.PICOPY_CHROMIUM } : {},
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});
