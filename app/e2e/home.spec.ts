import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * The four tabs since 2026-10-15 (Home, Pantry, Recipes, Grocery), end to end against the local stack:
 *  - Home: the three counters show the seeded account's numbers and open their tabs; the Ask Forky
 *    box sends a question into the chat (ask-forky is answered here, never the live function) and
 *    keeps it when offline.
 *  - Recipes: the tab shows the feed.
 *  - Grocery: "List" | "Stores"; /stores lands on the Stores view.
 * Pantry and recipe ingredients use made-up words, so recipes other specs add (master recipes are
 * visible to everyone) can never match this account's pantry: "ready to cook" is exactly 1.
 */
const password = 'e2e-Home-Password-123';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const AI_NOTICE = 'Forky is an AI helper and can be wrong. Always check allergens and food safety yourself before you cook.';
const OFFLINE = "You're offline. Changes need a connection.";

function word(prefix: string): string {
  let out = prefix;
  for (let i = 0; i < 9; i++) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
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
  await expect(page.getByTestId('topbar-account')).toBeVisible();
  return created.data.user!.id;
}

type Captured = { headers: Record<string, string>; body: Record<string, unknown> };

/** Answers a function (and its CORS preflight) here; records what the app sent. */
async function stubFunction(page: Page, name: string, status: number, json: unknown): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(`**/functions/v1/${name}`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    captured.push({ headers: await request.allHeaders(), body: (request.postDataJSON() ?? {}) as Record<string, unknown> });
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  });
  return captured;
}

