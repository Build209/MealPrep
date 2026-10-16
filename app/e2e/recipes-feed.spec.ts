import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail, userClient } from './local-supabase';

/**
 * The Recipes tab's "Cook from your pantry" (Home until 2026-10-15) and the recipe detail, end to end against the local stack:
 * two master recipes and a pantry are seeded with the local service key; the feed shows the right
 * status stickers; the detail marks each ingredient have / missing; "Add 3 missing to grocery
 * list" runs public.add_missing_to_grocery (db/supabase/migrations/20261014030000_add_missing_to_grocery.sql)
 * and the server's grocery rows are checked, including the merge into an open row and that a
 * repeat add changes nothing. Serial: later tests use the account the first one creates.
 */
test.describe.configure({ mode: 'serial' });

const email = freshEmail('recipes');
const password = 'e2e-Recipes-123';
const run = `${Date.now() % 100000}`;
const pastaName = `E2E Ready Pasta ${run}`;
const tacoName = `E2E Missing Tacos ${run}`;
const seededRecipeIds: string[] = [];

const emailBox = (page: Page) => page.getByRole('textbox', { name: 'Email' });
const passwordBox = (page: Page) => page.getByLabel('Password', { exact: true });
const card = (page: Page, name: string, status: string) => page.getByRole('button', { name: `${name}, ${status}`, exact: true });

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

/** The session the app saved in the browser. */
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
  return { accessToken: session.access_token as string, userId: session.user.id as string };
}

