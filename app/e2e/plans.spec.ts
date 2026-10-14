import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Plans and usage screens, end to end against the local stack. The local stack runs no edge
 * functions, and the live stripe-checkout / stripe-portal must never be called from a test, so
 * both are intercepted here and answered in the functions' real shape ({ url }). The Stripe page
 * the app is sent to is answered here too: no test ever loads Stripe or the live site, and no
 * checkout (real or test mode) is ever created.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Plans-Password-123';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_e2e_stub';
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_e2e_stub';

function period(): string {
  return new Date().toISOString().slice(0, 7);
}

async function newSignedInUser(page: Page, label: string): Promise<{ userId: string; accessToken: string }> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
  const raw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) return localStorage.getItem(key);
    }
    return null;
  });
  const parsed = JSON.parse(raw as string);
  const session = parsed.currentSession ?? parsed;
  return { userId: created.data.user!.id, accessToken: session.access_token };
}

type Captured = { headers: Record<string, string>; body: Record<string, unknown> };

/** Answers one billing function (and its CORS preflight) with `{ url }`; records each POST. */
async function stubBillingFunction(page: Page, name: 'stripe-checkout' | 'stripe-portal', url: string): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(`**/functions/v1/${name}`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    captured.push({ headers: await request.allHeaders(), body: (request.postDataJSON() ?? {}) as Record<string, unknown> });
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
  });
  return captured;
}

/** Stripe's pages and the live site, answered locally. Returns the addresses that were opened. */
async function stubOutsidePages(context: BrowserContext): Promise<string[]> {
  const opened: string[] = [];
  for (const pattern of ['https://checkout.stripe.com/**', 'https://billing.stripe.com/**', 'https://mealplanatic.app/**']) {
    await context.route(pattern, async (route) => {
      opened.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title><p>stub page</p>' });
    });
  }
  return opened;
}

const COMBOS = [
  { tier: 'Plus', interval: 'Pay yearly', disclosure: 'MealPlanatic Plus is $53.88 a year. It renews automatically every year until you cancel. Cancel any time in Account, Manage subscription.', button: 'Subscribe for $53.88 a year' },
  { tier: 'Plus', interval: 'Pay monthly', disclosure: 'MealPlanatic Plus is $4.99 a month. It renews automatically every month until you cancel. Cancel any time in Account, Manage subscription.', button: 'Subscribe for $4.99 a month' },
  { tier: 'Pro', interval: 'Pay yearly', disclosure: 'MealPlanatic Pro is $93.84 a year. It renews automatically every year until you cancel. Cancel any time in Account, Manage subscription.', button: 'Subscribe for $93.84 a year' },
  { tier: 'Pro', interval: 'Pay monthly', disclosure: 'MealPlanatic Pro is $8.99 a month. It renews automatically every month until you cancel. Cancel any time in Account, Manage subscription.', button: 'Subscribe for $8.99 a month' },
  { tier: 'Family', interval: 'Pay yearly', disclosure: 'MealPlanatic Family is $192 a year. It renews automatically every year until you cancel. Cancel any time in Account, Manage subscription.', button: 'Subscribe for $192 a year' },
  { tier: 'Family', interval: 'Pay monthly', disclosure: 'MealPlanatic Family is $20 a month. It renews automatically every month until you cancel. Cancel any time in Account, Manage subscription.', button: 'Subscribe for $20 a month' },
];

test('plans: Home, Account links to plans; the renewal terms sit directly above every buy button, which states the price', async ({ page, context }) => {
  await newSignedInUser(page, 'plans');
  const opened = await stubOutsidePages(context);
  const checkout = await stubBillingFunction(page, 'stripe-checkout', CHECKOUT_URL);

  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await page.getByRole('link', { name: 'Plans & usage' }).click();
  await expect(page).toHaveURL(/\/plans$/);
  // Account stays mounted (hidden) under /plans and has its own plan card: match the visible one.
  await expect(page.getByTestId('current-plan').filter({ visible: true })).toHaveText('Free');
  await expect(page.getByText('Free: 3 scans, 2 recipe imports and 5 Ask Forky questions a month.')).toBeVisible();

  // Nothing pre-chosen beyond the plan and period themselves, and no tick box anywhere on the screen.
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Pay yearly' })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^MealPlanatic Plus,/ })).toBeChecked();

  for (const combo of COMBOS) {
    await page.getByRole('radio', { name: combo.interval }).click();
    await page.getByRole('radio', { name: new RegExp(`^MealPlanatic ${combo.tier},`) }).click();
    const disclosure = page.getByTestId('renewal-disclosure');
    const button = page.getByRole('button', { name: combo.button });
    await expect(disclosure).toContainText(combo.disclosure);
    await expect(disclosure).toContainText('See Terms.');
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    // Directly above: the disclosure is the element right before the button, ending just above it.
    const d = (await disclosure.boundingBox())!;
    const b = (await button.boundingBox())!;
    expect(d.y + d.height).toBeLessThanOrEqual(b.y + 1);
    expect(b.y - (d.y + d.height)).toBeLessThan(40);
    const order = await page.getByTestId('purchase-block').evaluate((el) =>
      Array.from(el.children).map((c) => (c.getAttribute('data-testid') ?? c.querySelector('[data-testid]')?.getAttribute('data-testid')) || ''),
    );
    expect(order).toEqual(['renewal-disclosure', 'buy-button']);
    // One filled tomato (purchase) button on the screen.
    await expect(page.getByRole('button', { name: /^Subscribe for / })).toHaveCount(1);
  }

  // Pressure and savings wording never appears.
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/save \d|\d+% off|today only|hurry|last chance|ends soon|limited time/i);
  expect(checkout).toHaveLength(0);
  expect(opened).toHaveLength(0);
});

