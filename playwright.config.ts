import { defineConfig, devices } from '@playwright/test';

/*
 * Browser tests of the production web build (npm run test:e2e): Playwright builds dist/, serves it with `vite preview`
 * and runs e2e/*.e2e.ts in Chromium, including an axe accessibility scan. The Electron self-test (npm test) covers
 * rendering and export in depth; these check the app as a visitor's browser sees it.
 */
const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // A clean profile per test: no saved design, no service worker from an earlier run.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite build --logLevel error && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
