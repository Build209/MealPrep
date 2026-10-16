import type { BrowserContext, Page, Route } from '@playwright/test';
import { expect, test } from './device';
import { adminClient, freshEmail } from './local-supabase';
import { checkScreen, type Purpose } from './phone-checks';

/**
 * Phone screen tour (runs only in playwright.phone.config.ts, on an iPhone and an Android profile).
 * Visits every screen of SWITCHOVER.md section 2 that a browser can reach, against the LOCAL stack,
 * takes a full-page screenshot of each (phone-screens/<project>/<NN>-<screen>.png) and runs the
 * automatic checks in phone-checks.ts (sideways scroll, 44px tap targets, clipped text, tomato rule).
 *
 * Data: a seeded account (service key, local only) with pantry items, an own recipe, a saved recipe,
 * grocery items (one ticked), a creator video and two stores near ZIP 69201 (the same rows
 * stores.spec.ts upserts, so neither spec changes what the other sees). A second, empty account
 * shows the empty pantry. A third account is made through the sign-up screen (18+ box).
 * Edge functions are never called: ask-forky and kroger-deals are answered here in their real
 * shapes, any other /functions/v1/ call gets a 503, and every request off this machine is blocked.
 * Each screen is its own test, so one failing screen does not hide the others.
 */

const password = 'e2e-Phone-Password-123';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const KM_LAT = 0.008993;
const ZIP = { zip: '69201', lat: 42.6917, lng: -100.6176 };

function word(): string {
  let out = 'zp';
  for (let i = 0; i < 8; i++) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out;
}

// Set in beforeAll (again in a new worker after a failure, which re-seeds a fresh account).
const seed = { tok: '', email: '', userId: '', emptyEmail: '', recipeId: '', recipeTitle: '', videoTitle: '' };

async function insertOne(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminClient().from(table).insert(row).select('id').single();
  expect(error, `seed ${table}: ${error?.message}`).toBeNull();
  return (data as { id: string }).id;
}

async function createUser(label: string): Promise<{ email: string; userId: string }> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  return { email, userId: created.data.user!.id };
}