test('plans: buy calls stripe-checkout with the tier and period and the user token, then opens the returned Stripe page', async ({ page, context }) => {
  const { accessToken } = await newSignedInUser(page, 'buy');
  const opened = await stubOutsidePages(context);
  const checkout = await stubBillingFunction(page, 'stripe-checkout', CHECKOUT_URL);
  const portal = await stubBillingFunction(page, 'stripe-portal', PORTAL_URL);

  await page.goto('/plans');
  await page.getByRole('radio', { name: 'Pay monthly' }).click();
  await page.getByRole('radio', { name: /^MealPlanatic Pro,/ }).click();
  await page.getByRole('button', { name: 'Subscribe for $8.99 a month' }).click();

  await expect(page).toHaveURL(CHECKOUT_URL);
  expect(checkout).toHaveLength(1);
  expect(checkout[0]!.body).toEqual({ interval: 'month', tier: 'pro' });
  const { tier, interval } = checkout[0]!.body as { tier: string; interval: string };
  expect(`${tier}_${interval === 'year' ? 'yearly' : 'monthly'}`).toBe('pro_monthly'); // the Stripe price lookup key
  expect(checkout[0]!.headers['authorization']).toBe(`Bearer ${accessToken}`);
  expect(checkout[0]!.headers['content-type']).toContain('application/json');
  expect(portal).toHaveLength(0);
  expect(opened).toEqual([CHECKOUT_URL]);
});

test('plans: a subscriber sees the current plan and Manage subscription opens the Stripe portal; nothing to buy', async ({ page, context }) => {
  const { userId, accessToken } = await newSignedInUser(page, 'manage');
  const admin = adminClient();
  const promoted = await admin.from('profiles').update({ plan: 'paid', plan_tier: 'pro' }).eq('id', userId);
  expect(promoted.error).toBeNull();
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const periodEnd = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
  const billed = await admin.from('billing_subscriptions').insert({
    user_id: userId,
    stripe_customer_id: `cus_e2e_${stamp}`,
    stripe_subscription_id: `sub_e2e_${stamp}`,
    status: 'active',
    billing_interval: 'month',
    current_period_end: periodEnd,
    cancel_at_period_end: false,
    plan_tier: 'pro',
  });
  expect(billed.error).toBeNull();
  const opened = await stubOutsidePages(context);
  const checkout = await stubBillingFunction(page, 'stripe-checkout', CHECKOUT_URL);
  const portal = await stubBillingFunction(page, 'stripe-portal', PORTAL_URL);

  await page.goto('/plans');
  await expect(page.getByTestId('current-plan')).toHaveText('MealPlanatic Pro');
  await expect(page.getByText(/^Renews on /)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Subscribe for / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage subscription' }).click();

  await expect(page).toHaveURL(PORTAL_URL);
  expect(portal).toHaveLength(1);
  expect(portal[0]!.body).toEqual({});
  expect(portal[0]!.headers['authorization']).toBe(`Bearer ${accessToken}`);
  expect(checkout).toHaveLength(0);
  expect(opened).toEqual([PORTAL_URL]);
});

test("usage: this month's scans, imports and Ask Forky questions against the plan's limits", async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'usage');
  const admin = adminClient();
  const month = period();
  expect((await admin.from('photo_scan_usage').insert({ user_id: userId, period: month, scans: 2 })).error).toBeNull();
  expect((await admin.from('recipe_import_usage').insert({ user_id: userId, period: month, imports: 1 })).error).toBeNull();
  expect((await admin.from('forky_chat_usage').insert({ user_id: userId, period: month, messages: 4 })).error).toBeNull();
  // An older month is not counted.
  expect((await admin.from('photo_scan_usage').insert({ user_id: userId, period: '2000-01', scans: 3 })).error).toBeNull();

  await page.goto('/plans');
  await page.getByRole('link', { name: 'Usage this month' }).click();
  await expect(page).toHaveURL(/\/usage$/);
  await expect(page.getByTestId('usage-plan')).toHaveText('Free');
  await expect(page.getByTestId('usage-scans')).toContainText('2 of 3 used');
  await expect(page.getByTestId('usage-scans')).toContainText('1 left this month');
  await expect(page.getByTestId('usage-imports')).toContainText('1 of 2 used');
  await expect(page.getByTestId('usage-forky')).toContainText('4 of 5 used');
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\bdaily\b|\bper day\b|\btoday\b/i);
});
