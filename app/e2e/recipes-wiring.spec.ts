import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * The recipe screens wired together, end to end against the local stack: from the Recipes tab, import a
 * recipe from a link, land on its page, save it with the heart, find it in Saved, and find it in
 * search still marked as saved (the page and search build the same user_saved_recipes key).
 * The local stack runs no edge functions and the live recipe-import must never be called from a
 * test, so /functions/v1/recipe-import is intercepted and answered here (as recipe-import.spec.ts).
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Wiring-Password-123';
const FUNCTION = '**/functions/v1/recipe-import';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function word(): string {
  let out = 'zw';
  for (let i = 0; i < 8; i++) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out;
}
const tok = word();
const title = `Wired ${tok} Pasta`;
const LINK = `https://www.example.com/recipes/${tok}-pasta`;

const importAnswer = {
  recipe: {
    title,
    servings: 2,
    prep_minutes: 5,
    cook_minutes: 15,
    ingredients: [
      { name: 'spaghetti', quantity: 8, unit: 'oz' },
      { name: 'butter', quantity: 2, unit: 'tbsp' },
    ],
    steps: ['Boil the pasta.', 'Toss with butter.'],
    is_recipe: true,
    confidence: 0.9,
    source_url: LINK,
    source_type: 'web',
    source_title: `${title} | Example Kitchen`,
    social_author_name: 'Jane Cook',
    social_author_url: 'https://www.example.com/authors/jane',
    image_url: null,
  },
  cached: false,
  usage: { remaining: 1, limit: 2, isPlus: false, tier: 'free' },
};

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

async function stubRecipeImport(page: Page): Promise<number[]> {
  const calls: number[] = [];
  await page.route(FUNCTION, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    calls.push(Date.now());
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(importAnswer) });
  });
  return calls;
}

test('Recipes tab → import → recipe page → save → in Saved → in search, still saved', async ({ page }) => {
  const userId = await newSignedInUser(page, 'wiring');
  const calls = await stubRecipeImport(page);

  // The Recipes tab has the ways in.
  await page.goto('/recipes');
  await expect(page.getByRole('link', { name: 'Search recipes', exact: true })).toHaveAttribute('href', '/recipes/search');
  await expect(page.getByRole('link', { name: 'Saved', exact: true })).toHaveAttribute('href', '/recipes/saved');
  await page.getByRole('button', { name: 'Import a recipe', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/import$/);

  // Import a link and save it as is.
  await page.getByRole('textbox', { name: 'Recipe link or text' }).fill(LINK);
  await page.getByRole('button', { name: /^Import · / }).click();
  await expect(page.getByText('Review before saving')).toBeVisible();
  expect(calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Save recipe' }).click();

  // Lands on the recipe page (r_<uuid>, the detail route's scheme).
  await expect(page).toHaveURL(/\/recipe\/r_[0-9a-f-]{36}$/);
  const rowId = /\/recipe\/r_([0-9a-f-]{36})$/.exec(page.url())![1]!;
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const recipe = await adminClient().from('recipes').select('id, slug, created_by').eq('id', rowId).single();
  expect(recipe.error).toBeNull();
  expect(recipe.data!.created_by).toBe(userId);
  const slug = recipe.data!.slug as string;
  expect(slug).toBeTruthy();

  // Save it from the page.
  await page.getByRole('button', { name: `Save ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Remove ${title} from saved`, exact: true })).toBeVisible();
  const savedRows = async () => {
    const { data, error } = await adminClient()
      .from('user_saved_recipes')
      .select('ref_key, source_type, kitchen_recipe_id, preview')
      .eq('user_id', userId);
    expect(error).toBeNull();
    return data ?? [];
  };
  await expect.poll(async () => (await savedRows()).map((r) => r.ref_key)).toEqual([`kitchen:${slug}`]);
  const row = (await savedRows())[0]!;
  expect(row.source_type).toBe('kitchen');
  expect(row.kitchen_recipe_id).toBe(rowId);
  expect((row.preview as { appRoute?: string }).appRoute).toBe(`r_${rowId}`);

  // In Saved, and it opens the page again.
  await page.goto('/recipes/saved');
  await expect(page.getByText('1 saved')).toBeVisible();
  await page.getByRole('link', { name: `${title}. Recipe` }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/r_${rowId}$`));

  // In search, as the person's own recipe, already saved.
  await page.goto(`/recipes/search?q=${tok}`);
  const result = page.getByRole('link', { name: new RegExp(`^${title}\\b`) });
  await expect(result).toBeVisible();
  await expect(result).toHaveAccessibleName(/Your recipe/);
  await expect(page.getByRole('button', { name: `Remove ${title} from saved`, exact: true })).toBeVisible();
});
