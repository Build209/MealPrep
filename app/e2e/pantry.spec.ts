import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * The Pantry tab end to end, against the local Supabase stack: sign up, add an item, see it,
 * change its quantity, delete it and undo, reload, and check the server's rows at each step.
 * Serial: later tests use the account the first one creates.
 */
test.describe.configure({ mode: 'serial' });

const email = freshEmail('pantry');
const password = 'e2e-Pantry-123';
const itemName = 'E2E oats';

const emailBox = (page: Page) => page.getByRole('textbox', { name: 'Email' });
const passwordBox = (page: Page) => page.getByLabel('Password', { exact: true });
const addButton = (page: Page) => page.getByRole('button', { name: 'Add item', exact: true });
const itemRow = (page: Page, detail: string) =>
  page.getByRole('button', { name: new RegExp(`^${itemName}, ${detail}, Pantry$`) });

async function expectHome(page: Page) {
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
}

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectHome(page);
}

/** The signed-in user's id, from the session the app saved in the browser. */
async function appUserId(page: Page): Promise<string> {
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
  expect(typeof session.user?.id).toBe('string');
  return session.user.id as string;
}

/** The person's pantry rows as the server has them (service role: test checks only). */
async function serverRows(userId: string) {
  const { data, error } = await adminClient()
    .from('pantry_items')
    .select('id, name, quantity, unit, location, category, expires_on')
    .eq('user_id', userId);
  expect(error).toBeNull();
  return (data ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

test('sign up, then the pantry starts empty and points to Add item', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectHome(page);

  await page.goto('/pantry');
  await expect(page.getByText('Your pantry is empty')).toBeVisible();
  await expect(addButton(page)).toBeEnabled();
});

test('add, see, edit quantity, delete and undo; the server agrees after a reload', async ({ page }) => {
  await signIn(page);
  const userId = await appUserId(page);
  await page.goto('/pantry');
  await expect(page.getByText('Your pantry is empty')).toBeVisible();

  // Add an item.
  await addButton(page).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(itemName);
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('2');
  await page.getByRole('textbox', { name: 'Unit', exact: true }).fill('cup');
  await page.getByRole('radio', { name: 'Pantry', exact: true }).click();
  await page.getByRole('button', { name: 'Save item', exact: true }).click();

  // See it (list view).
  await page.getByRole('radio', { name: 'List', exact: true }).click();
  await expect(itemRow(page, '2 cup')).toBeVisible();
  await expect.poll(async () => (await serverRows(userId)).map((r) => [r.name, r.quantity, r.unit, r.location])).toEqual([
    [itemName, 2, 'cup', 'pantry'],
  ]);
  const [saved] = await serverRows(userId);
  const savedId = saved!.id;
  expect(saved!.category).toBe('dry_goods');

  // Edit the quantity.
  await itemRow(page, '2 cup').click();
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('5');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(itemRow(page, '5 cup')).toBeVisible();
  await expect.poll(async () => (await serverRows(userId)).map((r) => [r.id, r.quantity])).toEqual([[savedId, 5]]);

  // Delete, then undo.
  await itemRow(page, '5 cup').click();
  await page.getByRole('button', { name: 'Delete item', exact: true }).click();
  await expect(page.getByText(`Removed ${itemName}.`)).toBeVisible();
  await expect(itemRow(page, '5 cup')).toHaveCount(0);
  await expect.poll(async () => (await serverRows(userId)).length).toBe(0);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(itemRow(page, '5 cup')).toBeVisible();
  await expect.poll(async () => (await serverRows(userId)).map((r) => [r.id, r.name, r.quantity, r.unit])).toEqual([
    [savedId, itemName, 5, 'cup'],
  ]);

  // Reload: the screen shows what the server has (the list view is remembered on this device).
  await page.reload();
  await expect(itemRow(page, '5 cup')).toBeVisible();
  const rows = await serverRows(userId);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: savedId, name: itemName, quantity: 5, unit: 'cup', location: 'pantry' });
});

test('offline: changes are blocked with the offline message', async ({ page, context }) => {
  await signIn(page);
  await page.goto('/pantry');
  // A fresh browser starts on the shelves view; the summary line is the same in both views.
  await expect(page.getByText('1 item', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("You're offline. Changes need a connection.")).toBeVisible();
  await expect(addButton(page)).toBeDisabled();
  await context.setOffline(false);
  await expect(addButton(page)).toBeEnabled();
});
