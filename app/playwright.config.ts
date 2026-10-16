import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the web export (dist/, built against a LOCAL Supabase stack) in Chromium.
 * CI runs them in .github/workflows/app-e2e.yml. They need these variables, all pointing at
 * the local stack (from `supabase status -o env --workdir db`), never the live project:
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY
 */
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  // The phone screen tour runs only in playwright.phone.config.ts (phone profiles, screenshots).
  testIgnore: ['**/phone-tour.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node e2e/serve.mjs dist ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
