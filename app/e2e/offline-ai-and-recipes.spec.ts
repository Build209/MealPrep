import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Offline behaviour of scan, recipe import, Ask Forky and already-loaded recipes, against the local
 * stack (spec rule: "the last data loaded stays readable with no signal; changes need a connection
 * and say so plainly"). Offline is the browser's own switch (context.setOffline), which the app
 * hears through TanStack Query's onlineManager, as in the Pantry and Grocery offline tests.
 * The local stack runs no edge functions and the live ones must never be called: pantry-vision,
 * recipe-import and ask-forky are intercepted here and every call is recorded, so a test can
 * prove nothing was sent while offline (nothing sent = no allowance used).
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Offline-Password-123';
const OFFLINE = "You're offline. Changes need a connection.";
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
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

/** Answers one edge function (and its CORS preflight) with 200 and `json`; records each POST body. */
async function stubFunction(page: Page, name: string, json: Record<string, unknown>): Promise<unknown[]> {
  const calls: unknown[] = [];
  await page.route(`**/functions/v1/${name}`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    calls.push(request.postDataJSON());
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  });
  return calls;
}

/** A 64x64 checkerboard BMP: decodable by the browser and not "blank" to the photo check. */
function checkerboardBmp(size = 64): Buffer {
  const rowBytes = size * 3;
  const pixelBytes = rowBytes * size;
  const buf = Buffer.alloc(54 + pixelBytes);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(54 + pixelBytes, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(size, 18);
  buf.writeInt32LE(size, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelBytes, 34);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      const at = 54 + y * rowBytes + x * 3;
      buf[at] = on ? 30 : 230;
      buf[at + 1] = on ? 60 : 200;
      buf[at + 2] = on ? 200 : 40;
    }
  }
  return buf;
}

async function pantryRows(userId: string) {
  const { data, error } = await adminClient().from('pantry_items').select('id').eq('user_id', userId);
  expect(error).toBeNull();
  return data ?? [];
}

async function usageRows(table: string, userId: string) {
  const { data, error } = await adminClient().from(table).select('*').eq('user_id', userId);
  expect(error).toBeNull();
  return data ?? [];
}

const offlineAlert = (page: Page) => page.getByRole('alert').filter({ hasText: OFFLINE });

test('scan offline: choosing a photo says it needs a connection, sends nothing and saves nothing', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offscan');
  const calls = await stubFunction(page, 'pantry-vision', { items: [], usage: null });

  await page.goto('/pantry');
  const scanButton = page.getByRole('button', { name: 'Scan · 3 left this month' });
  await expect(scanButton).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(OFFLINE).filter({ visible: true })).toBeVisible(); // the Pantry tab's own line
  await scanButton.click();
  await expect(page).toHaveURL(/\/scan$/);

  let chooserOpened = false;
  page.on('filechooser', () => {
    chooserOpened = true;
  });
  await page.getByRole('button', { name: 'Choose a photo' }).first().click();
  await expect(offlineAlert(page)).toBeVisible();
  await expect(page.getByText('Reading your photo...')).toHaveCount(0);
  await expect(page.getByText('What are you scanning?')).toBeVisible(); // still on the first step, no crash
  expect(chooserOpened).toBe(false);
  expect(calls).toHaveLength(0);

  await context.setOffline(false);
  expect(await usageRows('photo_scan_usage', userId)).toEqual([]);
  expect(await pantryRows(userId)).toEqual([]);
});

test('scan: going offline on the review list, Save says it needs a connection and writes no rows', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offscansave');
  const calls = await stubFunction(page, 'pantry-vision', {
    items: [{ name: 'eggs', quantity: 12, unit: 'each', category: 'dairy', storage: 'fridge', confidence: 0.9 }],
    model: 'gemini-3.8-flash',
    usage: { isPlus: false, tier: 'free', limit: 3, remaining: 2 },
    scanLocation: 'fridge',
    kind: 'pantry',
    cached: false,
    itemCount: 1,
  });

  await page.goto('/scan');
  await page.getByRole('radio', { name: 'Fridge', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a photo' }).first().click();
  await (await chooser).setFiles({ name: 'shelf.bmp', mimeType: 'image/bmp', buffer: checkerboardBmp() });
  await expect(page.getByText('Check what we found (1)')).toBeVisible();
  expect(calls).toHaveLength(1);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save 1 item to pantry' }).click();
  await expect(offlineAlert(page)).toBeVisible();
  await expect(page.getByText('Check what we found (1)')).toBeVisible(); // the list is kept
  expect(calls).toHaveLength(1);

  // Back online, nothing held back is sent later either.
  await context.setOffline(false);
  await page.waitForTimeout(2000);
  expect(await pantryRows(userId)).toEqual([]);
});

test('recipe import offline: Import says it needs a connection, keeps the link, sends nothing', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offimport');
  const calls = await stubFunction(page, 'recipe-import', { error: 'must not be called' });
  const link = 'https://www.example.com/recipes/offline-soup';

  await page.goto('/recipes/import');
  const importButton = page.getByRole('button', { name: 'Import · 2 imports left this month' });
  await expect(importButton).toBeVisible();

  await context.setOffline(true);
  const box = page.getByRole('textbox', { name: 'Recipe link or text' });
  await box.fill(link);
  await importButton.click();
  await expect(offlineAlert(page)).toBeVisible();
  await expect(page.getByText('Reading the recipe...')).toHaveCount(0);
  await expect(box).toHaveValue(link);
  await expect(importButton).toBeVisible(); // allowance unchanged on the button
  expect(calls).toHaveLength(0);

  await context.setOffline(false);
  expect(await usageRows('recipe_import_usage', userId)).toEqual([]);
  const recipes = await adminClient().from('recipes').select('id').eq('created_by', userId);
  expect(recipes.error).toBeNull();
  expect(recipes.data).toEqual([]);
});

