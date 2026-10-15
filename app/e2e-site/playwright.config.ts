import { defineConfig, devices } from '@playwright/test';

/**
 * Site tests: the whole GitHub Pages site (app/scripts/build-site.sh output, default app/site)
 * served like GitHub Pages by serve-pages.mjs, in Chromium. CI: the `site-e2e` job in
 * .github/workflows/site-build.yml. Build the site with DUMMY Supabase settings for this; every
 * request off this machine is blocked in the tests (guard.ts).
 *
 *   cd app && npx playwright test -c e2e-site
 *   E2E_SITE_DIR=/path/to/site npx playwright test -c e2e-site
 */
const port = Number(process.env.E2E_SITE_PORT ?? 4174);
const siteDir = process.env.E2E_SITE_DIR ?? '../site';

export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Relative to this folder (Playwright runs the command here).
    command: `node serve-pages.mjs "${siteDir}" ${port} --e2e-controls`,
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
