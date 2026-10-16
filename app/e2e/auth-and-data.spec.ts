import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail, userClient } from './local-supabase';

/**
 * Sign-in and the data layer, end to end: the web build in Chromium against the local
 * Supabase stack (baseline schema, email confirmation off locally). Serial: later tests use
 * the account the earlier one creates.
 */
test.describe.configure({ mode: 'serial' });

const email = freshEmail('owner');
const password = 'e2e-Password-123';

const emailBox = (page: Page) => page.getByRole('textbox', { name: 'Email' });
const passwordBox = (page: Page) => page.getByLabel('Password', { exact: true });

async function expectSignInScreen(page: Page) {
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(emailBox(page)).toBeVisible();
  await expect(passwordBox(page)).toBeVisible();
}

async function expectHome(page: Page) {
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByTestId('topbar-account')).toBeVisible();
}

/** Account shows who is signed in; Sign out lives there. */
async function signOutFromAccount(page: Page) {
  await page.getByTestId('topbar-account').click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await expect(page.getByText('Signed in as')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
}

async function signInThroughUi(page: Page) {
  await page.goto('/');
  await expectSignInScreen(page);
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectHome(page);
}

/** The session the app saved in the browser (supabase-js keeps it under sb-<host>-auth-token). */
async function appSession(page: Page): Promise<{ accessToken: string; userId: string }> {
  const raw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) return localStorage.getItem(key);
    }
    return null;
  });
  expect(raw, 'the app saved a session in the browser').toBeTruthy();
  const parsed = JSON.parse(raw as string);
  const session = parsed.currentSession ?? parsed;
  expect(typeof session.access_token).toBe('string');
  expect(typeof session.user?.id).toBe('string');
  return { accessToken: session.access_token, userId: session.user.id };
}

test('signed out, / ends on the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await expectSignInScreen(page);
  await expect(page.getByText('This build has no server settings')).toHaveCount(0);
});

test('create an account (18+ box required), land on Home, then sign out', async ({ page }) => {
  await page.goto('/sign-in');
  await expectSignInScreen(page);

  await page.getByRole('tab', { name: 'Create account' }).click();
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);

  const create = page.getByRole('button', { name: 'Create account' });
  const ageBox = page.getByRole('checkbox');
  await expect(ageBox).not.toBeChecked();
  await expect(create).toBeDisabled();

  await ageBox.click();
  await expect(ageBox).toBeChecked();
  await expect(create).toBeEnabled();
  await create.click();

  await expectHome(page);

  // Usage log (src/lib/events.ts): sign_up and app_open rows for this account, nothing personal.
  const { userId } = await appSession(page);
  const admin = adminClient();
  await expect
    .poll(async () => {
      const { data } = await admin.from('app_events').select('name').eq('user_id', userId);
      return (data ?? []).map((r) => r.name).sort();
    }, { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['app_open', 'sign_up']));
  const rows = await admin.from('app_events').select('name, props, platform, session_id').eq('user_id', userId);
  expect(rows.error).toBeNull();
  for (const row of rows.data!) {
    expect(row.platform).toBe('web');
    expect(JSON.stringify(row.props)).not.toContain('@');
  }

  await signOutFromAccount(page);
  await expectSignInScreen(page);
});

test('sign back in with the same password; the session survives a reload', async ({ page }) => {
  await signInThroughUi(page);
  await page.reload();
  await expectHome(page);
});

test('data layer: profile exists and row level security returns only own pantry rows', async ({ page }) => {
  await signInThroughUi(page);
  const { accessToken, userId } = await appSession(page);
  const admin = adminClient();

  // The sign-up trigger made a free member profile.
  const profile = await admin.from('profiles').select('id, email, role').eq('id', userId).single();
  expect(profile.error).toBeNull();
  expect(profile.data).toMatchObject({ id: userId, email, role: 'member' });

  // A second person, made directly on the local server, with a pantry row of their own.
  const other = await admin.auth.admin.createUser({
    email: freshEmail('other'),
    password: 'e2e-Other-123',
    email_confirm: true,
  });
  expect(other.error).toBeNull();
  const otherId = other.data.user!.id;

  const seeded = await admin
    .from('pantry_items')
    .insert([
      { user_id: userId, ingredient_id: 'e2e-rice', name: 'E2E rice', category: 'Grains', quantity: 2, unit: 'cup' },
      { user_id: otherId, ingredient_id: 'e2e-beans', name: 'E2E beans', category: 'Canned', quantity: 1, unit: 'can' },
    ])
    .select('id, user_id');
  expect(seeded.error).toBeNull();
  const ownRowId = seeded.data!.find((r) => r.user_id === userId)!.id;
  const otherRowId = seeded.data!.find((r) => r.user_id === otherId)!.id;

  // Acting as the app's own session.
  const asUser = userClient(accessToken);

  // Own profile readable, nobody else's.
  const profiles = await asUser.from('profiles').select('id');
  expect(profiles.error).toBeNull();
  expect(profiles.data!.map((r) => r.id)).toEqual([userId]);

  // No filter at all: row level security alone returns only this person's pantry.
  const all = await asUser.from('pantry_items').select('id, user_id, name, quantity');
  expect(all.error).toBeNull();
  expect(all.data).toHaveLength(1);
  expect(all.data![0]).toMatchObject({ id: ownRowId, user_id: userId, name: 'E2E rice' });

  // The data layer's query shape (src/data/pantry.ts): filter by owner, ordered by name.
  const own = await asUser
    .from('pantry_items')
    .select('id, name')
    .eq('user_id', userId)
    .order('name', { ascending: true })
    .order('id', { ascending: true });
  expect(own.error).toBeNull();
  expect(own.data!.map((r) => r.id)).toEqual([ownRowId]);

  // The other person's row cannot be read or changed.
  const peek = await asUser.from('pantry_items').select('id').eq('id', otherRowId);
  expect(peek.error).toBeNull();
  expect(peek.data).toEqual([]);
  const tamper = await asUser.from('pantry_items').update({ quantity: 99 }).eq('id', otherRowId).select('id');
  expect(tamper.error).toBeNull();
  expect(tamper.data).toEqual([]);
  const check = await admin.from('pantry_items').select('quantity').eq('id', otherRowId).single();
  expect(Number(check.data!.quantity)).toBe(1);

  // Signed out (anon key only): no pantry rows at all.
  const anon = await userClient().from('pantry_items').select('id');
  expect(anon.data ?? []).toEqual([]);
});
