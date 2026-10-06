import { defineConfig } from '@playwright/test';

/*
 * The Phase 1 gate measurement (npm run measure:gate, specs/features/001-phase1-gate-release): masked edits in the
 * production web build, in the Chrome installed on this machine, headed so the real graphics card is used. Not part of
 * npm run test:e2e (that config only matches *.e2e.ts). See docs/PERFORMANCE.md → Measuring the photo editor's frame rate.
 */
const PORT = 4175;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.measure.ts',
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx vite build --logLevel error && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