test.beforeAll(async () => {
  const admin = adminClient();
  seed.tok = word();
  const main = await createUser('phone');
  seed.email = main.email;
  seed.userId = main.userId;
  seed.emptyEmail = (await createUser('phone-empty')).email;

  const pantry = await admin.from('pantry_items').insert(
    [
      { ingredient_id: 'eggs', name: 'Eggs', category: 'dairy', quantity: 12, unit: 'each', location: 'fridge' },
      { ingredient_id: 'milk', name: 'Milk', category: 'dairy', quantity: 1, unit: 'l', location: 'fridge' },
      { ingredient_id: 'white-rice', name: 'White rice', category: 'dry_goods', quantity: 2, unit: 'cup', location: 'pantry' },
      { ingredient_id: 'black-beans', name: 'Black beans', category: 'canned', quantity: 2, unit: 'can', location: 'pantry' },
      { ingredient_id: 'cheddar-cheese', name: 'Extra sharp aged white cheddar cheese block', category: 'dairy', quantity: 1, unit: 'block', location: 'fridge' },
    ].map((r) => ({ ...r, user_id: seed.userId })),
  );
  expect(pantry.error).toBeNull();

  seed.recipeTitle = `Phone ${seed.tok} egg fried rice`;
  seed.recipeId = await insertOne('recipes', {
    name: seed.recipeTitle,
    slug: `phone-${seed.tok}-fried-rice`,
    created_by: seed.userId,
    is_master: false,
    servings: 2,
    minutes: 20,
    tag: 'Dinner',
    ingredients: [
      { ingredientId: 'eggs', name: 'Eggs', quantity: 2, unit: 'each' },
      { ingredientId: 'white-rice', name: 'White rice', quantity: 2, unit: 'cup' },
      { ingredientId: 'scallions', name: 'Scallions', quantity: 3, unit: 'each' },
      { ingredientId: 'soy-sauce', name: 'Soy sauce', quantity: 2, unit: 'tbsp' },
    ],
    steps: ['Cook the rice and let it cool.', 'Scramble the eggs.', 'Fry the rice with the eggs, scallions and soy sauce.'],
  });
  const saved = await admin.from('user_saved_recipes').insert({
    user_id: seed.userId,
    ref_key: `kitchen:phone-${seed.tok}-fried-rice`,
    source_type: 'kitchen',
    kitchen_recipe_id: seed.recipeId,
    title: seed.recipeTitle,
    preview: { appRoute: `r_${seed.recipeId}` },
  });
  expect(saved.error).toBeNull();

  const grocery = await admin.from('grocery_list_items').insert(
    [
      { ingredient_id: 'scallions', name: 'Scallions', category: 'produce', quantity: 3, unit: 'each', checked: false, origin: 'manual' },
      { ingredient_id: 'soy-sauce', name: 'Soy sauce', category: 'condiments', quantity: 1, unit: 'bottle', checked: false, origin: 'manual' },
      { ingredient_id: 'apples', name: 'Apples', category: 'produce', quantity: 6, unit: 'each', checked: true, origin: 'manual' },
    ].map((r) => ({ ...r, user_id: seed.userId })),
  );
  expect(grocery.error).toBeNull();

  const channelId = `UC-phone-${seed.tok}`;
  seed.videoTitle = `${seed.tok} weeknight fried rice recipe`;
  const creator = await admin
    .from('recipe_creators')
    .insert({ youtube_channel_id: channelId, display_name: 'Phone Test Chef', channel_url: 'https://www.youtube.com/@phonetestchef', enabled: true });
  expect(creator.error).toBeNull();
  const video = await admin.from('creator_videos').insert({
    video_id: `phone${seed.tok}`,
    channel_id: channelId,
    title: seed.videoTitle,
    description_snippet: 'Ingredients: 2 cups rice, 2 eggs',
    thumbnail_url: 'http://127.0.0.1:4173/e2e-missing-thumb.png',
    url: `https://www.youtube.com/watch?v=phone${seed.tok}`,
    published_at: new Date().toISOString(),
  });
  expect(video.error).toBeNull();

  // Exactly the rows stores.spec.ts upserts near ZIP 69201 (same ids, same values).
  const storeRow = (id: string, name: string, km: number, website: string | null) => {
    const lat = Number((ZIP.lat + km * KM_LAT).toFixed(6));
    return {
      id,
      name,
      brand: null,
      category: 'grocery_store',
      address_line: `${Math.round(km * 100)} E2E Road`,
      city: 'Testville',
      state: 'WY',
      zip: '82190',
      lat,
      lng: ZIP.lng,
      geom: `SRID=4326;POINT(${ZIP.lng} ${lat})`,
      website,
      sources: ['e2e'],
    };
  };
  const stores = await admin.from('stores').upsert(
    [
      storeRow('e2e-zip-market', 'Sandhills Market', 0.5, null),
      storeRow('e2e-zip-go', 'Grocery Outlet Bargain Market', 1, 'https://www.groceryoutlet.com/circulars/storeid/4242'),
    ],
    { onConflict: 'id' },
  );
  expect(stores.error).toBeNull();
});

/** Nothing leaves this machine; edge functions are answered here (or refused with a 503). */
async function isolate(context: BrowserContext, page: Page) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/]|localhost[:/])/, (route) => route.abort('blockedbyclient'));
  await page.route('**/functions/v1/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({
      status: 503,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Not available in the phone tour.' }),
    });
  });
  // window.open is recorded instead of opening another site.
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

async function signIn(page: Page, email = seed.email) {
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
}

type Step = (page: Page, context: BrowserContext) => Promise<string[] | void>;

/** One tour screen: isolate, run the steps to reach the state, then screenshot + checks. */
function screen(order: string, slug: string, purpose: Purpose, title: string, steps: Step, tapReportOnly?: string) {
  test(`${order} ${slug}: ${title}`, async ({ page, context }, testInfo) => {
    await isolate(context, page);
    const notes = (await steps(page, context)) ?? [];
    await checkScreen(page, testInfo, { order, screen: slug, purpose, notes, tapReportOnly });
  });
}

