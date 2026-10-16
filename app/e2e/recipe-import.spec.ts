import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Recipe import from a link, end to end against the local stack. The local stack runs no edge
 * functions (and the live recipe-import must never be called from a test), so the request to
 * /functions/v1/recipe-import is intercepted and answered here in the function's real shape.
 * Everything else (sign-in, the allowance read, the insert into recipes) is the real local server.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Import-Password-123';
const FUNCTION = '**/functions/v1/recipe-import';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const LINK = 'https://www.example.com/recipes/weeknight-garlic-pasta';

async function newSignedInUser(page: Page, label: string): Promise<{ userId: string; accessToken: string }> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('topbar-account')).toBeVisible();
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

/** Answers recipe-import (and its CORS preflight) with `status` and `json`; records each POST. */
async function stubRecipeImport(page: Page, status: number, json: Record<string, unknown>): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(FUNCTION, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    captured.push({ headers: await request.allHeaders(), body: request.postDataJSON() as Record<string, unknown> });
    await route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  });
  return captured;
}

const period = () => new Date().toISOString().slice(0, 7);

/** The function's 200 answer for a web recipe page (recipe-import/index.ts + the usage wrapper). */
const importAnswer = {
  recipe: {
    title: 'Weeknight Garlic Pasta',
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 15,
    ingredients: [
      { name: 'spaghetti', quantity: 12, unit: 'oz' },
      { name: 'garlic', quantity: 4, unit: 'clove', note: 'thinly sliced' },
      { name: 'olive oil', quantity: 3, unit: 'tbsp' },
    ],
    steps: ['Boil the pasta in salted water.', 'Warm the garlic in the oil.', 'Toss together and serve.'],
    is_recipe: true,
    confidence: 0.92,
    source_url: LINK,
    source_type: 'web',
    source_title: 'Weeknight Garlic Pasta | Example Kitchen',
    social_author_name: 'Jane Cook',
    social_author_url: 'https://www.example.com/authors/jane',
    image_url: 'https://www.example.com/images/pasta.jpg',
  },
  cached: false,
  usage: { remaining: 1, limit: 2, isPlus: false, tier: 'free' },
};

test('import a link: allowance on the button, review, light edit, save makes the person\'s own recipe with credit', async ({ page }) => {
  const { userId, accessToken } = await newSignedInUser(page, 'importer');
  const captured = await stubRecipeImport(page, 200, importAnswer);

  await page.goto('/recipes/import');
  const importButton = page.getByRole('button', { name: 'Import · 2 imports left this month' });
  await expect(importButton).toBeVisible();

  await page.getByRole('textbox', { name: 'Recipe link or text' }).fill(LINK);
  await importButton.click();

  await expect(page.getByText('Review before saving')).toBeVisible();
  expect(captured).toHaveLength(1);
  const sent = captured[0]!;
  expect(sent.headers['authorization']).toBe(`Bearer ${accessToken}`);
  expect(sent.headers['content-type']).toContain('application/json');
  expect(sent.headers['apikey']).toBeTruthy();
  expect(sent.body).toEqual({ action: 'link', url: LINK });

  await expect(page.getByRole('textbox', { name: 'Recipe name' })).toHaveValue('Weeknight Garlic Pasta');
  await expect(page.getByText('Ingredients (3)')).toBeVisible();
  await expect(page.getByText('Steps (3)')).toBeVisible();
  await expect(page.getByText('By Jane Cook')).toBeVisible();

  // Light edits: rename, two servings, drop the oil.
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('Garlic Pasta for Two');
  await page.getByRole('textbox', { name: 'Servings' }).fill('2');
  await page.getByRole('button', { name: 'Remove ingredient 3' }).click();
  await expect(page.getByText('Ingredients (2)')).toBeVisible();

  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page).toHaveURL(/\/recipe\/r_[0-9a-f-]{36}$/);
  const rowId = /\/recipe\/r_([0-9a-f-]{36})$/.exec(page.url())![1];

  const rows = await adminClient()
    .from('recipes')
    .select('id, name, servings, minutes, is_master, created_by, ingredients, steps, source_url, source_type, source_title, source_author_url, source_channel_name, prep_minutes, cook_minutes, image_url')
    .eq('created_by', userId);
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(1);
  const row = rows.data![0]!;
  expect(row).toMatchObject({
    id: rowId,
    name: 'Garlic Pasta for Two',
    servings: 2,
    minutes: 25,
    is_master: false,
    created_by: userId,
    source_url: LINK,
    source_type: 'web',
    source_title: 'Jane Cook',
    source_author_url: 'https://www.example.com/authors/jane',
    source_channel_name: null,
    prep_minutes: 10,
    cook_minutes: 15,
    image_url: 'https://www.example.com/images/pasta.jpg',
  });
  expect((row.ingredients as Array<{ name: string }>).map((i) => i.name)).toEqual(['spaghetti', 'garlic (thinly sliced)']);
  expect(row.steps).toEqual(importAnswer.recipe.steps);
});

test('allowance used up: the server\'s refusal shows the plain message and nothing is saved', async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'importrefused');
  const captured = await stubRecipeImport(page, 429, {
    error: 'You have used your 2 free recipe imports for this month. They reset on the 1st. A paid plan includes more.',
    code: 'IMPORT_LIMIT_REACHED',
    usage: { remaining: 0, limit: 2, isPlus: false, tier: 'free' },
  });

  await page.goto('/recipes/import');
  await page.getByRole('textbox', { name: 'Recipe link or text' }).fill(LINK);
  await page.getByRole('button', { name: 'Import · 2 imports left this month' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'You have used your 2 free recipe imports for this month' })).toBeVisible();
  expect(captured).toHaveLength(1);
  await expect(page.getByText('Review before saving')).toHaveCount(0);

  const rows = await adminClient().from('recipes').select('id').eq('created_by', userId);
  expect(rows.error).toBeNull();
  expect(rows.data).toEqual([]);
});

test('no imports left this month: the button says so and does not call the function', async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'importusedup');
  const seeded = await adminClient().from('recipe_import_usage').insert({ user_id: userId, period: period(), imports: 2 });
  expect(seeded.error).toBeNull();
  const captured = await stubRecipeImport(page, 500, { error: 'must not be called' });

  await page.goto('/recipes/import');
  const button = page.getByRole('button', { name: 'No imports left this month' });
  await expect(button).toBeVisible();
  await expect(page.getByText("You've used your 2 free recipe imports this month.", { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Recipe link or text' }).fill(LINK);
  await button.click();
  await expect(page.getByText('Review before saving')).toHaveCount(0);
  expect(captured).toHaveLength(0);
});
