import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  // The offline test depends on Chromium's network emulation cooperating with
  // service workers, which is intermittently unreliable — it consistently
  // passes on retry within seconds when the app is healthy.
  retries: 2,
  // Sequential on purpose: each test boots a full Python runtime, and the
  // offline test's network emulation must not overlap other contexts
  // (Chromium's offline emulation leaks across contexts via service workers).
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // In environments with a pre-installed Chromium (e.g. Claude Code remote),
    // point at it instead of downloading a version-matched browser build.
    // --disable-dev-shm-usage: containers have tiny /dev/shm; without it,
    // WASM-heavy runs exhaust it and asset loads start failing (ERR_FAILED).
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
      ...(process.env.PICOPY_CHROMIUM ? { executablePath: process.env.PICOPY_CHROMIUM } : {}),
    },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});