// ---- Signed out ----------------------------------------------------------------------------

screen('01', 'sign-in', 'none', 'the sign-in screen', async (page) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
});

screen('02', 'sign-up-18plus', 'none', 'create account with the 18+ box ticked', async (page) => {
  await page.goto('/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(freshEmail('phone-signup'));
  await page.getByLabel('Password', { exact: true }).fill(password);
  const age = page.getByRole('checkbox');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();
  await age.click();
  await expect(age).toBeChecked();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeEnabled();
  return ['Screenshot before pressing Create account; the next screen (Home) is checked in 04.'];
});

screen('03', 'forgot-password', 'none', 'the forgot-password form', async (page) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('Reset your password')).toBeVisible();
});

// ---- Signed in, seeded account -------------------------------------------------------------

screen('04', 'home', 'none', 'Home: Ask Forky box and the counters (seeded account)', async (page) => {
  await signIn(page);
  await expect(page.getByRole('textbox', { name: 'Ask Forky a question' })).toBeVisible();
  // 5 pantry items; 2 grocery rows to buy (Apples is ticked); the seeded recipe misses scallions and soy sauce.
  await expect(page.getByTestId('home-count-pantry-value')).toHaveText('5');
  await expect(page.getByTestId('home-count-grocery-value')).toHaveText('2');
  await expect(page.getByTestId('home-count-ready-value')).toHaveText(/^\d+$/);
  return ['The promo slot under the counters is a link to Plans on the web (no ads, nothing loaded from outside).'];
});

/**
 * The tab bar (owner's phone test: "tabs at bottom aren't populating"): each tab shows an icon over
 * its label, the icon is hidden from screen readers (the label names the tab), every tab is at least
 * 44px tall and fully on screen, and the bar's bottom padding covers the safe-area inset (read from
 * env(safe-area-inset-bottom); 0 in these browsers, about 34px on an iPhone home-screen web app).
 */
test('tab bar: icons over labels, on screen, above the safe area', async ({ page, context }) => {
  await isolate(context, page);
  await signIn(page);
  await page.evaluate(async () => {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  });
  const m = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    document.body.appendChild(probe);
    const safeBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    let bar: HTMLElement | null = null;
    const tabs = ['index', 'pantry', 'recipes', 'grocery'].map((route) => {
      const icon = document.querySelector<HTMLElement>(`[data-testid="tab-icon-${route}"]`);
      if (!icon) return { route, found: false, iconW: 0, iconH: 0, hidden: false, label: '', tabH: 0, tabBottom: 0, iconAboveLabel: false };
      const tab = icon.closest<HTMLElement>('a, button, [role="tab"], [role="button"], [role="link"]');
      const ir = icon.getBoundingClientRect();
      const tr = tab?.getBoundingClientRect();
      if (!bar && tab) {
        let p: HTMLElement | null = tab.parentElement;
        while (p && p !== document.body && !(parseFloat(getComputedStyle(p).borderTopWidth) > 0)) p = p.parentElement;
        bar = p && p !== document.body ? p : null;
      }
      const label = (tab?.innerText ?? '').replace(/[^\x20-\x7e]/g, '').trim();
      // The label's text node sits below the icon.
      let labelTop = 0;
      if (tab) {
        const walker = document.createTreeWalker(tab, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (/[A-Za-z]/.test(n.textContent ?? '') && n.parentElement) {
            labelTop = n.parentElement.getBoundingClientRect().top;
            break;
          }
        }
      }
      return {
        route,
        found: true,
        iconW: ir.width,
        iconH: ir.height,
        hidden: !!icon.closest('[aria-hidden="true"]'),
        label,
        tabH: tr?.height ?? 0,
        tabBottom: tr?.bottom ?? 0,
        iconAboveLabel: labelTop >= ir.bottom - 1,
      };
    });
    const b = bar as HTMLElement | null;
    return {
      tabs,
      safeBottom,
      innerHeight: window.innerHeight,
      barBottom: b ? b.getBoundingClientRect().bottom : -1,
      barPaddingBottom: b ? parseFloat(getComputedStyle(b).paddingBottom) : -1,
    };
  });
  expect(m.tabs.map((t) => t.label)).toEqual(['Home', 'Pantry', 'Recipes', 'Grocery']);
  for (const t of m.tabs) {
    expect(t.found, `${t.route}: tab icon present`).toBe(true);
    expect(t.iconW, `${t.route}: icon has a size`).toBeGreaterThan(10);
    expect(t.iconH, `${t.route}: icon has a size`).toBeGreaterThan(10);
    expect(t.hidden, `${t.route}: icon hidden from screen readers`).toBe(true);
    expect(t.iconAboveLabel, `${t.route}: icon above the label`).toBe(true);
    expect(t.tabH, `${t.route}: tab at least 44px tall`).toBeGreaterThanOrEqual(44);
    expect(t.tabBottom, `${t.route}: tab fully on screen`).toBeLessThanOrEqual(m.innerHeight + 1);
  }
  expect(m.barBottom, 'tab bar found and fully on screen').toBeGreaterThan(0);
  expect(m.barBottom).toBeLessThanOrEqual(m.innerHeight + 1);
  expect(m.barPaddingBottom, 'bar padding covers the safe-area inset').toBeGreaterThanOrEqual(m.safeBottom + 8 - 0.5);
  // Every tab is still reachable by its name alone (the icon adds nothing to it).
  for (const name of ['Home', 'Pantry', 'Recipes', 'Grocery']) {
    await expect(page.getByRole('tab', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).first()).toBeVisible();
  }
});

