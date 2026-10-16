import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Recipe detail "Add to pantry", end to end against the local stack (follows recipes-feed.spec.ts):
 * a master recipe and a small pantry are seeded with the local service key; the detail shows an
 * "Add to pantry" control on each ingredient the pantry lacks (an open grocery row for one of them
 * makes it "In cart"); one tap saves it through the pantry's own add, the row flips to "In pantry",
 * the counts update and the cart row is not counted twice; offline, nothing is saved.
 * Serial: later tests use the account the first one creates. Not run locally when written (needs the local stack).
 */
test.describe.configure({ mode: 'serial' });

const email = freshEmail('recipe-add-pantry');
const password = 'e2e-AddPantry-123';
const run = `${Date.now() % 100000}`;
const recipeName = `E2E Add Pantry Salad ${run}`;
const seededRecipeIds: string[] = [];
let userId = '';

const emailBox = (page: Page) => page.getByRole('textbox', { name: 'Email' });
const passwordBox = (page: Page) => page.getByLabel('Password', { exact: true });

async function pantryRows() {
  const { data, error } = await adminClient()
    .from('pantry_items')
    .select('name, quantity, unit, ingredient_id')
    .eq('user_id', userId)
    .order('name');
  expect(error).toBeNull();
  return (data ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

test.afterAll(async () => {
  if (seededRecipeIds.length > 0) await adminClient().from('recipes').delete().in('id', seededRecipeIds);
});

test('an ingredient the pantry lacks is added from the recipe with one tap', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('topbar-account')).toBeVisible();
  userId = (await adminClient().auth.admin.listUsers()).data.users.find((u) => u.email === email)!.id;

  const admin = adminClient();
  const recipes = await admin
    .from('recipes')
    .insert({
      name: recipeName,
      servings: 2,
      minutes: 10,
      is_master: true,
      ingredients: [
        { ingredientId: 'lettuce', name: 'Lettuce', quantity: 1, unit: 'head' },
        { ingredientId: 'cilantro', name: 'Cilantro', quantity: 1, unit: 'bunch' },
        { ingredientId: 'radish', name: 'Radish', quantity: 4, unit: 'each' },
        { ingredientId: 'olive-oil', name: 'Olive oil', quantity: 2, unit: 'tbsp' },
      ],
      steps: ['Chop.', 'Toss.'],
    })
    .select('id')
    .single();
  expect(recipes.error).toBeNull();
  seededRecipeIds.push(recipes.data!.id as string);

  // Lettuce is in the pantry; cilantro is on the grocery list (typed by hand).
  const pantry = await admin
    .from('pantry_items')
    .insert({ user_id: userId, ingredient_id: 'lettuce', name: 'Lettuce', category: 'produce', quantity: 2, unit: 'head', location: 'fridge' });
  expect(pantry.error).toBeNull();
  const cart = await admin
    .from('grocery_list_items')
    .insert({ user_id: userId, ingredient_id: 'cilantro', name: 'Cilantro', category: 'produce', quantity: 1, unit: 'bunch', origin: 'manual' });
  expect(cart.error).toBeNull();

  await page.goto(`/recipe/r_${recipes.data!.id}`);
  await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();
  await expect(page.getByText('1 item needed', { exact: true })).toBeVisible(); // radish
  await expect(page.getByText('1 in pantry · 1 in cart', { exact: true })).toBeVisible();

  // No control where the pantry already has it; one on the others, including the oil.
  await expect(page.getByTestId('recipe-ingredient-add-pantry-lettuce')).toHaveCount(0);
  await expect(page.getByTestId('recipe-ingredient-add-pantry-radish')).toBeVisible();
  await expect(page.getByTestId('recipe-ingredient-add-pantry-cilantro')).toBeVisible();
  await expect(page.getByTestId('recipe-ingredient-add-pantry-olive-oil')).toBeVisible();

  // Radish: the row flips at once, the counts follow, and the server has the pantry row.
  await page.getByTestId('recipe-ingredient-add-pantry-radish').click();
  await expect(page.getByLabel('Radish, 4 each, In pantry', { exact: true })).toBeVisible();
  await expect(page.getByTestId('recipe-ingredient-add-pantry-radish')).toHaveCount(0);
  await expect(page.getByText('0 items needed', { exact: true })).toBeVisible();
  await expect(page.getByText('2 in pantry · 1 in cart', { exact: true })).toBeVisible();
  await expect.poll(async () => (await pantryRows()).filter((r) => r.name === 'Radish')).toEqual([
    { name: 'Radish', quantity: 4, unit: 'each', ingredient_id: 'radish' },
  ]);

  // Cilantro was In cart: once in the pantry it reads In pantry and is not counted in the cart as well.
  await page.getByTestId('recipe-ingredient-add-pantry-cilantro').click();
  await expect(page.getByLabel('Cilantro, 1 bunch, In pantry', { exact: true })).toBeVisible();
  await expect(page.getByText('3 in pantry · 0 in cart', { exact: true })).toBeVisible();

  // The oil is a staple: it reads In pantry once it is in the pantry.
  await page.getByTestId('recipe-ingredient-add-pantry-olive-oil').click();
  await expect(page.getByLabel('Olive oil, 2 tbsp, In pantry', { exact: true })).toBeVisible();
  await expect.poll(async () => (await pantryRows()).map((r) => r.name)).toEqual(['Cilantro', 'Lettuce', 'Olive oil', 'Radish']);

  // Still there after a reload.
  await page.reload();
  await expect(page.getByLabel('Radish, 4 each, In pantry', { exact: true })).toBeVisible();
});

test('offline: the control cannot save and nothing is added', async ({ page, context }) => {
  await page.goto('/sign-in');
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('topbar-account')).toBeVisible();

  const admin = adminClient();
  const recipes = await admin
    .from('recipes')
    .insert({
      name: `${recipeName} Offline`,
      servings: 1,
      minutes: 5,
      is_master: true,
      ingredients: [{ ingredientId: 'kale', name: 'Kale', quantity: 1, unit: 'bunch' }],
      steps: ['Eat.'],
    })
    .select('id')
    .single();
  expect(recipes.error).toBeNull();
  seededRecipeIds.push(recipes.data!.id as string);

  await page.goto(`/recipe/r_${recipes.data!.id}`);
  const add = page.getByTestId('recipe-ingredient-add-pantry-kale');
  await expect(add).toBeVisible();
  await context.setOffline(true);
  await expect(add).toBeDisabled();
  await expect(page.getByLabel('Kale, 1 bunch, Missing', { exact: true })).toBeVisible();
  await context.setOffline(false);
  expect((await pantryRows()).some((r) => r.name === 'Kale')).toBe(false);
});
