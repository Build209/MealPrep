import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from '../e2e/local-supabase';

/**
 * Google Play phone screenshots (runs only with e2e-store/playwright.config.ts, from
 * .github/workflows/store-screenshots.yml). Each test reaches one screen of a believable demo
 * account and saves a 1080 x 1920 PNG of what is on the phone screen to app/play-screenshots/.
 *
 * Data: everything is seeded into the LOCAL Supabase stack with the local service key (refused by
 * local-supabase.ts if it is not on this machine): a demo account with 17 everyday pantry items
 * across Fridge, Pantry and Spice rack, a few grocery items, master recipes the pantry can cook
 * (some fully, some with one or two missing), two saved recipes and grocery stores around
 * Modesto, CA. No real user data, no live project.
 * Edge functions are never called: ask-forky, pantry-vision and kroger-deals are answered here in
 * their real shapes, any other /functions/v1/ call gets a 503, and every request off this machine
 * is blocked. The answers on the Forky and Scan screens are the test's text, not the AI's.
 * The web build has no EXPO_PUBLIC_APP_CHANNEL, so no "Preview build" label (checked per shot).
 */
test.describe.configure({ mode: 'serial' });

const OUT_DIR = resolve(__dirname, '..', 'play-screenshots');
const password = 'store-Shots-Password-123';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const KM_LAT = 0.008993;
const HOME = { lat: 37.6391, lng: -120.9969 }; // matches the config's geolocation

const seed = { email: '', userId: '', recipeIds: {} as Record<string, string> };

type Ingredient = { ingredientId: string; name: string; quantity: number; unit: string };
type MasterRecipe = { key: string; name: string; tag: string; servings: number; minutes: number; ingredients: Ingredient[]; steps: string[] };

const ing = (ingredientId: string, name: string, quantity: number, unit: string): Ingredient => ({ ingredientId, name, quantity, unit });

const PANTRY = [
  // Fridge
  { ingredient_id: 'eggs', name: 'Eggs', category: 'dairy', quantity: 12, unit: 'each', location: 'fridge' },
  { ingredient_id: 'milk', name: 'Milk', category: 'dairy', quantity: 1, unit: 'gallon', location: 'fridge' },
  { ingredient_id: 'cheddar-cheese', name: 'Cheddar cheese', category: 'dairy', quantity: 8, unit: 'oz', location: 'fridge' },
  { ingredient_id: 'butter', name: 'Butter', category: 'dairy', quantity: 1, unit: 'lb', location: 'fridge' },
  { ingredient_id: 'chicken-breast', name: 'Chicken breast', category: 'meats', quantity: 2, unit: 'lb', location: 'fridge' },
  { ingredient_id: 'spinach', name: 'Baby spinach', category: 'produce', quantity: 5, unit: 'oz', location: 'fridge' },
  // Pantry
  { ingredient_id: 'spaghetti', name: 'Spaghetti', category: 'dry_goods', quantity: 1, unit: 'lb', location: 'pantry' },
  { ingredient_id: 'white-rice', name: 'White rice', category: 'dry_goods', quantity: 4, unit: 'cup', location: 'pantry' },
  { ingredient_id: 'black-beans', name: 'Black beans', category: 'dry_goods', quantity: 2, unit: 'can', location: 'pantry' },
  { ingredient_id: 'diced-tomatoes', name: 'Diced tomatoes', category: 'dry_goods', quantity: 2, unit: 'can', location: 'pantry' },
  { ingredient_id: 'olive-oil', name: 'Olive oil', category: 'condiments', quantity: 1, unit: 'bottle', location: 'pantry' },
  { ingredient_id: 'onion', name: 'Yellow onion', category: 'produce', quantity: 3, unit: 'each', location: 'pantry' },
  { ingredient_id: 'garlic', name: 'Garlic', category: 'produce', quantity: 1, unit: 'head', location: 'pantry' },
  // Spice rack
  { ingredient_id: 'salt', name: 'Salt', category: 'spices', quantity: 1, unit: 'jar', location: 'spice_rack' },
  { ingredient_id: 'black-pepper', name: 'Black pepper', category: 'spices', quantity: 1, unit: 'jar', location: 'spice_rack' },
  { ingredient_id: 'cumin', name: 'Ground cumin', category: 'spices', quantity: 1, unit: 'jar', location: 'spice_rack' },
  { ingredient_id: 'chili-powder', name: 'Chili powder', category: 'spices', quantity: 1, unit: 'jar', location: 'spice_rack' },
];