screen('05', 'pantry-shelves', 'none', 'Pantry, shelves view', async (page) => {
  await signIn(page);
  await page.goto('/pantry');
  await expect(page.getByText('5 items', { exact: true })).toBeVisible();
  return ['Tomato is allowed here only on the Scan button (camera).'];
});

screen('06', 'pantry-list', 'none', 'Pantry, list view', async (page) => {
  await signIn(page);
  await page.goto('/pantry');
  await page.getByRole('radio', { name: 'List', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Eggs, 12 each/ })).toBeVisible();
  return ['Includes a long item name ("Extra sharp aged white cheddar cheese block") to test wrapping.'];
});

screen('07', 'pantry-empty', 'none', 'Pantry, empty (second account)', async (page) => {
  await signIn(page, seed.emptyEmail);
  await page.goto('/pantry');
  await expect(page.getByText('Your pantry is empty').filter({ visible: true })).toBeVisible();
});

screen('07a', 'pantry-clear-menu', 'none', 'Pantry: Clear items menu with counts', async (page) => {
  await signIn(page);
  await page.goto('/pantry');
  await page.getByRole('button', { name: /^Clear items/ }).click();
  await expect(page.getByRole('button', { name: 'Fridge, 3 items', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spice rack, no items', exact: true })).toBeDisabled();
  return ['Neutral (ink) control, never tomato. Spice rack is empty in the seed, so its choice is disabled.'];
});

screen('07b', 'pantry-clear-confirm', 'none', 'Pantry: Clear items confirm (nothing is removed)', async (page) => {
  await signIn(page);
  await page.goto('/pantry');
  await page.getByRole('button', { name: /^Clear items/ }).click();
  await page.getByRole('button', { name: 'Fridge, 3 items', exact: true }).click();
  await expect(page.getByText('Remove all 3 items from the Fridge?')).toBeVisible();
  return ['The tour stops at the confirm; the seeded rows stay for the other screens.'];
});

screen('08', 'scan', 'camera', 'the scan screen (no camera in the browser)', async (page) => {
  await signIn(page);
  await page.goto('/scan');
  await expect(page.getByRole('button', { name: 'Choose a photo' }).first()).toBeVisible();
  return ['No photo is taken: the real camera scan stays on the owner list.'];
});

screen('09', 'grocery-ticked', 'none', 'Grocery with one ticked item', async (page) => {
  await signIn(page);
  await page.goto('/grocery');
  await expect(page.getByRole('checkbox', { name: /^Scallions, / })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Apples, / })).toBeChecked();
});

screen('10', 'recipe-search', 'none', 'Recipe search with results', async (page) => {
  await signIn(page);
  await page.goto(`/recipes/search?q=${seed.tok}`);
  await expect(page.getByRole('link', { name: new RegExp(`^${seed.recipeTitle}\\b`) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`^${seed.videoTitle}, by Phone Test Chef`) })).toBeVisible();
});

