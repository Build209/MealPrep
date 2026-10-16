import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Saved allergens and the Recipes tab, end to end against the local stack: two master recipes are
 * seeded (one with peanut butter, one without); with nothing saved both sit in the normal list; after
 * the person's user_diet_prefs row says peanuts, the peanut recipe moves under "Contains your
 * allergens" with a "Contains: peanuts" line, and the other recipe stays where it was. Serial: later
 * tests use the account the first one creates. Needs the local Supabase stack (cannot run without it).
 */
test.describe.configure({ mode: 'serial' });

const email = freshEmail('allergens');
const password = 'e2e-Allergens-123';
const run = `${Date.now() % 100000}`;
const peanutName = `E2E Peanut Noodles ${run}`;
const plainName = `E2E Plain Rice ${run}`;
const seededRecipeIds: string[] = [];

const emailBox = (page: Page) => page.getByRole('textbox', { name: 'Email' });
const passwordBox = (page: Page) => page.getByLabel('Password', { exact: true });
const card = (page: Page, namePrefix: string) => page.getByRole('button', { name: new RegExp(`^${namePrefix}`) });

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
  return (parsed.currentSession ?? parsed).user.id as string;
}

test.afterAll(async () => {
  if (seededRecipeIds.length > 0) await adminClient().from('recipes').delete().in('id', seededRecipeIds);
});

test('with allergens saved, a recipe that matches moves under "Contains your allergens" with its line', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('topbar-account')).toBeVisible();
  const userId = await appUserId(page);
  const admin = adminClient();

  const seeded = await admin
    .from('recipes')
    .insert([
      {
        name: peanutName,
        servings: 2,
        minutes: 15,
        is_master: true,
        ingredients: [
          { ingredientId: 'rice-noodles', name: 'Rice noodles', quantity: 8, unit: 'oz' },
          { ingredientId: 'peanut-butter', name: 'Peanut butter', quantity: 3, unit: 'tbsp' },
        ],
        steps: ['Cook the noodles.', 'Stir in the peanut butter.'],
      },
      {
        name: plainName,
        servings: 2,
        minutes: 20,
        is_master: true,
        ingredients: [{ ingredientId: 'rice', name: 'Rice', quantity: 1, unit: 'cup' }],
        steps: ['Cook the rice.'],
      },
    ])
    .select('id');
  expect(seeded.error).toBeNull();
  for (const row of seeded.data ?? []) seededRecipeIds.push(row.id as string);

  // Nothing saved: no group, no line.
  await page.goto('/recipes');
  await expect(card(page, plainName)).toBeVisible();
  await expect(card(page, peanutName)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contains your allergens' })).toHaveCount(0);
  await expect(page.getByTestId('allergen-contains')).toHaveCount(0);

  // Peanuts saved (the Profile screen writes this same row).
  const saved = await admin.from('user_diet_prefs').upsert({ user_id: userId, diets: [], allergens: ['peanuts'] }, { onConflict: 'user_id' });
  expect(saved.error).toBeNull();
  await page.reload();

  const heading = page.getByRole('heading', { name: 'Contains your allergens' });
  await expect(heading).toBeVisible();
  await expect(card(page, plainName)).toBeVisible();
  const flaggedCard = card(page, peanutName);
  await expect(flaggedCard).toBeVisible();
  await expect(flaggedCard.getByTestId('allergen-contains')).toHaveText('Contains: peanuts');
  await expect(card(page, plainName).getByTestId('allergen-contains')).toHaveCount(0);

  // The flagged recipe sits below the heading and the plain one above it.
  const headingBox = (await heading.boundingBox())!;
  expect((await flaggedCard.boundingBox())!.y).toBeGreaterThan(headingBox.y);
  expect((await card(page, plainName).boundingBox())!.y).toBeLessThan(headingBox.y);

  // The warning wording stays: estimate only, never "safe".
  await expect(page.getByText(/verify before you cook/).first()).toBeVisible();
  await expect(page.getByText(/allergen-free|guaranteed/i)).toHaveCount(0);

  // The detail page repeats the line.
  await flaggedCard.click();
  await expect(page.getByTestId('allergen-contains').filter({ visible: true })).toHaveText('Contains: peanuts');
});
