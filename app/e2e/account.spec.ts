import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * The Account screen (/account), end to end against the local stack: what the renewal terms point
 * to ("Cancel any time in Account, Manage subscription."). The local stack runs no edge functions,
 * and the live stripe-portal must never be called from a test, so it is intercepted here and
 * answered in the function's real shape ({ url }), as in plans.spec.ts. The Stripe page is answered
 * here too: no test ever loads Stripe.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Account-Password-123';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_e2e_account_stub';
const accountLink = (page: Page) => page.getByRole('link', { name: 'Account', exact: true });

async function newSignedInUser(page: Page, label: string): Promise<{ email: string; userId: string; accessToken: string }> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(accountLink(page)).toBeVisible();
  const accessToken = await savedAccessToken(page);
  expect(accessToken).not.toBeNull();
  return { email, userId: created.data.user!.id, accessToken: accessToken! };
}

/** The access token supabase-js saved in the browser, or null once signed out. */
async function savedAccessToken(page: Page): Promise<string | null> {
  const raw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) return localStorage.getItem(key);
    }
    return null;
  });
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const session = parsed.currentSession ?? parsed;
  return session?.access_token ?? null;
}

type Captured = { headers: Record<string, string>; body: Record<string, unknown> };

/** Answers stripe-portal (and its CORS preflight) with `{ url }`; records each POST. */
async function stubPortal(page: Page): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route('**/functions/v1/stripe-portal', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    captured.push({ headers: await request.allHeaders(), body: (request.postDataJSON() ?? {}) as Record<string, unknown> });
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ url: PORTAL_URL }) });
  });
  return captured;
}

/** Stripe's pages, answered locally. Returns the addresses that were opened. */
async function stubStripePages(context: BrowserContext): Promise<string[]> {
  const opened: string[] = [];
  for (const pattern of ['https://checkout.stripe.com/**', 'https://billing.stripe.com/**']) {
    await context.route(pattern, async (route) => {
      opened.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title><p>stub page</p>' });
    });
  }
  return opened;
}

async function openAccountFromHome(page: Page) {
  await page.goto('/');
  await accountLink(page).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
}

test('account: Home opens Account with email and Free plan; no Manage subscription; links and sign out work', async ({ page, context }) => {
  const { email } = await newSignedInUser(page, 'account-free');
  const opened = await stubStripePages(context);
  const portal = await stubPortal(page);

  await openAccountFromHome(page);
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await expect(page.getByTestId('current-plan')).toHaveText('Free');
  // Same rule as /plans: no live subscription, no Manage subscription.
  await expect(page.getByRole('button', { name: 'Manage subscription' })).toHaveCount(0);
  // Home no longer carries these; they are here.
  await expect(page.getByRole('link', { name: 'Plans & usage' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Delete account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  // No buy button and no tomato purchase action on Account.
  await expect(page.getByRole('button', { name: /^Subscribe for / })).toHaveCount(0);

  await page.getByRole('link', { name: 'Plans & usage' }).click();
  await expect(page).toHaveURL(/\/plans$/);
  await expect(page.getByRole('heading', { name: 'Plans', exact: true }).filter({ visible: true })).toBeVisible();

  await page.goto('/account');
  await page.getByRole('link', { name: 'Delete account' }).click();
  await expect(page).toHaveURL(/\/delete-account$/);
  await expect(page.getByRole('heading', { name: 'Delete your MealPlanatic account' })).toBeVisible();

  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect.poll(() => savedAccessToken(page)).toBeNull();

  expect(portal).toHaveLength(0);
  expect(opened).toHaveLength(0);
});

test('account: the top bar Account button opens Account from every tab; Help and contact opens Help', async ({ page, context }) => {
  await newSignedInUser(page, 'account-topbar');
  const opened = await stubStripePages(context);
  const accountButton = page.getByRole('button', { name: 'Account', exact: true });

  for (const tab of ['/', '/pantry', '/grocery', '/stores']) {
    await page.goto(tab);
    await expect(accountButton).toBeVisible();
    // Big enough to tap (DESIGN.md: 44px).
    const box = await accountButton.boundingBox();
    expect(box && box.width >= 44 && box.height >= 44, `${tab}: ${JSON.stringify(box)}`).toBeTruthy();
    await accountButton.click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  }

  // Home keeps its text link too.
  await page.goto('/');
  await expect(accountLink(page)).toBeVisible();

  await page.goto('/account');
  await page.getByRole('link', { name: 'Help and contact' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  await expect(page.getByText('Forky is an AI helper and can be wrong.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contact us' })).toBeVisible();
  for (const name of ['Read the Terms', 'Read the Privacy Policy', 'Accessibility statement']) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
  expect(opened).toHaveLength(0);
});

test('account: a subscriber sees the plan and Manage subscription opens the Stripe portal, as on /plans', async ({ page, context }) => {
  const { email, userId, accessToken } = await newSignedInUser(page, 'account-paid');
  const admin = adminClient();
  const promoted = await admin.from('profiles').update({ plan: 'paid', plan_tier: 'pro' }).eq('id', userId);
  expect(promoted.error).toBeNull();
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const billed = await admin.from('billing_subscriptions').insert({
    user_id: userId,
    stripe_customer_id: `cus_e2e_${stamp}`,
    stripe_subscription_id: `sub_e2e_${stamp}`,
    status: 'active',
    billing_interval: 'month',
    current_period_end: new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString(),
    cancel_at_period_end: false,
    plan_tier: 'pro',
  });
  expect(billed.error).toBeNull();
  const opened = await stubStripePages(context);
  const portal = await stubPortal(page);

  await openAccountFromHome(page);
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await expect(page.getByTestId('current-plan')).toHaveText('MealPlanatic Pro');
  await expect(page.getByText(/^Renews on /)).toBeVisible();
  await page.getByRole('button', { name: 'Manage subscription' }).click();

  await expect(page).toHaveURL(PORTAL_URL);
  expect(portal).toHaveLength(1);
  expect(portal[0]!.body).toEqual({});
  expect(portal[0]!.headers['authorization']).toBe(`Bearer ${accessToken}`);
  expect(opened).toEqual([PORTAL_URL]);
});
