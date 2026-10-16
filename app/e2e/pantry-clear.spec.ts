import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * "Clear items" at the top of the Pantry tab, end to end against the LOCAL Supabase stack
 * (service role for seeding and checks only; refuses any address off this machine).
 * Each test makes its own account and pantry, so they never share rows.
 *
 * Covered: clearing the Fridge leaves the Pantry and Spice rack alone; Clear all then Undo puts
 * every row back through the server with the same ids and values, after the list has refetched;
 * Cancel and Back at the confirm delete nothing; offline deletes nothing, now or later.
 */

const password = 'e2e-PantryClear-123';
const OFFLINE = "You're offline. Changes need a connection.";

type Seeded = { id: string; name: string; quantity: number; unit: string; location: string; category: string; expires_on: string | null };

const SEED = [
  { ingredient_id: 'white-rice', name: 'Clear rice', category: 'dry_goods', quantity: 2, unit: 'cup', location: 'pantry', expires_on: '2030-05-01' },
  { ingredient_id: 'black-beans', name: 'Clear beans', category: 'canned', quantity: 3, unit: 'can', location: 'pantry', expires_on: null },
  { ingredient_id: 'milk', name: 'Clear milk', category: 'dairy', quantity: 1.5, unit: 'l', location: 'fridge', expires_on: '2030-06-02' },
  { ingredient_id: 'eggs', name: 'Clear eggs', category: 'dairy', quantity: 12, unit: 'each', location: 'fridge', expires_on: null },
  // An old free-text place: shown under the Fridge, so clearing the Fridge removes it too.
  { ingredient_id: 'butter', name: 'Clear butter', category: 'dairy', quantity: 1, unit: 'block', location: 'Refrigerator', expires_on: null },
  { ingredient_id: 'cumin', name: 'Clear cumin', category: 'spices', quantity: 1, unit: 'jar', location: 'spice_rack', expires_on: null },
];

async function newSignedInUserWithPantry(page: Page, label: string): Promise<string> {
  const email = freshEmail(label);
  const admin = adminClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  const seeded = await admin.from('pantry_items').insert(SEED.map((r) => ({ ...r, user_id: userId })));
  expect(seeded.error).toBeNull();

  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
  await page.goto('/pantry');
  await expect(page.getByText(`${SEED.length} items`, { exact: true })).toBeVisible();
  return userId;
}

/** The person's rows as the server has them, sorted by name. */
async function serverRows(userId: string): Promise<Seeded[]> {
  const { data, error } = await adminClient()
    .from('pantry_items')
    .select('id, name, quantity, unit, location, category, expires_on')
    .eq('user_id', userId)
    .order('name');
  expect(error).toBeNull();
  return ((data ?? []) as Seeded[]).map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

const names = (rows: Seeded[]) => rows.map((r) => r.name);
const clearButton = (page: Page) => page.getByRole('button', { name: /^Clear items/ });
const option = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });

test('clear the Fridge: only fridge rows go, the Pantry and Spice rack stay', async ({ page }) => {
  const userId = await newSignedInUserWithPantry(page, 'clear-fridge');

  await clearButton(page).click();
  await expect(option(page, 'All items, 6 items')).toBeEnabled();
  await expect(option(page, 'Pantry, 2 items')).toBeEnabled();
  await expect(option(page, 'Spice rack, 1 item')).toBeEnabled();
  await option(page, 'Fridge, 3 items').click();
  await expect(page.getByText('Remove all 3 items from the Fridge?')).toBeVisible();
  await page.getByRole('button', { name: 'Remove 3 items', exact: true }).click();

  await expect(page.getByText('Removed 3 items from the Fridge.')).toBeVisible();
  await expect(page.getByText('3 items', { exact: true })).toBeVisible();
  await expect
    .poll(async () => names(await serverRows(userId)))
    .toEqual(['Clear beans', 'Clear cumin', 'Clear rice']);

  // The menu now shows the Fridge as empty, and its choice is disabled.
  await clearButton(page).click();
  await expect(option(page, 'Fridge, no items')).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
});

test('clear all, then Undo after the list refetched: every row comes back exactly', async ({ page }) => {
  const userId = await newSignedInUserWithPantry(page, 'clear-all');
  const before = await serverRows(userId);
  expect(before).toHaveLength(SEED.length);

  await clearButton(page).click();
  await option(page, 'All items, 6 items').click();
  await expect(page.getByText('Remove all 6 items?')).toBeVisible();
  await page.getByRole('button', { name: 'Remove 6 items', exact: true }).click();

  await expect(page.getByText('Removed 6 items.')).toBeVisible();
  await expect.poll(async () => (await serverRows(userId)).length).toBe(0);
  // The list has refetched from the server (the empty state shows), and Undo is still there.
  await expect(page.getByText('Your pantry is empty').filter({ visible: true })).toBeVisible();
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();

  await expect(page.getByText('6 items are back.')).toBeVisible();
  await expect(page.getByText(`${SEED.length} items`, { exact: true })).toBeVisible();
  await expect.poll(async () => serverRows(userId)).toEqual(before);

  // After a reload the screen still agrees with the server.
  await page.reload();
  await expect(page.getByText(`${SEED.length} items`, { exact: true })).toBeVisible();
});

test('Back and Cancel at the confirm delete nothing', async ({ page }) => {
  const userId = await newSignedInUserWithPantry(page, 'clear-cancel');
  const before = await serverRows(userId);

  await clearButton(page).click();
  await option(page, 'Pantry, 2 items').click();
  await expect(page.getByText('Remove all 2 items from the Pantry?')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await option(page, 'All items, 6 items').click();
  await expect(page.getByText('Remove all 6 items?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await expect(page.getByText('Remove all 6 items?')).toHaveCount(0);

  await page.waitForTimeout(1_500);
  expect(await serverRows(userId)).toEqual(before);
  await expect(page.getByText(`${SEED.length} items`, { exact: true })).toBeVisible();
});

test('offline: Clear is blocked with the offline message and nothing is deleted, then or later', async ({ page, context }) => {
  const userId = await newSignedInUserWithPantry(page, 'clear-offline');
  const before = await serverRows(userId);

  // Reach the confirm, then lose the connection: the confirm is blocked and says why.
  await clearButton(page).click();
  await option(page, 'Fridge, 3 items').click();
  await context.setOffline(true);
  await expect(page.getByText(OFFLINE).filter({ visible: true }).first()).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Remove 3 items', exact: true });
  await expect(confirm).toBeDisabled();
  await confirm.click({ force: true });
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();

  // The entry button is blocked too while offline.
  await expect(clearButton(page)).toBeDisabled();
  await expect(page.getByText(`${SEED.length} items`, { exact: true })).toBeVisible();

  await context.setOffline(false);
  await expect(clearButton(page)).toBeEnabled();
  await page.waitForTimeout(3_000);
  expect(await serverRows(userId)).toEqual(before);
});
