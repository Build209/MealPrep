import { chromium, expect, test as base } from '@playwright/test';

/**
 * The phone tour's `test`. Normally it is Playwright's own (phone-sized browser, app-phone.yml).
 * When EMULATOR_CDP_URL is set (app-android-emulator.yml), the same tests drive the real Chrome app
 * inside an Android emulator over the DevTools protocol instead: real screen, real Chrome, real
 * fold and rotation. Real Chrome on a phone has one profile, so each test gets a fresh tab in it,
 * with this site's cookies and storage cleared first and its routes removed after.
 */
const cdpUrl = process.env.EMULATOR_CDP_URL;

export const test = cdpUrl
  ? base.extend({
      browser: [
        async ({}, use) => {
          const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 60_000 });
          await use(browser);
          await browser.close();
        },
        { scope: 'worker' },
      ],
      context: async ({ browser }, use) => {
        const context = browser.contexts()[0];
        if (!context) throw new Error('Chrome on the emulator has no open profile.');
        await context.clearCookies();
        await use(context);
        await context.unrouteAll({ behavior: 'ignoreErrors' });
        await context.clearCookies();
      },
      page: async ({ context, baseURL }, use) => {
        const page = await context.newPage();
        // Chrome's own profile does not get Playwright's baseURL: resolve '/sign-in' etc. here.
        const origin = baseURL ?? 'http://127.0.0.1:4173';
        const go = page.goto.bind(page);
        page.goto = (url: string, options?: Parameters<typeof go>[1]) => go(new URL(url, origin).toString(), options);
        const session = await context.newCDPSession(page);
        await session.send('Storage.clearDataForOrigin', { origin: new URL(origin).origin, storageTypes: 'all' });
        await session.detach();
        await use(page);
        await page.close();
      },
    })
  : base;

export { expect };
