import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Recipe nutrition is a paid-plan feature. A free account sees the locked teaser on the recipe
 * detail screen, and its button opens the app's own /plans screen. No lookup is made for a free
 * account, which the test checks by watching for any request to the nutrition function.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Nutrition-123';

function word(): string {
  let out = 'zq';
  for (let i = 0; i < 8; i++) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out;
}

async function newSignedInUser(page: Page, label: string): Promise<void> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('topbar-account')).toBeVisible();
}

async function seedRecipe(): Promise<string> {
  const tok = word();
  const { data, error } = await adminClient()
    .from('recipes')
    .insert({
      name: `E2E ${tok} Soup`,
      slug: `e2e-${tok}-soup`,
      tag: 'Dinner',
      minutes: 20,
      is_master: true,
      ingredients: [{ ingredientId: 'lentils', name: `${tok} lentils`, quantity: 1, unit: 'cup' }],
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

test('free account: recipe shows the locked nutrition teaser and its button opens plans', async ({ page }) => {
  await newSignedInUser(page, 'nutrifree');
  const recipeId = await seedRecipe();
  const nutritionCalls: string[] = [];
  await page.route(/nutrition/i, async (route) => {
    // Only function-style calls count; page assets with the word in their name are let through.
    if (route.request().url().includes('/functions/v1/')) nutritionCalls.push(route.request().url());
    await route.continue();
  });

  await page.goto(`/recipe/r_${recipeId}`);
  const locked = page.getByTestId('nutrition-locked');
  await expect(locked).toBeVisible();
  await expect(locked.getByText('Nutrition per serving')).toBeVisible();
  await expect(page.getByTestId('nutrition-ready')).toHaveCount(0);

  const upgrade = page.getByTestId('nutrition-upgrade');
  await expect(upgrade).toBeVisible();
  const box = await upgrade.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await upgrade.click();
  await expect(page).toHaveURL(/\/plans$/);
  expect(nutritionCalls).toEqual([]);
});