screen('11', 'recipes-saved', 'none', 'Saved recipes', async (page) => {
  await signIn(page);
  await page.goto('/recipes/saved');
  await expect(page.getByText('1 saved')).toBeVisible();
});

screen('12', 'recipe-page', 'none', 'a recipe page (have / missing, add missing)', async (page) => {
  await signIn(page);
  await page.goto(`/recipe/r_${seed.recipeId}`);
  await expect(page.getByRole('heading', { name: seed.recipeTitle })).toBeVisible();
});

screen('13', 'recipe-import', 'none', 'Import a recipe', async (page) => {
  await signIn(page);
  await page.goto('/recipes/import');
  await expect(page.getByRole('textbox', { name: 'Recipe link or text' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Import · / })).toBeVisible();
  return ['Photo import uses the camera/file picker: only the screen is checked.'];
});

screen('14', 'creators', 'none', 'Creator videos', async (page) => {
  await signIn(page);
  await page.goto('/creators');
  await expect(page.getByRole('link', { name: new RegExp(`^${seed.videoTitle}, by Phone Test Chef`) })).toBeVisible();
});

screen('15', 'forky-answer', 'none', 'Ask Forky with a stubbed answer', async (page) => {
  await stubFunction(page, 'ask-forky', 200, (body) => {
    const recipes = (body.recipes as { id: string; title: string }[]) ?? [];
    const match = recipes.find((r) => r.title === seed.recipeTitle);
    return {
      answer: 'Your eggs and rice are perfect for egg fried rice tonight. Pick up scallions and soy sauce on the way home.',
      recipeIds: match ? [match.id] : [],
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
  await page.getByRole('textbox', { name: 'Your question for Forky' }).fill('What can I cook tonight?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(/perfect for egg fried rice tonight/)).toBeVisible();
  // Home (with the same allowance line) stays mounted under the chat.
  await expect(page.getByText('4 questions left this month', { exact: true }).filter({ visible: true })).toBeVisible();
  return ['The ask-forky function is stubbed: the answer text is the test\'s, not the AI\'s.'];
});

screen('16', 'stores-zip', 'none', 'Stores found by ZIP (Grocery, Stores view)', async (page) => {
  await stubFunction(page, 'kroger-deals', 503, () => ({ error: 'Live Kroger prices are not set up yet.', configured: false }));
  await signIn(page);
  await page.goto('/grocery?view=stores');
  const zipBox = page.getByRole('textbox', { name: 'ZIP code' });
  await expect(zipBox).toBeVisible();
  await zipBox.fill(ZIP.zip);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByTestId('stores-origin')).toHaveText(`Near ${ZIP.zip}`);
  await expect(page.getByTestId('store-e2e-zip-go')).toBeVisible();
  return ['GPS ("Use my location") needs the native permission prompt: owner list.'];
});

screen('17', 'plans', 'money', 'Plans & usage (free account)', async (page) => {
  await signIn(page);
  await page.goto('/plans');
  await expect(page.getByRole('button', { name: /^Subscribe for / })).toBeVisible();
  return ['No checkout is created: the live Stripe test purchase stays on the owner list.'];
});

screen('18', 'usage', 'money', 'Usage this month', async (page) => {
  await signIn(page);
  await page.goto('/usage');
  await expect(page.getByTestId('usage-scans')).toBeVisible();
});

screen('19', 'account', 'none', 'Account', async (page) => {
  await signIn(page);
  await page.goto('/account');
  await expect(page.getByTestId('account-email')).toHaveText(seed.email);
  return ['Free account: no Manage subscription button (that is the only money control Account has).'];
});

screen('20', 'delete-account', 'none', 'Delete account page', async (page) => {
  await signIn(page);
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: 'Delete your MealPlanatic account' })).toBeVisible();
});

