import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Google Play phone screenshots (store-screenshots.spec.ts). Runs only with this config
 * (.github/workflows/store-screenshots.yml), never in the normal e2e or phone pass.
 *
 * Same web export (app/dist, built against the LOCAL Supabase stack) and the same E2E_* variables
 * as ../playwright.config.ts. The phone is 360 x 640 CSS px at device scale factor 3, so every
 * screenshot is exactly 1080 x 1920 PNG (16:9 portrait, inside Play's 2:1 limit).
 */
const port = Number(process.env.E2E_PORT ?? 4173);
const appDir = resolve(__dirname, '..');

export default defineConfig({
  testDir: '.',
  testMatch: ['store-screenshots.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: resolve(appDir, 'test-results-store'),
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: resolve(appDir, 'playwright-report-store') }]]
    : 'list',
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 360, height: 640 },
    screen: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: 'chromium',
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    colorScheme: 'light',
    // Modesto, CA: the Stores screen finds the seeded stores around here.
    geolocation: { latitude: 37.6391, longitude: -120.9969 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'play-phone' }],
  webServer: {
    command: `node e2e/serve.mjs dist ${port}`,
    cwd: appDir,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
