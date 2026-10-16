import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Ask Forky, end to end against the local stack. The local stack runs no edge functions (and the
 * live ask-forky must never be called from a test), so the request to /functions/v1/ask-forky is
 * intercepted and answered here in the function's real shape (supabase/functions/ask-forky).
 * Sign-in, the allowance read (forky_chat_usage), the pantry and the recipe reads are the real
 * local server.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Forky-Password-123';
const FUNCTION = '**/functions/v1/ask-forky';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const AI_NOTICE = 'Forky is an AI helper and can be wrong. Always check allergens and food safety yourself before you cook.';
const LIMIT_FREE = "That's all the free questions for this month. They refill on the 1st, and a paid plan includes more.";
const recipePageExists = existsSync(join(__dirname, '..', 'src', 'app', 'recipe', '[id].tsx'));
const period = () => new Date().toISOString().slice(0, 7);

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

/** Answers ask-forky (and its CORS preflight); `reply` builds the answer from the request body. */
async function stubAskForky(
  page: Page,
  reply: (body: Record<string, unknown>) => { status: number; json: Record<string, unknown> },
): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(FUNCTION, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    captured.push({ headers: await request.allHeaders(), body });
    const { status, json } = reply(body);
    await route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  });
  return captured;
}

test('ask a question from the header: an answer with a recipe button that opens the recipe', async ({ page }) => {
  const { userId, accessToken } = await newSignedInUser(page, 'forky');
  const admin = adminClient();
  const recipe = await admin
    .from('recipes')
    .insert({
      name: 'Forky test fried rice',
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
  const pantry = await admin
    .from('pantry_items')
    .insert({ user_id: userId, ingredient_id: 'eggs', name: 'Eggs', category: 'dairy', quantity: 6, unit: 'each', location: 'fridge' });
  expect(pantry.error).toBeNull();

  const captured = await stubAskForky(page, (body) => {
    const recipes = (body.recipes as { id: string; title: string }[]) ?? [];
    const match = recipes.find((r) => r.title === 'Forky test fried rice');
    return {
      status: 200,
      json: {
        answer: 'Your eggs are perfect for fried rice tonight.',
        recipeIds: match ? [match.id] : [],
        offTopic: false,
        safetyNote: false,
        remaining: 4,
        limit: 5,
        isPlus: false,
        tier: 'free',
      },
    };
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Ask Forky', exact: true }).first().click(); // Forky in the top bar
  await expect(page).toHaveURL(/\/forky$/);
  // Home (with its own copy of these two lines, above its question box) stays mounted underneath.
  await expect(page.getByText(AI_NOTICE, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('5 questions left this month', { exact: true }).filter({ visible: true })).toBeVisible();

  await page.getByRole('textbox', { name: 'Your question for Forky' }).fill('What can I make with eggs?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('Your eggs are perfect for fried rice tonight.')).toBeVisible();
  await expect(page.getByText('4 questions left this month', { exact: true }).filter({ visible: true })).toBeVisible();
  expect(captured).toHaveLength(1);
  const sent = captured[0]!;
  expect(sent.headers['authorization']).toBe(`Bearer ${accessToken}`);
  expect(sent.headers['content-type']).toContain('application/json');
  expect(sent.body.question).toBe('What can I make with eggs?');
  expect(sent.body.history).toEqual([]);
  expect(sent.body.pantry).toEqual([{ name: 'Eggs', amount: '6 each' }]);
  expect(sent.body.recipes).toContainEqual({ id: routeId, title: 'Forky test fried rice', have: 1, total: 2, missing: ['White rice'] });

  await page.getByRole('button', { name: 'Open recipe: Forky test fried rice' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${routeId}$`));
  if (recipePageExists) {
    // The recipe page (rebuild phase 3) shows the seeded recipe. The chat stays mounted (hidden) underneath,
    // so match the page's heading, as the recipe specs do.
    await expect(page.getByRole('heading', { name: 'Forky test fried rice' })).toBeVisible();
  }
});

test('allowance used up: the chat says so, offers See plans, and sends nothing', async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'forkyout');
  const seeded = await adminClient().from('forky_chat_usage').insert({ user_id: userId, period: period(), messages: 5 });
  expect(seeded.error).toBeNull();
  const captured = await stubAskForky(page, () => ({ status: 500, json: { error: 'must not be called' } }));

  await page.goto('/forky');
  await expect(page.getByText('No questions left this month', { exact: true })).toBeVisible();
  await expect(page.getByText(LIMIT_FREE, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'What can I make tonight?' })).toHaveCount(0);

  const plans = page.getByRole('link', { name: 'See plans' });
  await expect(plans).toHaveAttribute('href', '/plans');
  await plans.click();
  await expect(page).toHaveURL(/\/plans$/);
  expect(captured).toHaveLength(0);
});

test('the server refuses the last question: the plain message and See plans', async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'forkyrefused');
  const seeded = await adminClient().from('forky_chat_usage').insert({ user_id: userId, period: period(), messages: 4 });
  expect(seeded.error).toBeNull();
  const captured = await stubAskForky(page, () => ({
    status: 429,
    json: { error: 'No questions left this month.', code: 'LIMIT_REACHED', remaining: 0, limit: 5, isPlus: false, tier: 'free' },
  }));

  await page.goto('/forky');
  await expect(page.getByText('1 question left this month', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'What should I use up first?' }).click();

  await expect(page.getByText(LIMIT_FREE, { exact: true })).toBeVisible();
  await expect(page.getByText('No questions left this month', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'See plans' })).toBeVisible();
  // The unanswered question goes back in the box.
  await expect(page.getByRole('textbox', { name: 'Your question for Forky' })).toHaveValue('What should I use up first?');
  expect(captured).toHaveLength(1);
});
