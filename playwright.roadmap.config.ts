import { defineConfig } from '@playwright/test';

/*
 * The roadmap dashboard's browser checks (npm run test:roadmap, specs/features/405-roadmap-revamp D2): the road, rail,
 * hero, live changes, reduced motion, axe and scroll smoothness, on a temporary copy of specs/ and memory/ served by
 * tools/roadmap-dashboard/server.mjs (the test starts it). On demand; not part of npm run test:e2e or CI.
 */
export default defineConfig({
  testDir: 'tools/roadmap-dashboard/e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: 'list',
  use: { viewport: { width: 1280, height: 800 } },
});
