import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Android emulator pass: the phone screen tour (e2e/phone-tour.spec.ts) in the real Chrome app on
 * an Android emulator, reached over the DevTools protocol (EMULATOR_CDP_URL, see e2e/device.ts).
 * The emulator reaches this machine's web server and LOCAL Supabase through `adb reverse`, so the
 * addresses are the same as in playwright.config.ts. Screenshots: phone-screens/<EMULATOR_LABEL>/.
 * CI: .github/workflows/app-android-emulator.yml, script e2e/emulator/run.sh.
 */
const label = process.env.EMULATOR_LABEL ?? 'android-emulator';

export default defineConfig({
  ...base,
  testMatch: ['**/phone-tour.spec.ts'],
  testIgnore: [],
  // Software-drawn emulator: slower than a desktop browser.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: `test-results-${label}`,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: `playwright-report-${label}` }]] : 'list',
  use: {
    ...base.use,
    // Real Chrome's own profile: no new contexts, so no trace or video recording.
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: label, use: { defaultBrowserType: 'chromium' } }],
});