const RECIPES: MasterRecipe[] = [
  {
    key: 'omelette',
    name: 'Spinach and cheddar omelette',
    tag: 'Breakfast',
    servings: 1,
    minutes: 10,
    ingredients: [ing('eggs', 'Eggs', 3, 'each'), ing('spinach', 'Baby spinach', 1, 'oz'), ing('cheddar-cheese', 'Cheddar cheese', 1, 'oz'), ing('butter', 'Butter', 0.05, 'lb')],
    steps: ['Whisk the eggs with a pinch of salt.', 'Melt the butter and wilt the spinach.', 'Pour in the eggs, add the cheddar, fold and serve.'],
  },
  {
    key: 'pasta',
    name: 'Garlic tomato spaghetti',
    tag: 'Dinner',
    servings: 4,
    minutes: 25,
    ingredients: [ing('spaghetti', 'Spaghetti', 1, 'lb'), ing('diced-tomatoes', 'Diced tomatoes', 1, 'can'), ing('garlic', 'Garlic', 1, 'head'), ing('olive-oil', 'Olive oil', 1, 'bottle'), ing('salt', 'Salt', 1, 'jar')],
    steps: ['Boil the spaghetti in salted water.', 'Soften the garlic in olive oil, add the tomatoes and simmer 10 minutes.', 'Toss the pasta in the sauce.'],
  },
  {
    key: 'bowls',
    name: 'Chicken burrito bowls',
    tag: 'Dinner',
    servings: 4,
    minutes: 35,
    ingredients: [
      ing('chicken-breast', 'Chicken breast', 1.5, 'lb'),
      ing('white-rice', 'White rice', 2, 'cup'),
      ing('black-beans', 'Black beans', 1, 'can'),
      ing('cumin', 'Ground cumin', 1, 'jar'),
      ing('chili-powder', 'Chili powder', 1, 'jar'),
      ing('cilantro', 'Cilantro', 1, 'bunch'),
      ing('lime', 'Lime', 2, 'each'),
    ],
    steps: ['Cook the rice.', 'Season the chicken with cumin and chili powder and sear until cooked through.', 'Warm the beans.', 'Build bowls and finish with cilantro and lime.'],
  },
  {
    key: 'friedrice',
    name: 'Egg fried rice',
    tag: 'Dinner',
    servings: 2,
    minutes: 20,
    ingredients: [ing('white-rice', 'White rice', 2, 'cup'), ing('eggs', 'Eggs', 2, 'each'), ing('onion', 'Yellow onion', 1, 'each'), ing('soy-sauce', 'Soy sauce', 1, 'bottle')],
    steps: ['Cook the rice and let it cool.', 'Scramble the eggs and set aside.', 'Fry the onion, add the rice, eggs and soy sauce.'],
  },
  {
    key: 'chili',
    name: 'Black bean chili',
    tag: 'Dinner',
    servings: 6,
    minutes: 45,
    ingredients: [
      ing('black-beans', 'Black beans', 2, 'can'),
      ing('diced-tomatoes', 'Diced tomatoes', 2, 'can'),
      ing('onion', 'Yellow onion', 1, 'each'),
      ing('garlic', 'Garlic', 1, 'head'),
      ing('chili-powder', 'Chili powder', 1, 'jar'),
      ing('cumin', 'Ground cumin', 1, 'jar'),
    ],
    steps: ['Soften the onion and garlic.', 'Add the spices, beans and tomatoes.', 'Simmer 30 minutes.'],
  },
  {
    key: 'quesadillas',
    name: 'Cheesy chicken quesadillas',
    tag: 'Lunch',
    servings: 2,
    minutes: 15,
    ingredients: [ing('tortillas', 'Flour tortillas', 4, 'each'), ing('chicken-breast', 'Chicken breast', 0.5, 'lb'), ing('cheddar-cheese', 'Cheddar cheese', 4, 'oz'), ing('sour-cream', 'Sour cream', 1, 'cup')],
    steps: ['Fill the tortillas with chicken and cheese.', 'Toast both sides until the cheese melts.', 'Serve with sour cream.'],
  },
];