/** Where the app is: path plus query (an empty "?" counts as none). */
async function expectAt(page: Page, path: string, search = '') {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}${url.search === '?' ? '' : url.search}`;
    })
    .toBe(`${path}${search}`);
}

const tabLink = (page: Page, name: string) =>
  page.getByRole('tab', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).first();

test('Home: the counters show ready to cook, pantry items and items to buy, and open their tabs', async ({ page }) => {
  const userId = await newSignedInUser(page, 'home-counts');
  const admin = adminClient();
  const [a, b, c, d] = [word('zh'), word('zh'), word('zh'), word('zh')];
  const readyTitle = `Home ${a} ready bowl`;
  const pantry = await admin.from('pantry_items').insert(
    [a, b, d].map((name) => ({ user_id: userId, ingredient_id: name, name, category: 'other', quantity: 5, unit: 'each', location: 'pantry' })),
  );
  expect(pantry.error).toBeNull();
  const line = (name: string) => ({ ingredientId: name, name, quantity: 1, unit: 'each' });
  const recipes = await admin.from('recipes').insert([
    { name: readyTitle, created_by: userId, is_master: false, servings: 2, ingredients: [line(a), line(b)], steps: ['Mix.'] },
    { name: `Home ${a} missing bowl`, created_by: userId, is_master: false, servings: 2, ingredients: [line(a), line(c)], steps: ['Mix.'] },
  ]);
  expect(recipes.error).toBeNull();
  const grocery = await admin.from('grocery_list_items').insert(
    [
      { name: 'Scallions', ingredient_id: 'scallions', checked: false },
      { name: 'Soy sauce', ingredient_id: 'soy-sauce', checked: false },
      { name: 'Apples', ingredient_id: 'apples', checked: true },
    ].map((r) => ({ ...r, user_id: userId, category: 'produce', quantity: 1, unit: 'each', origin: 'manual' })),
  );
  expect(grocery.error).toBeNull();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByTestId('home-count-ready-value')).toHaveText('1');
  await expect(page.getByTestId('home-count-pantry-value')).toHaveText('3');
  await expect(page.getByTestId('home-count-grocery-value')).toHaveText('2');
  // The recipes feed is not on Home any more.
  await expect(page.getByRole('heading', { name: 'Cook from your pantry' })).toHaveCount(0);

  const ready = page.getByRole('link', { name: 'Ready to cook: 1. Opens Recipes.', exact: true });
  await expect(ready).toHaveAttribute('href', '/recipes');
  await ready.click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('button', { name: `${readyTitle}, Ready to cook`, exact: true })).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: 'Pantry items: 3. Opens Pantry.', exact: true }).click();
  await expect(page).toHaveURL(/\/pantry$/);

  await page.goto('/');
  await page.getByRole('link', { name: 'On grocery list: 2. Opens Grocery.', exact: true }).click();
  await expect(page).toHaveURL(/\/grocery$/);
  await expect(page.getByRole('checkbox', { name: /^Scallions, / })).toBeVisible();
});

test('Home: the Ask Forky box sends the question into the chat; the allowance is the same in both', async ({ page }) => {
  await newSignedInUser(page, 'home-forky');
  const captured = await stubFunction(page, 'ask-forky', 200, {
    answer: 'A quick omelette works tonight.',
    recipeIds: [],
    offTopic: false,
    safetyNote: false,
    remaining: 4,
    limit: 5,
    isPlus: false,
    tier: 'free',
  });

  await page.goto('/');
  const box = page.getByRole('textbox', { name: 'Ask Forky a question' });
  const send = page.getByRole('button', { name: 'Send to Forky', exact: true });
  await expect(box).toBeVisible();
  await expect(page.getByText(AI_NOTICE, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId('home-forky-left')).toHaveText('5 questions left this month');
  await expect(send).toBeDisabled();

  await box.fill('What can I cook tonight?');
  await send.click();
  await expectAt(page, '/forky'); // the question is taken off the address once sent
  await expect(page.getByText('A quick omelette works tonight.')).toBeVisible();
  await expect(page.getByText('What can I cook tonight?', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('4 questions left this month', { exact: true }).filter({ visible: true })).toBeVisible();
  expect(captured).toHaveLength(1);
  expect(captured[0]!.body.question).toBe('What can I cook tonight?');
  expect(captured[0]!.headers['authorization']).toMatch(/^Bearer /);

  // Back on Home: the same allowance, an empty box, and still one call.
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByTestId('home-forky-left')).toHaveText('4 questions left this month');
  await expect(page.getByRole('textbox', { name: 'Ask Forky a question' })).toHaveValue('');
  expect(captured).toHaveLength(1);
});

test('Home: offline, the Ask Forky box keeps the question, says so, and opens nothing', async ({ page, context }) => {
  await newSignedInUser(page, 'home-forky-off');
  const captured = await stubFunction(page, 'ask-forky', 500, { error: 'must not be called' });
  await page.goto('/');
  const box = page.getByRole('textbox', { name: 'Ask Forky a question' });
  await expect(box).toBeVisible();

  await context.setOffline(true);
  await box.fill('What should I use up first?');
  await page.getByRole('button', { name: 'Send to Forky', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: OFFLINE })).toBeVisible();
  await expect(box).toHaveValue('What should I use up first?');
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await context.setOffline(false);
  expect(captured).toHaveLength(0);
});

test('Recipes tab shows the feed with Search, Saved and Import; Grocery has List and Stores; /stores opens Stores', async ({ page }) => {
  await newSignedInUser(page, 'home-tabs');
  await stubFunction(page, 'kroger-deals', 503, { error: 'Live Kroger prices are not set up yet.', configured: false });

  await tabLink(page, 'Recipes').click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('heading', { name: 'Cook from your pantry' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Search recipes', exact: true })).toHaveAttribute('href', '/recipes/search');
  await expect(page.getByRole('link', { name: 'Saved', exact: true })).toHaveAttribute('href', '/recipes/saved');
  await expect(page.getByRole('button', { name: 'Import a recipe', exact: true })).toBeVisible();

  // No Stores tab any more.
  await expect(page.getByRole('tab', { name: 'Stores', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Stores', exact: true })).toHaveCount(0);

  await tabLink(page, 'Grocery').click();
  await expectAt(page, '/grocery');
  await expect(page.getByRole('radio', { name: 'List', exact: true })).toBeChecked();
  await expect(page.getByText('Your list is empty').filter({ visible: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Stores', exact: true }).click();
  await expectAt(page, '/grocery', '?view=stores');
  await expect(page.getByRole('heading', { name: 'Stores near you', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'ZIP code' })).toBeVisible();
  await page.getByRole('radio', { name: 'List', exact: true }).click();
  await expectAt(page, '/grocery');

  // Old links and the /smart-shop stub: /stores lands on Grocery's Stores view.
  await page.goto('/stores');
  await expectAt(page, '/grocery', '?view=stores');
  await expect(page.getByRole('radio', { name: 'Stores', exact: true })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Stores near you', exact: true })).toBeVisible();

  // Old /recipes?q= links were searches and still are.
  await page.goto('/recipes?q=egg');
  await expectAt(page, '/recipes/search', '?q=egg');
});
