import { execFileSync } from 'node:child_process';
import { chromium, expect, test as base, type Browser } from '@playwright/test';

/**
 * The phone tour's `test`. Normally it is Playwright's own (phone-sized browser, app-phone.yml).
 * When EMULATOR_CDP_URL is set (app-android-emulator.yml), the same tests drive the real Chrome app
 * inside an Android emulator over the DevTools protocol instead: real screen, real Chrome, real
 * fold and rotation. Real Chrome on a phone has one profile, so each test gets a fresh tab in it,
 * with this site's cookies and storage cleared first and its routes removed after.
 */
const cdpUrl = process.env.EMULATOR_CDP_URL;

function adb(...args: string[]) {
  try {
    execFileSync('adb', args, { stdio: 'ignore', timeout: 30_000 });
  } catch {
    // Best effort: the connect retry below reports the real failure.
  }
}

/** (Re)starts Chrome on the emulator and its DevTools port forward (same steps as e2e/emulator/run.sh). */
function restartChrome() {
  adb('shell', 'am', 'force-stop', 'com.android.chrome');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'about:blank', 'com.android.chrome');
  adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote');
}

let shared: Browser | null = null;

async function connectChrome(url: string): Promise<Browser> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await chromium.connectOverCDP(url, { timeout: 30_000 });
    } catch (error) {
      last = error;
      console.warn(`Chrome on the emulator did not answer (try ${attempt + 1}); restarting it.`);
      restartChrome();
      await new Promise((r) => setTimeout(r, 8_000));
    }
  }
  throw last;
}

export const test = cdpUrl
  ? base.extend({
      // One connection, checked before every test: if Chrome on the emulator has gone away (it did
      // after ~17 screens on the first run), start it again and reconnect instead of failing every
      // test after it. Never browser.close(): over CDP that can quit Chrome itself. (Done here, not
      // in a `browser` fixture, because `browser` is worker-scoped and cannot re-check per test.)
      context: async ({}, use) => {
        if (!shared || !shared.isConnected()) shared = await connectChrome(cdpUrl);
        const browser = shared;
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