const GROCERY = [
  { ingredient_id: 'cilantro', name: 'Cilantro', category: 'produce', quantity: 1, unit: 'bunch', checked: false },
  { ingredient_id: 'lime', name: 'Limes', category: 'produce', quantity: 3, unit: 'each', checked: false },
  { ingredient_id: 'bananas', name: 'Bananas', category: 'produce', quantity: 6, unit: 'each', checked: false },
  { ingredient_id: 'tortillas', name: 'Flour tortillas', category: 'dry_goods', quantity: 1, unit: 'pack', checked: false },
  { ingredient_id: 'soy-sauce', name: 'Soy sauce', category: 'condiments', quantity: 1, unit: 'bottle', checked: false },
  { ingredient_id: 'greek-yogurt', name: 'Greek yogurt', category: 'dairy', quantity: 32, unit: 'oz', checked: false },
  { ingredient_id: 'coffee', name: 'Ground coffee', category: 'dry_goods', quantity: 1, unit: 'bag', checked: true },
];

function storeRow(id: string, name: string, brand: string | null, km: number, street: string) {
  const lat = Number((HOME.lat + km * KM_LAT).toFixed(6));
  return {
    id,
    name,
    brand,
    category: 'grocery_store',
    address_line: street,
    city: 'Modesto',
    state: 'CA',
    zip: '95350',
    lat,
    lng: HOME.lng,
    geom: `SRID=4326;POINT(${HOME.lng} ${lat})`,
    website: null,
    sources: ['demo'],
  };
}

/** A Kroger-family store in kroger-deals' "locations" answer shape (stubbed, never the live function). */
const KROGER_STORE = {
  id: 'demo-k1',
  name: 'Food 4 Less',
  chain: 'Food 4 Less',
  addressLine: '1700 McHenry Ave',
  city: 'Modesto',
  state: 'CA',
  zip: '95350',
  lat: Number((HOME.lat + 2.4 * KM_LAT).toFixed(6)),
  lng: HOME.lng,
  url: 'https://www.food4less.com/stores/details/demo-k1',
};

