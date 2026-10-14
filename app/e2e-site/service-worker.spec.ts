import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './guard';

/**
 * The old app installed a service worker at /sw.js (scope "/") and kept files in
 * "meal-prep-shell-*" caches. The new site serves a clean-up worker at the same address
 * (app/public/sw.js) and a no-op /pwa-register.js (app/public/pwa-register.js).
 *
 * Simulation: serve-pages.mjs serves a stand-in of the old worker (fixtures/old-sw.js) at
 * /sw.js while in "old" mode. A page installs it exactly as the old app did, then the server
 * switches /sw.js back to the site's own file, and the browser's update path replaces the old worker.
 * Chromium only (Playwright's bundled build). Each test gets a fresh browser profile.
 */
test.describe.configure({ mode: 'serial' });

const OLD_SHELL = 'meal-prep-shell-e2e-7'; // made by the stand-in worker's install
const OLDER_SHELL = 'meal-prep-shell-v1'; // an older version's leftover cache
const OTHER = 'not-ours-e2e'; // a cache the clean-up must leave alone

async function setSwMode(request: APIRequestContext, mode: 'old' | 'site') {
  const res = await request.get(`/__e2e__/sw-mode?mode=${mode}`);
  expect(await res.text()).toBe(mode);
}

type SwState = { registrations: string[]; caches: string[]; controlled: boolean };

/** Registrations, cache names and whether the page is controlled; null while the page reloads. */
async function swState(page: Page): Promise<SwState | null> {
  try {
    return await page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
      caches: (await caches.keys()).sort(),
      controlled: navigator.serviceWorker.controller !== null,
    }));
  } catch {
    return null;
  }
}

/** Installs the old worker the way the old app did and leaves the page controlled by it. */
async function installOldWorker(page: Page, request: APIRequestContext) {
  await setSwMode(request, 'old');
  await page.goto('/__e2e__/old-page');
  await page.evaluate(() => (window as unknown as { __oldWorkerReady: Promise<boolean> }).__oldWorkerReady);
  await page.evaluate(
    async ([older, other]) => {
      const a = await caches.open(older as string);
      await a.put('/e2e-leftover', new Response('old'));
      const b = await caches.open(other as string);
      await b.put('/e2e-other', new Response('keep'));
    },
    [OLDER_SHELL, OTHER],
  );
  // A fresh load so the page is controlled the normal way (not only through clients.claim).
  await page.reload();
  await expect.poll(async () => (await swState(page))?.controlled).toBe(true);
  const before = await swState(page);
  expect(before?.registrations).toEqual([new URL('/', page.url()).href]);
  expect(before?.caches).toEqual(expect.arrayContaining([OLD_SHELL, OLDER_SHELL, OTHER]));
  // The old worker answers requests: the precached shell is in its cache.
  const cachedRoot = await page.evaluate(async (name) => !!(await (await caches.open(name)).match('/')), OLD_SHELL);
  expect(cachedRoot).toBe(true);
}

async function expectCleanedUp(page: Page) {
  await expect
    .poll(async () => (await swState(page))?.registrations, { timeout: 30_000, message: 'old registration removed' })
    .toEqual([]);
  await expect
    .poll(async () => (await swState(page))?.caches.filter((c) => c.startsWith('meal-prep-shell-')), {
      message: 'meal-prep-shell-* caches deleted',
    })
    .toEqual([]);
  expect((await swState(page))?.caches).toContain(OTHER);
  // The next load is not controlled by any worker and opens the new app from the network.
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect.poll(async () => (await swState(page))?.controlled).toBe(false);
  expect((await swState(page))?.registrations).toEqual([]);
}

test.afterEach(async ({ request }) => {
  await setSwMode(request, 'site');
});

test('opening the site after the update: the old worker is replaced, caches deleted, registration gone', async ({
  page,
  request,
}) => {
  await installOldWorker(page, request);
  // The site is now the new one. The person opens the app again (a navigation in scope makes
  // the browser check /sw.js for an update; no page code asks for it).
  await setSwMode(request, 'site');
  await page.goto('/');
  await expectCleanedUp(page);
});

test('the old app asking for an update (registration.update(), as the old pwa-register.js did)', async ({
  page,
  request,
}) => {
  await installOldWorker(page, request);
  await setSwMode(request, 'site');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/');
    await reg?.update();
  });
  await expectCleanedUp(page);
});

test('a cached old page loading /pwa-register.js removes the worker and its caches', async ({ page, request }) => {
  await installOldWorker(page, request);
  // Still "old" mode: only pwa-register.js does the work here, not the worker update.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/pwa-register.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('pwa-register.js did not load'));
        document.head.appendChild(s);
      }),
  );
  await expect.poll(async () => (await swState(page))?.registrations, { timeout: 30_000 }).toEqual([]);
  await expect
    .poll(async () => (await swState(page))?.caches.filter((c) => c.startsWith('meal-prep-shell-')))
    .toEqual([]);
  expect((await swState(page))?.caches).toContain(OTHER);
  await setSwMode(request, 'site');
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect.poll(async () => (await swState(page))?.controlled).toBe(false);
});

test('the site itself registers no worker', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await page.waitForTimeout(1_000);
  expect((await swState(page))?.registrations).toEqual([]);
});
