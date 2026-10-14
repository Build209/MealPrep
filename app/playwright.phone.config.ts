import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/**
 * Phone pass: every end-to-end spec in e2e/ (the same web export, the same LOCAL Supabase stack
 * and the same variables as playwright.config.ts) on two phone profiles, plus the screen tour
 * (e2e/phone-tour.spec.ts) with screenshots and the automatic layout checks (e2e/phone-checks.ts).
 * CI: .github/workflows/app-phone.yml. Report: node e2e/phone-report.mjs after the run.
 *
 * The iPhone profile runs in WebKit when CI could install it (PHONE_IPHONE_ENGINE=webkit), else in
 * Chromium with the iPhone's screen size, user agent, pixel ratio and touch. Android is Chromium.
 */
const iphoneEngine = process.env.PHONE_IPHONE_ENGINE === 'webkit' ? 'webkit' : 'chromium';

export default defineConfig({
  ...base,
  testIgnore: [],
  timeout: 90_000,
  outputDir: `test-results-phone${process.env.PHONE_RUN ? '-' + process.env.PHONE_RUN : ''}`,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: `playwright-report-phone${process.env.PHONE_RUN ? '-' + process.env.PHONE_RUN : ''}` }]] : 'list',
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'], defaultBrowserType: iphoneEngine } },
    { name: 'android', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
});
