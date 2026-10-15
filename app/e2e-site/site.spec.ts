import type { Page } from '@playwright/test';
import { expect, test } from './guard';

/**
 * The built site (app/scripts/build-site.sh) served like GitHub Pages (serve-pages.mjs):
 * the app at /, deep links through 404.html, the legal pages, the redirect stubs and /209/.
 * Signed out throughout: the build has a dummy Supabase address and no account exists.
 */

const origin = () => test.info().project.use.baseURL ?? '';

/** Path + query of a URL on the test server. */
function local(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

/** Every address the main frame shows, in order (document loads and in-app route changes). */
function trackAddresses(page: Page): string[] {
  const seen: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) seen.push(local(frame.url()));
  });
  return seen;
}

/** The app rendered something: not GitHub's plain 404 page and not an empty root. */
async function expectAppRendered(page: Page) {
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.locator('body')).not.toContainText('File not found');
  await expect(page.locator('body')).not.toContainText("There isn't a GitHub Pages site here");
}

async function expectSignIn(page: Page) {
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expectAppRendered(page);
}

test('/ opens the app (signed out: sign-in)', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expectSignIn(page);
});

test.describe('deep links open through 404.html', () => {
  for (const path of ['/pantry', '/grocery', '/stores', '/recipes/search', '/account', '/plans']) {
    test(`${path} opens the app on that route (signed out: sign-in)`, async ({ page }) => {
      const seen = trackAddresses(page);
      const response = await page.goto(path);
      // GitHub Pages answers unknown addresses with 404.html and status 404; the page is the app.
      expect(response?.status()).toBe(404);
      await expectSignIn(page);
      expect(seen[0]).toBe(path);
    });
  }

  test('/delete-account renders its own screen without a session', async ({ page }) => {
    const response = await page.goto('/delete-account');
    // Served from delete-account.html with 200: Google Play's deletion-URL check needs a 200.
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/delete-account$/);
    await expect(page.getByText('Sign in to delete your account from this page.')).toBeVisible();
    await expectAppRendered(page);
  });

  test('/reset-password renders its own screen without a session', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByText(/That reset link has expired or was already used/)).toBeVisible();
    await expectAppRendered(page);
  });

  test('an unknown address shows the app\'s own "Page not found" screen', async ({ page }) => {
    const response = await page.goto('/no-such-page-e2e');
    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(/\/no-such-page-e2e$/);
    await expect(page.getByText('That page does not exist.')).toBeVisible();
    await expectAppRendered(page);
  });
});

test.describe('legal pages', () => {
  const pages = [
    ['/terms.html', 'Terms of Use'],
    ['/terms/', 'Terms of Use'],
    ['/privacy.html', 'Privacy Policy'],
    ['/privacy/', 'Privacy Policy'],
    ['/accessibility.html', 'Accessibility'],
  ] as const;
  for (const [path, heading] of pages) {
    test(`${path} shows ${heading}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(heading));
    });
  }

  test('relative links between the legal pages under /privacy/ and /terms/ reach the other page', async ({ page }) => {
    await page.goto('/privacy/terms.html');
    await expect(page).toHaveURL(`${origin()}/terms.html`);
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
    await page.goto('/terms/privacy.html');
    await expect(page).toHaveURL(`${origin()}/privacy.html`);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  });
});

test.describe('redirect stubs land on the new addresses', () => {
  // [old address, where the stub sends you]. App routes then open in the app (signed out, the
  // ones that need a session go on to sign-in, which is fine: the stub's target was loaded).
  const stubs = [
    ['/recipes', '/recipes/search'],
    ['/recipes/', '/recipes/search'],
    ['/recipes.html', '/recipes/search'],
    ['/recipes?q=egg', '/recipes/search?q=egg'],
    ['/discover-recipes', '/recipes/search'],
    ['/smart-shop', '/stores'],
    ['/pantry-staples', '/pantry'],
    ['/profile', '/account'],
    ['/admin', '/'],
    ['/app/', '/'],
    ['/app/pantry', '/pantry'],
    ['/app/smart-shop/', '/stores'],
  ] as const;
  for (const [from, to] of stubs) {
    test(`${from} -> ${to}`, async ({ page }) => {
      const seen = trackAddresses(page);
      await page.goto(from);
      await expect.poll(() => seen).toContain(to);
      await expectAppRendered(page);
    });
  }

  test('/app/privacy/ -> /privacy (the legal page)', async ({ page }) => {
    const seen = trackAddresses(page);
    await page.goto('/app/privacy/');
    await expect.poll(() => seen).toContain('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  });

  test('/kitchen.html -> /209/kitchen.html', async ({ page }) => {
    await page.goto('/kitchen.html');
    await expect(page).toHaveURL(`${origin()}/209/kitchen.html`);
    await expect(page).toHaveTitle(/209 Meal Prep/);
  });
});

test.describe('209 Meal Prep site', () => {
  test('/209/ serves', async ({ page }) => {
    const response = await page.goto('/209/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/209 Meal Prep/);
  });

  test('/209 gets the trailing slash, as on GitHub Pages', async ({ page }) => {
    await page.goto('/209');
    await expect(page).toHaveURL(`${origin()}/209/`);
    await expect(page).toHaveTitle(/209 Meal Prep/);
  });
});
