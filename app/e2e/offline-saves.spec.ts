import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Saves made offline fail at once with the plain offline message and are never sent later
 * (spec rule: "changes need a connection and say so plainly"). TanStack Query pauses a mutation
 * started offline by default and sends it when the connection returns; the app's QueryClient
 * (src/lib/queryClient.ts) refuses every change while offline instead and never pauses one.
 * Offline is the browser's own switch (context.setOffline), which the app hears through
 * TanStack Query's onlineManager. Each test reconnects, waits, and checks the server's rows
 * (service role, local stack only) to prove nothing was written later.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-OfflineSaves-123';
const OFFLINE = "You're offline. Changes need a connection.";
/** "Promptly": the message must show well before any request could time out. */
const PROMPT = { timeout: 3_000 };
/** How long to wait after reconnecting for anything held back to be sent. */
const AFTER_RECONNECT_MS = 3_000;

function word(): string {
  let out = 'zq';
  for (let i = 0; i < 8; i++) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out;
}

async function newSignedInUser(page: Page, label: string): Promise<string> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
  return created.data.user!.id;
}

/** A master recipe with one ingredient, named with a word unique to this run. Returns its title and id. */
async function seedRecipe(): Promise<{ title: string; id: string }> {
  const tok = word();
  const title = `E2E ${tok} Soup`;
  const { data, error } = await adminClient()
    .from('recipes')
    .insert({
      name: title,
      slug: `e2e-${tok}-soup`,
      tag: 'Dinner',
      minutes: 20,
      is_master: true,
      ingredients: [{ ingredientId: 'lentils', name: `${tok} lentils`, quantity: 1, unit: 'cup' }],
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  return { title, id: (data as { id: string }).id };
}

async function rows(table: string, userId: string, columns = 'id') {
  const { data, error } = await adminClient().from(table).select(columns).eq('user_id', userId);
  expect(error).toBeNull();
  return (data ?? []) as unknown as Record<string, unknown>[];
}

async function reconnectAndWait(page: Page, context: { setOffline: (offline: boolean) => Promise<void> }) {
  await context.setOffline(false);
  await page.waitForTimeout(AFTER_RECONNECT_MS);
}

const offlineText = (page: Page) => page.getByText(OFFLINE).filter({ visible: true });
const saveHeart = (page: Page, title: string) => page.getByRole('button', { name: `Save ${title}`, exact: true });
const removeHeart = (page: Page, title: string) => page.getByRole('button', { name: `Remove ${title} from saved`, exact: true });
const addButton = (page: Page) => page.getByRole('button', { name: 'Add item', exact: true });
const tickBox = (page: Page, name: string) => page.getByRole('checkbox', { name: new RegExp(`^${name}, `) });

test('save recipe offline: the heart says it needs a connection at once, and nothing is saved later', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offsave');
  const recipe = await seedRecipe();
  await page.goto(`/recipe/r_${recipe.id}`);
  await expect(saveHeart(page, recipe.title)).toBeEnabled();

  await context.setOffline(true);
  await saveHeart(page, recipe.title).click();
  await expect(page.getByRole('alert').filter({ hasText: OFFLINE })).toBeVisible(PROMPT);
  // Not stuck: the heart is still "Save" (no optimistic change left behind) and can be pressed again.
  await expect(saveHeart(page, recipe.title)).toBeEnabled(PROMPT);
  await expect(removeHeart(page, recipe.title)).toHaveCount(0);

  await reconnectAndWait(page, context);
  expect(await rows('user_saved_recipes', userId)).toEqual([]);
  await expect(saveHeart(page, recipe.title)).toBeVisible();
});

test('unsave recipe offline: the heart says it needs a connection at once, and the save is kept', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offunsave');
  const recipe = await seedRecipe();
  await page.goto(`/recipe/r_${recipe.id}`);
  await saveHeart(page, recipe.title).click();
  await expect(removeHeart(page, recipe.title)).toBeEnabled();
  await expect.poll(async () => (await rows('user_saved_recipes', userId)).length).toBe(1);

  await context.setOffline(true);
  await removeHeart(page, recipe.title).click();
  await expect(page.getByRole('alert').filter({ hasText: OFFLINE })).toBeVisible(PROMPT);
  await expect(removeHeart(page, recipe.title)).toBeEnabled(PROMPT); // rolled back, not stuck

  await reconnectAndWait(page, context);
  expect(await rows('user_saved_recipes', userId)).toHaveLength(1);
  await page.reload();
  await expect(removeHeart(page, recipe.title)).toBeVisible();
});

test('add missing to grocery offline: blocked with the message, and nothing is added later', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offmissing');
  const recipe = await seedRecipe();
  await page.goto(`/recipe/r_${recipe.id}`);
  const add = page.getByRole('button', { name: 'Add 1 missing to grocery list', exact: true });
  await expect(add).toBeEnabled();

  await context.setOffline(true);
  await expect(add).toBeDisabled(PROMPT);
  await expect(offlineText(page).first()).toBeVisible(PROMPT);

  await reconnectAndWait(page, context);
  expect(await rows('grocery_list_items', userId)).toEqual([]);
});

test('grocery add offline: the sheet says it needs a connection, and nothing is added later', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offgroadd');
  await page.goto('/grocery');
  await addButton(page).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E offline pears');

  await context.setOffline(true);
  await expect(offlineText(page).first()).toBeVisible(PROMPT);
  const save = page.getByRole('button', { name: 'Add to list', exact: true });
  await expect(save).toBeDisabled(PROMPT);
  await save.click({ force: true }).catch(() => undefined); // a press on the blocked button does nothing
  await expect(tickBox(page, 'E2E offline pears')).toHaveCount(0);

  await reconnectAndWait(page, context);
  expect(await rows('grocery_list_items', userId)).toEqual([]);
});

test('grocery tick offline: blocked with the message; the row stays unticked and nothing moves to the pantry', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offtick');
  await page.goto('/grocery');
  await addButton(page).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E offline plums');
  await page.getByRole('button', { name: 'Add to list', exact: true }).click();
  await expect(tickBox(page, 'E2E offline plums')).toBeEnabled();
  await expect.poll(async () => (await rows('grocery_list_items', userId)).length).toBe(1);

  await context.setOffline(true);
  await expect(offlineText(page).first()).toBeVisible(PROMPT);
  await expect(tickBox(page, 'E2E offline plums')).toBeDisabled(PROMPT);
  await tickBox(page, 'E2E offline plums').click({ force: true }).catch(() => undefined);

  await reconnectAndWait(page, context);
  expect(await rows('grocery_list_items', userId, 'name, checked')).toEqual([{ name: 'E2E offline plums', checked: false }]);
  expect(await rows('pantry_items', userId)).toEqual([]);
  await expect(tickBox(page, 'E2E offline plums')).not.toBeChecked();
});

test('pantry add offline: the sheet says it needs a connection, and nothing is added later', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offpantry');
  await page.goto('/pantry');
  await expect(addButton(page)).toBeEnabled();
  await addButton(page).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E offline rice');
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('2');

  await context.setOffline(true);
  await expect(offlineText(page).first()).toBeVisible(PROMPT);
  const save = page.getByRole('button', { name: 'Save item', exact: true });
  await expect(save).toBeDisabled(PROMPT);
  await save.click({ force: true }).catch(() => undefined);

  await reconnectAndWait(page, context);
  expect(await rows('pantry_items', userId)).toEqual([]);
});