screen('21', 'delete-account-confirm', 'none', 'Delete account confirm step (nothing is deleted)', async (page) => {
  await signIn(page);
  await page.goto('/delete-account');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();
  return ['The confirm button is never pressed; delete-user-account would get the tour\'s 503 anyway.'];
});

/** The legal pages are the approved files, byte for byte equal to mobile/public (site-build.yml checks it). */
// ---- Signed out again: reset, not found, legal ------------------------------------------------

screen('22', 'reset-password-expired', 'none', 'reset-password with an expired link', async (page) => {
  await page.goto('/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByText(/That reset link has expired or was already used/)).toBeVisible();
  return ['The "choose a new password" form needs a recovery email: reset-password.spec.ts covers it on phones.'];
});

screen('23', 'not-found', 'none', 'an unknown address', async (page) => {
  await signIn(page);
  await page.goto('/no-such-page-on-phones');
  await expect(page.getByText('That page does not exist.')).toBeVisible();
});

screen('24', 'terms', 'none', 'Terms (/terms.html from the export)', async (page) => {
  const res = await page.goto('/terms.html');
  expect(res?.status()).toBe(200);
  await expect(page.locator('body')).toContainText(/terms/i);
  await expect(page.locator('body')).toContainText(/18/);
  return ['Static legal page (public/terms.html), not an app screen.'];
});

screen('25', 'privacy', 'none', 'Privacy (/privacy.html from the export)', async (page) => {
  const res = await page.goto('/privacy.html');
  expect(res?.status()).toBe(200);
  await expect(page.locator('body')).toContainText(/privacy/i);
  return ['Static legal page (public/privacy.html), not an app screen.'];
});

screen('26', 'help', 'none', 'Help (FAQ, Contact us, policies)', async (page) => {
  await signIn(page);
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contact us' })).toBeVisible();
  return ['Contact us opens an email (mailto:), not followed here.'];
});

screen('27', 'accessibility', 'none', 'Accessibility statement (/accessibility.html from the export)', async (page) => {
  const res = await page.goto('/accessibility.html');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Accessibility' })).toBeVisible();
  return ['Static page (public/accessibility.html), not an app screen.'];
});

// ---- Added with the four-tab layout (2026-10-15) ------------------------------------------------

screen('28', 'recipes-tab', 'none', 'Recipes tab: the feed with seeded pantry and recipe', async (page) => {
  await signIn(page);
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'Cook from your pantry' })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^${seed.recipeTitle}, `) }).first()).toBeVisible();
});

screen('29', 'home-forky-ask', 'none', 'Ask Forky from the Home box (stubbed answer)', async (page) => {
  await stubFunction(page, 'ask-forky', 200, () => ({
    answer: 'Use the eggs first: an omelette with the cheddar.',
    recipeIds: [],
    offTopic: false,
    safetyNote: false,
    remaining: 4,
    limit: 5,
    isPlus: false,
    tier: 'free',
  }));
  await signIn(page);
  const box = page.getByRole('textbox', { name: 'Ask Forky a question' });
  await box.fill('What should I use up first?');
  // Send must be fully tappable on narrow screens too (flip phone cover screen): it wraps under the box.
  const send = page.getByRole('button', { name: 'Send to Forky', exact: true });
  await send.scrollIntoViewIfNeeded();
  const box44 = await send.boundingBox();
  expect(box44 && box44.width >= 44 && box44.height >= 44, `Send is 44px: ${JSON.stringify(box44)}`).toBeTruthy();
  await send.click();
  await expect(page.getByText(/Use the eggs first/)).toBeVisible();
  return ['The ask-forky function is stubbed: the answer text is the test\'s, not the AI\'s.'];
});

screen('30', 'grocery-stores-switch', 'none', 'Grocery: the List | Stores switch', async (page) => {
  await stubFunction(page, 'kroger-deals', 503, () => ({ error: 'Live Kroger prices are not set up yet.', configured: false }));
  await signIn(page);
  await page.goto('/stores');
  await expect(page.getByRole('radio', { name: 'Stores', exact: true })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Stores near you', exact: true })).toBeVisible();
  return ['Reached through /stores, which redirects to /grocery?view=stores.'];
});
