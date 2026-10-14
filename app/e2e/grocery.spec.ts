import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * The Grocery tab end to end, against the local Supabase stack: sign up, add two items, tick
 * one into an existing pantry row, undo, tick the other into a new pantry row, clear ticked,
 * reload, and check the server's rows at each step. Ticking runs public.tick_grocery_item
 * (db/supabase/migrations/20261014000000_grocery_tick.sql), so this also exercises that function.
 * Serial: later tests use the account the first one creates.
 */
test.describe.configure({ mode: 'serial' });

const email = freshEmail('grocery');
const password = 'e2e-Grocery-123';
const apples = 'E2E apples';

const emailBox = (page: Page) => page.getByRole('textbox', { name: 'Email' });
const passwordBox = (page: Page) => page.getByLabel('Password', { exact: true });
const addButton = (page: Page) => page.getByRole('button', { name: 'Add item', exact: true });
const tickBox = (page: Page, name: string) => page.getByRole('checkbox', { name: new RegExp(`^${name}, `) });

async function expectHome(page: Page) {
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
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

/** Server rows (service role: test checks only), sorted by name. */
async function groceryRows(userId: string) {
  const { data, error } = await adminClient()
    .from('grocery_list_items')
    .select('id, name, quantity, unit, category, checked, origin')
    .eq('user_id', userId)
    .order('name');
  expect(error).toBeNull();
  return (data ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

async function pantryRows(userId: string) {
  const { data, error } = await adminClient()
    .from('pantry_items')
    .select('id, name, quantity, unit')
    .eq('user_id', userId)
    .order('name');
  expect(error).toBeNull();
  return (data ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

async function addItem(page: Page, name: string, quantity: string, unit: string) {
  await addButton(page).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill(quantity);
  await page.getByRole('textbox', { name: 'Unit', exact: true }).fill(unit);
  await page.getByRole('button', { name: 'Add to list', exact: true }).click();
  await expect(tickBox(page, name)).toBeVisible();
}

test('sign up, then the list starts empty and points to Add item', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectHome(page);

  await page.goto('/grocery');
  await expect(page.getByText('Your list is empty')).toBeVisible();
  await expect(addButton(page)).toBeEnabled();
});

test('add two, tick into the pantry, undo, tick, clear ticked; the server agrees after a reload', async ({ page }) => {
  await signIn(page);
  const userId = await appUserId(page);

  // One litre of milk already at home.
  const seeded = await adminClient()
    .from('pantry_items')
    .insert({ user_id: userId, ingredient_id: 'milk', name: 'Milk', category: 'dairy', quantity: 1, unit: 'l', location: 'fridge' })
    .select('id')
    .single();
  expect(seeded.error).toBeNull();
  const milkPantryId = seeded.data!.id as string;

  await page.goto('/grocery');
  await expect(page.getByText('Your list is empty')).toBeVisible();

  // Add two items.
  await addItem(page, 'Milk', '2', 'l');
  await addItem(page, apples, '3', 'each');
  await expect.poll(async () => (await groceryRows(userId)).map((r) => [r.name, r.quantity, r.unit, r.checked, r.origin])).toEqual([
    [apples, 3, 'each', false, 'manual'],
    ['Milk', 2, 'l', false, 'manual'],
  ]);
  const milkRow = (await groceryRows(userId)).find((r) => r.name === 'Milk')!;
  expect(milkRow.category).toBe('dairy');
  await expect(page.getByRole('heading', { name: 'Dairy', exact: true })).toBeVisible();

  // Tick the milk: the pantry litre becomes 3, and the milk leaves "to buy" for "Ticked".
  await expect(tickBox(page, 'Milk')).not.toBeChecked();
  await tickBox(page, 'Milk').click();
  await expect(page.getByText('Milk is in your pantry.')).toBeVisible();
  await expect(tickBox(page, 'Milk')).toBeChecked();
  await expect.poll(async () => (await pantryRows(userId)).map((r) => [r.id, r.quantity])).toEqual([[milkPantryId, 3]]);
  await expect.poll(async () => (await groceryRows(userId)).find((r) => r.name === 'Milk')?.checked).toBe(true);

  // Undo: both come back.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Milk is back on your list.')).toBeVisible();
  await expect(tickBox(page, 'Milk')).not.toBeChecked();
  await expect.poll(async () => (await pantryRows(userId)).map((r) => [r.id, r.quantity])).toEqual([[milkPantryId, 1]]);
  await expect.poll(async () => (await groceryRows(userId)).find((r) => r.name === 'Milk')?.checked).toBe(false);

  // Tick the apples: nothing matches, so a new pantry row is made.
  await tickBox(page, apples).click();
  await expect(page.getByText(`${apples} is in your pantry.`)).toBeVisible();
  await expect(tickBox(page, apples)).toBeChecked();
  await expect.poll(async () => (await pantryRows(userId)).map((r) => [r.name, r.quantity, r.unit])).toEqual([
    [apples, 3, 'each'],
    ['Milk', 1, 'l'],
  ]);

  // Clear ticked: the apples leave the list (they stay in the pantry).
  await page.getByRole('button', { name: 'Clear ticked', exact: true }).click();
  await expect(page.getByText('Cleared 1 ticked item.')).toBeVisible();
  await expect(tickBox(page, apples)).toHaveCount(0);
  await expect.poll(async () => (await groceryRows(userId)).map((r) => r.name)).toEqual(['Milk']);
  expect((await pantryRows(userId)).map((r) => r.name)).toEqual([apples, 'Milk']);

  // Reload: the screen shows what the server has.
  await page.reload();
  await expect(tickBox(page, 'Milk')).toBeVisible();
  await expect(tickBox(page, 'Milk')).not.toBeChecked();
  await expect(tickBox(page, apples)).toHaveCount(0);
  const rows = await groceryRows(userId);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: milkRow.id, name: 'Milk', quantity: 2, unit: 'l', checked: false });

  // The pantry tab shows the apples.
  await page.goto('/pantry');
  await page.getByRole('radio', { name: 'List', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${apples}, 3 each`) })).toBeVisible();
});

test('offline: changes are blocked with the offline message', async ({ page, context }) => {
  await signIn(page);
  await page.goto('/grocery');
  await expect(tickBox(page, 'Milk')).toBeEnabled();

  await context.setOffline(true);
  await expect(page.getByText("You're offline. Changes need a connection.")).toBeVisible();
  await expect(addButton(page)).toBeDisabled();
  await expect(tickBox(page, 'Milk')).toBeDisabled();
  await context.setOffline(false);
  await expect(addButton(page)).toBeEnabled();
  await expect(tickBox(page, 'Milk')).toBeEnabled();
});