/** Server rows (service role: test checks only), sorted by name. */
async function groceryRows(userId: string) {
  const { data, error } = await adminClient()
    .from('grocery_list_items')
    .select('id, name, quantity, unit, category, checked, origin, source_recipe_ids')
    .eq('user_id', userId)
    .order('name');
  expect(error).toBeNull();
  return (data ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

test.afterAll(async () => {
  if (seededRecipeIds.length > 0) await adminClient().from('recipes').delete().in('id', seededRecipeIds);
});

test('sign up; the Recipes tab shows the feed links and asks for pantry food', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectHome(page);

  // The feed is on the Recipes tab now, not Home.
  await expect(page.getByRole('heading', { name: 'Cook from your pantry' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Recipes', exact: true }).or(page.getByRole('link', { name: 'Recipes', exact: true })).first().click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cook from your pantry' })).toBeVisible();
  await expect(page.getByText('Your pantry is empty').filter({ visible: true })).toBeVisible();
  for (const [name, href] of [
    ['Search recipes', '/recipes/search'],
    ['Saved', '/recipes/saved'],
  ]) {
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }
  // Import is a secondary button (it spends an import only after a further tap on the next page).
  await page.getByRole('button', { name: 'Import a recipe', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/import$/);
});

test('feed statuses, detail have/missing, add missing to grocery once', async ({ page }) => {
  await signIn(page);
  const { accessToken, userId } = await appSession(page);
  const admin = adminClient();

  // Two master recipes (visible to everyone; removed again after the run).
  const recipes = await admin
    .from('recipes')
    .insert([
      {
        name: pastaName,
        servings: 2,
        minutes: 20,
        is_master: true,
        ingredients: [
          { ingredientId: 'spaghetti', name: 'Spaghetti', quantity: 1, unit: 'lb' },
          { ingredientId: 'parmesan', name: 'Parmesan', quantity: 2, unit: 'oz' },
          { ingredientId: 'salt', name: 'Salt', quantity: 1, unit: 'tsp' },
        ],
        steps: ['Boil the pasta.', 'Toss with cheese.'],
      },
      {
        name: tacoName,
        servings: 4,
        minutes: 30,
        is_master: true,
        ingredients: [
          { ingredientId: 'tortillas', name: 'Tortillas', quantity: 8, unit: 'each' },
          { ingredientId: 'ground-beef', name: 'Ground beef', quantity: 1, unit: 'lb' },
          { ingredientId: 'cilantro', name: 'Cilantro', quantity: 1, unit: 'bunch' },
          { ingredientId: 'lime', name: 'Lime', quantity: 2, unit: 'each' },
        ],
        steps: ['Brown the beef.', 'Fill the tortillas.'],
      },
    ])
    .select('id, name');
  expect(recipes.error).toBeNull();
  for (const row of recipes.data ?? []) seededRecipeIds.push(row.id as string);
  const tacoId = (recipes.data ?? []).find((r) => r.name === tacoName)!.id as string;

  // The pantry: everything for the pasta; tortillas and half the beef for the tacos.
  const pantry = await admin.from('pantry_items').insert([
    { user_id: userId, ingredient_id: 'spaghetti', name: 'Spaghetti', category: 'dry_goods', quantity: 2, unit: 'lb', location: 'pantry' },
    { user_id: userId, ingredient_id: 'parmesan', name: 'Parmesan', category: 'dairy', quantity: 4, unit: 'oz', location: 'fridge' },
    { user_id: userId, ingredient_id: 'tortillas', name: 'Tortillas', category: 'dry_goods', quantity: 10, unit: 'each', location: 'pantry' },
    { user_id: userId, ingredient_id: 'ground-beef', name: 'Ground beef', category: 'meats', quantity: 0.5, unit: 'lb', location: 'fridge' },
  ]);
  expect(pantry.error).toBeNull();

  // One lime already on the list (typed by hand): it counts as in the cart, so only 1 more lime is added to it.
  const lime = await admin
    .from('grocery_list_items')
    .insert({ user_id: userId, ingredient_id: 'manual-lime-1', name: 'Lime', category: 'produce', quantity: 1, unit: 'each', origin: 'manual' })
    .select('id')
    .single();
  expect(lime.error).toBeNull();

  // Recipes tab: pasta is ready to cook; tacos show 3 missing (no tortillas needed, beef short, cilantro and lime).
  await page.goto('/recipes');
  await expect(card(page, pastaName, 'Ready to cook')).toBeVisible();
  await expect(card(page, tacoName, '3 missing')).toBeVisible();

  // Detail.
  await card(page, tacoName, '3 missing').click();
  await expect(page).toHaveURL(new RegExp(`/recipe/r_${tacoId}$`));
  await expect(page.getByRole('heading', { name: tacoName })).toBeVisible();
  await expect(page.getByText('4 servings · 30 min', { exact: true }).filter({ visible: true })).toBeVisible(); // the Recipes tab stays mounted underneath
  await expect(page.getByLabel('Tortillas, 8 each, In pantry', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Ground beef, 1 lb, Need ½ lb more', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cilantro, 1 bunch, Missing', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Lime, 2 each, Need 1 each more (some in cart)', { exact: true })).toBeVisible();
  await expect(page.getByText('Brown the beef.', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/verify before you cook/).filter({ visible: true })).toBeVisible();

  await expect(page.getByText('3 items needed', { exact: true })).toBeVisible();

  // Add the missing items: two new rows, the lime row grows from 1 to 2 (the cart already held 1).
  await page.getByRole('button', { name: 'Add 3 missing to grocery list', exact: true }).click();
  await expect(page.getByText('Added 3 items to your grocery list.')).toBeVisible();
  await expect(page.getByText('Missing items are on your grocery list')).toBeVisible();
  await expect(page.getByText('0 items needed', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cilantro, 1 bunch, In cart', { exact: true })).toBeVisible();
  const recipeId = `r_${tacoId}`;
  const expected = [
    ['Cilantro', 1, 'bunch', false, 'add_missing', [recipeId]],
    ['Ground beef', 0.5, 'lb', false, 'add_missing', [recipeId]],
    ['Lime', 2, 'each', false, 'manual', [recipeId]],
  ];
  const shape = async () =>
    (await groceryRows(userId)).map((r) => [r.name, r.quantity, r.unit, r.checked, r.origin, r.source_recipe_ids]);
  await expect.poll(shape).toEqual(expected);
  const rowsAfterFirst = await groceryRows(userId);
  expect(rowsAfterFirst.find((r) => r.name === 'Lime')!.id).toBe(lime.data!.id);
  expect(rowsAfterFirst.find((r) => r.name === 'Ground beef')!.category).toBe('meats');

  // A repeat add for the same recipe (another device, a retry) changes nothing.
  const repeat = await userClient(accessToken).rpc('add_missing_to_grocery', {
    p_recipe_id: recipeId,
    p_items: [
      { ingredient_id: 'ground-beef', name: 'Ground beef', category: 'meats', quantity: 0.5, unit: 'lb' },
      { ingredient_id: 'cilantro', name: 'Cilantro', category: 'produce', quantity: 1, unit: 'bunch' },
      { ingredient_id: 'lime', name: 'Lime', category: 'produce', quantity: 2, unit: 'each' },
    ],
  });
  expect(repeat.error).toBeNull();
  expect(repeat.data).toMatchObject({ added: 0, merged: 0, unchanged: 3 });
  expect(await shape()).toEqual(expected);

  // Reload: the detail still knows the items are on the list; the Grocery tab shows them.
  await page.reload();
  await expect(page.getByText('Missing items are on your grocery list')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Add \d+ missing/ })).toHaveCount(0);
  await page.goto('/grocery');
  await expect(page.getByRole('checkbox', { name: /^Cilantro, / })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Lime, / })).toBeVisible();
});

test('a bad recipe id shows "Recipe not found"', async ({ page }) => {
  await signIn(page);
  await page.goto('/recipe/r_00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Recipe not found' })).toBeVisible();
  await page.goto('/recipe/not-a-recipe');
  await expect(page.getByRole('heading', { name: 'Recipe not found' })).toBeVisible();
});
