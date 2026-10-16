import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Recipe detail ingredient checkboxes, end to end against the local stack (follows recipes-feed.spec.ts):
 * a master recipe and a small pantry are seeded with the local service key; the detail shows a checkbox
 * on each ingredient the pantry lacks (an open grocery row for one of them makes it "In cart"); ticking
 * rows shows "Add N to pantry" / "Add N to cart", which save every ticked row through the pantry's own add
 * or the grocery add, the rows flip to "In pantry" / "In cart", the counts update and the cart row is not
 * counted twice; select all; offline, nothing is saved.
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

  // No box where the pantry already has it; a box on the others, including the oil. All start unticked.
  const check = (id: string) => page.getByTestId(`recipe-ingredient-check-${id}`);
  await expect(check('lettuce')).toHaveCount(0);
  for (const id of ['radish', 'cilantro', 'olive-oil']) {
    await expect(check(id)).toBeVisible();
    await expect(check(id)).toHaveAttribute('aria-checked', 'false');
  }
  await expect(page.getByTestId('recipe-ingredient-actions')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Select Radish', exact: true })).toBeVisible();

  // Tick radish and cilantro: the bar shows the count; both go to the pantry in one go.
  await check('radish').click();
  await check('cilantro').click();
  await expect(check('radish')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Add 2 to pantry', exact: true }).click();
  await expect(page.getByText('Added 2 items to your pantry.')).toBeVisible();
  await expect(page.getByLabel('Radish, 4 each, In pantry', { exact: true })).toBeVisible();
  // Cilantro was In cart: once in the pantry it reads In pantry and is not counted in the cart as well.
  await expect(page.getByLabel('Cilantro, 1 bunch, In pantry', { exact: true })).toBeVisible();
  await expect(check('radish')).toHaveCount(0);
  await expect(page.getByTestId('recipe-ingredient-actions')).toHaveCount(0); // ticks cleared
  await expect(page.getByText('0 items needed', { exact: true })).toBeVisible();
  await expect(page.getByText('3 in pantry · 0 in cart', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await pantryRows()).filter((r) => ['Radish', 'Cilantro'].includes(r.name)))
    .toEqual([
      { name: 'Cilantro', quantity: 1, unit: 'bunch', ingredient_id: 'cilantro' },
      { name: 'Radish', quantity: 4, unit: 'each', ingredient_id: 'radish' },
    ]);

  // The oil is a staple: it keeps its box until the pantry has a row for it.
  await check('olive-oil').click();
  await page.getByRole('button', { name: 'Add 1 to pantry', exact: true }).click();
  await expect(page.getByLabel('Olive oil, 2 tbsp, In pantry', { exact: true })).toBeVisible();
  await expect.poll(async () => (await pantryRows()).map((r) => r.name)).toEqual(['Cilantro', 'Lettuce', 'Olive oil', 'Radish']);

  // Still there after a reload.
  await page.reload();
  await expect(page.getByLabel('Radish, 4 each, In pantry', { exact: true })).toBeVisible();
});

test('offline: the buttons cannot save and nothing is added', async ({ page, context }) => {
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
  const box = page.getByTestId('recipe-ingredient-check-kale');
  await expect(box).toBeVisible();
  await box.click();
  const add = page.getByRole('button', { name: 'Add 1 to pantry', exact: true });
  const addCart = page.getByRole('button', { name: 'Add 1 to cart', exact: true });
  await expect(add).toBeEnabled();
  await context.setOffline(true);
  await expect(add).toBeDisabled();
  await expect(addCart).toBeDisabled();
  await expect(page.getByLabel('Kale, 1 bunch, Missing', { exact: true })).toBeVisible();
  await context.setOffline(false);
  expect((await pantryRows()).some((r) => r.name === 'Kale')).toBe(false);
});

test('select all missing, then add the ticked rows to the cart (the grocery list)', async ({ page }) => {
  await page.goto('/sign-in');
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('topbar-account')).toBeVisible();

  const admin = adminClient();
  const recipes = await admin
    .from('recipes')
    .insert({
      name: `${recipeName} Cart`,
      servings: 2,
      minutes: 5,
      is_master: true,
      ingredients: [
        { ingredientId: 'beet', name: 'Beet', quantity: 2, unit: 'each' },
        { ingredientId: 'leek', name: 'Leek', quantity: 1, unit: 'each' },
      ],
      steps: ['Roast.'],
    })
    .select('id')
    .single();
  expect(recipes.error).toBeNull();
  seededRecipeIds.push(recipes.data!.id as string);

  await page.goto(`/recipe/r_${recipes.data!.id}`);
  await page.getByTestId('recipe-ingredient-select-all').click();
  await expect(page.getByTestId('recipe-ingredient-check-beet')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('recipe-ingredient-check-leek')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Add 2 to cart', exact: true }).click();
  await expect(page.getByText('Added 2 items to your grocery list.')).toBeVisible();
  await expect(page.getByLabel('Beet, 2 each, In cart', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Leek, 1 each, In cart', { exact: true })).toBeVisible();
  await expect(page.getByTestId('recipe-ingredient-actions')).toHaveCount(0); // ticks cleared
  const { data, error } = await admin.from('grocery_list_items').select('name').eq('user_id', userId).in('name', ['Beet', 'Leek']);
  expect(error).toBeNull();
  expect((data ?? []).map((r) => r.name).sort()).toEqual(['Beet', 'Leek']);
});