test.beforeAll(async () => {
  const admin = adminClient();
  seed.email = freshEmail('play-demo');
  const created = await admin.auth.admin.createUser({ email: seed.email, password, email_confirm: true });
  expect(created.error).toBeNull();
  seed.userId = created.data.user!.id;

  const pantry = await admin.from('pantry_items').insert(PANTRY.map((r) => ({ ...r, user_id: seed.userId })));
  expect(pantry.error, `seed pantry: ${pantry.error?.message}`).toBeNull();

  const tok = Date.now().toString(36);
  const recipes = await admin
    .from('recipes')
    .insert(
      RECIPES.map((r) => ({
        name: r.name,
        slug: `play-${tok}-${r.key}`,
        is_master: true,
        servings: r.servings,
        minutes: r.minutes,
        tag: r.tag,
        ingredients: r.ingredients,
        steps: r.steps,
      })),
    )
    .select('id, name');
  expect(recipes.error, `seed recipes: ${recipes.error?.message}`).toBeNull();
  for (const r of RECIPES) {
    seed.recipeIds[r.key] = (recipes.data ?? []).find((row) => row.name === r.name)!.id as string;
  }

  const saved = await admin.from('user_saved_recipes').insert(
    ['bowls', 'chili'].map((key) => {
      const r = RECIPES.find((x) => x.key === key)!;
      return {
        user_id: seed.userId,
        ref_key: `kitchen:play-${tok}-${key}`,
        source_type: 'kitchen',
        kitchen_recipe_id: seed.recipeIds[key],
        title: r.name,
        preview: { appRoute: `r_${seed.recipeIds[key]}` },
      };
    }),
  );
  expect(saved.error, `seed saved: ${saved.error?.message}`).toBeNull();

  const grocery = await admin.from('grocery_list_items').insert(GROCERY.map((r) => ({ ...r, origin: 'manual', user_id: seed.userId })));
  expect(grocery.error, `seed grocery: ${grocery.error?.message}`).toBeNull();

  const stores = await admin.from('stores').upsert(
    [
      storeRow('demo-safeway', 'Safeway', 'Safeway', 1.3, '2100 Standiford Ave'),
      storeRow('demo-tj', "Trader Joe's", "Trader Joe's", 3.1, '3250 Dale Rd'),
      storeRow('demo-go', 'Grocery Outlet Bargain Market', 'Grocery Outlet', 4.2, '1031 Oakdale Rd'),
      storeRow('demo-market', 'Valley Fresh Market', null, 0.8, '420 Orangeburg Ave'),
    ],
    { onConflict: 'id' },
  );
  expect(stores.error, `seed stores: ${stores.error?.message}`).toBeNull();
});

/** Nothing leaves this machine; edge functions are answered here (or refused with a 503). */
async function isolate(context: BrowserContext, page: Page) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/]|localhost[:/])/, (route) => route.abort('blockedbyclient'));
  await page.route('**/functions/v1/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({
      status: 503,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Not available while taking screenshots.' }),
    });
  });
  await page.addInitScript(() => {
    window.open = (() => null) as typeof window.open;
  });
}

async function stubFunction(page: Page, name: string, status: number, json: (body: Record<string, unknown>) => unknown) {
  await page.route(`**/functions/v1/${name}`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json(body)) });
  });
}

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(seed.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
}

/** Saves what is on the phone screen (not the full page) as play-screenshots/<name>.png. */
async function shoot(page: Page, name: string) {
  await expect(page.getByText('Preview build')).toHaveCount(0);
  await page.evaluate(async () => {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.waitForTimeout(600);
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: false, animations: 'disabled', caret: 'hide' });
}

function shot(name: string, title: string, steps: (page: Page) => Promise<void>) {
  test(`${name}: ${title}`, async ({ page, context }) => {
    await isolate(context, page);
    await steps(page);
    await shoot(page, name);
  });
}

shot('01-home', 'Home: Ask Forky box and the counters', async (page) => {
  await signIn(page);
  await expect(page.getByRole('textbox', { name: 'Ask Forky a question' })).toBeVisible();
  await expect(page.getByTestId('home-count-pantry-value')).toHaveText(String(PANTRY.length));
  await expect(page.getByTestId('home-count-grocery-value')).toHaveText(String(GROCERY.filter((g) => !g.checked).length));
  await expect(page.getByTestId('home-count-ready-value')).toHaveText(/^[1-9]\d*$/);
});

shot('02-pantry-shelves', 'Pantry: Fridge, Pantry and Spice rack shelves', async (page) => {
  await signIn(page);
  await page.goto('/pantry');
  await expect(page.getByText(`${PANTRY.length} items`, { exact: true })).toBeVisible();
});

shot('03-recipes-feed', 'Recipes: cook from your pantry', async (page) => {
  await signIn(page);
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'Cook from your pantry' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Garlic tomato spaghetti, / }).first()).toBeVisible();
});