test('recipe import: going offline on the review, Save recipe says it needs a connection and saves nothing', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offimportsave');
  const link = 'https://www.example.com/recipes/offline-pasta';
  const calls = await stubFunction(page, 'recipe-import', {
    recipe: {
      title: 'Offline Garlic Pasta',
      servings: 4,
      prep_minutes: 10,
      cook_minutes: 15,
      ingredients: [
        { name: 'spaghetti', quantity: 12, unit: 'oz' },
        { name: 'garlic', quantity: 4, unit: 'clove' },
      ],
      steps: ['Boil the pasta.', 'Toss with the garlic.'],
      is_recipe: true,
      confidence: 0.92,
      source_url: link,
      source_type: 'web',
      source_title: 'Offline Garlic Pasta',
    },
    cached: false,
    usage: { remaining: 1, limit: 2, isPlus: false, tier: 'free' },
  });

  await page.goto('/recipes/import');
  await page.getByRole('textbox', { name: 'Recipe link or text' }).fill(link);
  await page.getByRole('button', { name: /^Import · / }).click();
  await expect(page.getByText('Review before saving')).toBeVisible();
  expect(calls).toHaveLength(1);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(offlineAlert(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save recipe' })).toBeVisible(); // not stuck on "Saving..."
  await expect(page.getByRole('textbox', { name: 'Recipe name' })).toHaveValue('Offline Garlic Pasta'); // the draft is kept

  // Back online, nothing held back is sent later either.
  await context.setOffline(false);
  await page.waitForTimeout(2000);
  await expect(page.getByRole('button', { name: 'Save recipe' })).toBeVisible();
  const recipes = await adminClient().from('recipes').select('id').eq('created_by', userId);
  expect(recipes.error).toBeNull();
  expect(recipes.data).toEqual([]);
});

test('Ask Forky offline: Send says it needs a connection, keeps the question, uses no question; back online it sends', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offforky');
  const calls = await stubFunction(page, 'ask-forky', {
    answer: 'Try a quick omelette.',
    recipeIds: [],
    offTopic: false,
    safetyNote: false,
    remaining: 4,
    limit: 5,
    isPlus: false,
    tier: 'free',
  });
  const question = 'What can I make with eggs?';

  await page.goto('/forky');
  await expect(page.getByText('5 questions left this month', { exact: true })).toBeVisible();

  await context.setOffline(true);
  const box = page.getByRole('textbox', { name: 'Your question for Forky' });
  await box.fill(question);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(offlineAlert(page)).toBeVisible();
  await expect(box).toHaveValue(question);
  await expect(page.getByText('Forky is thinking…')).toHaveCount(0);
  await expect(page.getByText('5 questions left this month', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);

  await context.setOffline(false);
  expect(await usageRows('forky_chat_usage', userId)).toEqual([]);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Try a quick omelette.')).toBeVisible();
  await expect(box).toHaveValue('');
  expect(calls).toHaveLength(1);
});

test('a recipe and the saved list, once loaded, stay readable offline', async ({ page, context }) => {
  const userId = await newSignedInUser(page, 'offread');
  const stamp = Date.now();
  const title = `Offline test fried rice ${stamp}`;
  const recipe = await adminClient()
    .from('recipes')
    .insert({
      name: title,
      slug: `e2e-offline-fried-rice-${stamp}`,
      created_by: userId,
      is_master: false,
      servings: 2,
      minutes: 20,
      ingredients: [
        { ingredientId: 'eggs', name: 'Eggs', quantity: 2, unit: 'each' },
        { ingredientId: 'white-rice', name: 'White rice', quantity: 2, unit: 'cup' },
      ],
      steps: ['Cook the rice.', 'Fry with the eggs.'],
    })
    .select('id')
    .single();
  expect(recipe.error).toBeNull();
  const routeId = `r_${recipe.data!.id}`;

  // Online: open the recipe, save it, open the saved list, open the recipe from it.
  await page.goto(`/recipe/${routeId}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: `Save ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Remove ${title} from saved`, exact: true })).toBeVisible();
  await page.goto('/recipes/saved');
  await expect(page.getByText('1 saved')).toBeVisible();
  await page.getByRole('link', { name: `${title}. Recipe` }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${routeId}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Offline: the page stays, then back to the saved list and into the recipe again, all from what was loaded.
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Cook the rice.').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/recipes\/saved$/);
  await expect(page.getByText('1 saved').filter({ visible: true })).toBeVisible();
  await page.getByRole('link', { name: `${title}. Recipe` }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${routeId}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Fry with the eggs.').filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Couldn't load this recipe.")).toHaveCount(0);

  await context.setOffline(false);
});
