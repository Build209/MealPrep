import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Delete account, end to end against the local stack. The local stack runs no edge functions, and
 * the live delete-user-account must never be called from a test, so it is intercepted here and
 * answered in the function's real shapes ({ ok: true }, { error, code: 'CANCEL_FAILED' }, 401).
 * Nothing is deleted on any server by these tests.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Delete-Password-123';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const WHAT_IS_DELETED =
  'You can permanently delete your account and the personal data we store for you. This includes your profile, ' +
  'pantry, saved recipes, meal plan, grocery lists, saved stores, and scan photos tied to your account. Deleting ' +
  'your account also cancels MealPlanatic Plus and stops future charges.';
const CONFIRM_BODY =
  'This permanently removes your pantry, recipes, grocery list, meal plan, and profile. If you have MealPlanatic Plus, it is cancelled now and you will not be charged again. Community store prices you shared may stay visible without your name. This cannot be undone.';

async function newSignedInUser(page: Page, label: string): Promise<{ email: string; accessToken: string }> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Signed in as')).toBeVisible();
  return { email, accessToken: (await savedAccessToken(page))! };
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
  return (parsed.currentSession ?? parsed).access_token ?? null;
}

type Captured = { method: string; headers: Record<string, string>; body: string | null };
type Answer = { status: number; json?: unknown; abort?: boolean; gate?: Promise<void> };

/** Answers delete-user-account (and its CORS preflight) with whatever `next.answer` holds; records each POST. */
async function stubDeleteFunction(page: Page, first: Answer) {
  const next = { answer: first };
  const captured: Captured[] = [];
  await page.route('**/functions/v1/delete-user-account', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    captured.push({ method: request.method(), headers: await request.allHeaders(), body: request.postData() });
    const answer = next.answer;
    if (answer.gate) await answer.gate;
    if (answer.abort) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.fulfill({
      status: answer.status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(answer.json ?? {}),
    });
  });
  return { captured, next };
}

test('delete account: Home links to it, it says what is deleted, confirm step, request, then signed out on sign-in', async ({ page }) => {
  const { email, accessToken } = await newSignedInUser(page, 'delete');
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const { captured } = await stubDeleteFunction(page, { status: 200, json: { ok: true }, gate });

  await page.getByRole('link', { name: 'Delete account' }).click();
  await expect(page).toHaveURL(/\/delete-account$/);
  await expect(page.getByRole('heading', { name: 'Delete your MealPlanatic account' })).toBeVisible();
  await expect(page.getByText(WHAT_IS_DELETED, { exact: true })).toBeVisible();
  await expect(page.getByText(email, { exact: true }).filter({ visible: true })).toBeVisible();

  // Pressing Delete account only opens the confirm step; Cancel closes it with no request.
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();
  await expect(page.getByText(CONFIRM_BODY, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete your account?' })).toHaveCount(0);
  expect(captured).toHaveLength(0);

  // Confirm: busy while the request runs.
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete my account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deleting your account…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  release();

  // Signed out, on sign-in, told it worked.
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByText('Your account and personal data have been deleted.', { exact: true })).toBeVisible();
  expect(await savedAccessToken(page)).toBeNull();

  // The request is the old app's: one POST, the person's token, JSON, body {}.
  expect(captured).toHaveLength(1);
  expect(captured[0]!.method).toBe('POST');
  expect(captured[0]!.headers['authorization']).toBe(`Bearer ${accessToken}`);
  expect(captured[0]!.headers['content-type']).toContain('application/json');
  expect(captured[0]!.body).toBe('{}');

  // Home now goes to sign-in.
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('delete account: refusals and failures say so in plain words and leave the person signed in', async ({ page }) => {
  await newSignedInUser(page, 'delete-refused');
  const { captured, next } = await stubDeleteFunction(page, {
    status: 502,
    json: {
      error:
        'We could not cancel your MealPlanatic Plus subscription, so your account was not deleted. Try again in a few minutes, or cancel in Account, Manage subscription first.',
      code: 'CANCEL_FAILED',
    },
  });

  await page.goto('/delete-account');
  // After a reload the saved session is read first; wait for the button, then open the confirm step.
  // It stays open after a failure, so each try below presses only the confirm button.
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();
  const confirmAndDelete = async () => {
    await page.getByRole('button', { name: 'Yes, delete my account', exact: true }).click();
  };

  await confirmAndDelete();
  await expect(page.getByRole('alert').filter({ visible: true })).toHaveText(
    'We could not cancel your MealPlanatic Plus subscription, so your account was not deleted. Try again in a few minutes, or cancel in Account, Manage subscription first.',
  );
  await expect(page).toHaveURL(/\/delete-account$/);
  expect(await savedAccessToken(page)).not.toBeNull();

  next.answer = { status: 500, json: { error: 'update or delete on table "profiles" violates foreign key constraint' } };
  await confirmAndDelete();
  await expect(page.getByRole('alert').filter({ visible: true })).toHaveText('Could not delete account. Try again or contact support.');

  next.answer = { status: 401, json: { error: 'Unauthorized' } };
  await confirmAndDelete();
  await expect(page.getByRole('alert').filter({ visible: true })).toHaveText('Sign in to delete your account.');

  next.answer = { status: 0, abort: true };
  await confirmAndDelete();
  await expect(page.getByRole('alert').filter({ visible: true })).toHaveText(
    "Couldn't reach the server. Check your connection and try again.",
  );

  expect(captured).toHaveLength(4);
  await expect(page).toHaveURL(/\/delete-account$/);
  expect(await savedAccessToken(page)).not.toBeNull();
});

test('delete account: signed out, the page still says what is deleted and offers sign-in', async ({ page }) => {
  await page.goto('/delete-account');
  await expect(page.getByText(WHAT_IS_DELETED, { exact: true })).toBeVisible();
  await expect(page.getByText('Sign in to delete your account from this page.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});