shot('04-recipe-detail', 'A recipe with have / missing and add missing', async (page) => {
  await signIn(page);
  await page.goto(`/recipe/r_${seed.recipeIds.bowls}`);
  await expect(page.getByRole('heading', { name: 'Chicken burrito bowls' })).toBeVisible();
});

shot('05-ask-forky', 'Ask Forky with a stubbed answer', async (page) => {
  await stubFunction(page, 'ask-forky', 200, (body) => {
    const recipes = (body.recipes as { id: string; title: string }[]) ?? [];
    const ids = recipes.filter((r) => r.title === 'Black bean chili' || r.title === 'Garlic tomato spaghetti').map((r) => r.id);
    return {
      answer:
        'You have everything for a pot of black bean chili tonight: beans, tomatoes, onion, garlic and your chili powder and cumin. Short on time? Garlic tomato spaghetti is ready in 25 minutes.',
      recipeIds: ids,
      offTopic: false,
      safetyNote: false,
      remaining: 4,
      limit: 5,
      isPlus: false,
      tier: 'free',
    };
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Ask Forky', exact: true }).first().click();
  await expect(page).toHaveURL(/\/forky$/);
  await page.getByRole('textbox', { name: 'Your question for Forky' }).fill('What can I make for dinner tonight?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(/pot of black bean chili tonight/)).toBeVisible();
});

/** A 64x64 checkerboard BMP: the photo the scan screen sends (the answer is stubbed anyway). */
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

shot('06-scan-review', 'Scan review list (stubbed fridge scan)', async (page) => {
  await stubFunction(page, 'pantry-vision', 200, () => {
    const items = [
      { name: 'greek yogurt', quantity: 32, unit: 'oz', category: 'dairy', storage: 'fridge', confidence: 0.94 },
      { name: 'strawberries', quantity: 1, unit: 'lb', category: 'produce', storage: 'fridge', confidence: 0.91 },
      { name: 'carrots', quantity: 2, unit: 'lb', category: 'produce', storage: 'fridge', confidence: 0.89 },
      { name: 'orange juice', quantity: 1, unit: 'carton', category: 'dairy', storage: 'fridge', confidence: 0.86 },
      { name: 'bell peppers', quantity: 3, unit: 'each', category: 'produce', storage: 'fridge', confidence: 0.6 },
    ];
    return {
      items,
      model: 'stub',
      usage: { isPlus: false, tier: 'free', limit: 3, remaining: 2 },
      scanLocation: 'fridge',
      kind: 'pantry',
      cached: false,
      itemCount: items.length,
    };
  });
  await signIn(page);
  await page.goto('/scan');
  await page.getByRole('radio', { name: 'Fridge', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a photo' }).first().click();
  await (await chooser).setFiles({ name: 'fridge.bmp', mimeType: 'image/bmp', buffer: checkerboardBmp() });
  const heading = page.getByText(/^Check what we found \(\d+\)$/);
  await expect(heading).toBeVisible();
  await heading.scrollIntoViewIfNeeded();
  await heading.evaluate((el) => el.scrollIntoView({ block: 'start' }));
});

shot('07-grocery-list', 'Grocery list', async (page) => {
  await signIn(page);
  await page.goto('/grocery');
  await expect(page.getByRole('checkbox', { name: /^Cilantro, / })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Ground coffee, / })).toBeChecked();
});

shot('08-grocery-stores', 'Grocery: stores near you', async (page) => {
  await stubFunction(page, 'kroger-deals', 200, () => ({ stores: [KROGER_STORE], configured: true }));
  await signIn(page);
  await page.goto('/grocery?view=stores');
  await expect(page.getByRole('radio', { name: 'Stores', exact: true })).toBeChecked();
  await expect(page.getByTestId('stores-origin')).toHaveText('Near your location');
  await expect(page.getByTestId('store-demo-safeway')).toBeVisible();
});
