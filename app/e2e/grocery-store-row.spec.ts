import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * The row of store circles at the top of the Grocery list, end to end against the local stack:
 *  - no saved location: the shopper's favourites plus "Find stores", and no store search at all
 *    (the row never asks for location and never searches from the default ZIP);
 *  - a saved location and no favourites: the 3 closest chains, closest first; a circle opens that store's weekly ad (else its shop page, else the
 *    Stores view); the row fits a narrow (flip phone cover) screen;
 *  - starring in Stores adds to the row, newest first, at most 3 (a 4th stays saved);
 *    starring offline shows the standard offline message and saves nothing; the row still shows offline.
 * A few `stores` rows are seeded (service key, local only) around a point far from the other specs'
 * rows. Every edge function call is answered here: kroger-deals in its real shape, anything else 503.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-StoreRow-Password-123';
const OFFLINE = "You're offline. Changes need a connection.";
const KM_LAT = 0.008993; // degrees of latitude per km
const HOME = { lat: 46.11, lng: -104.27 }; // saved on the profile (already rounded, as the app saves it)
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

type Seed = { id: string; name: string; brand?: string | null; km: number };
const seeds: Seed[] = [
  { id: 'e2e-row-safeway', name: 'Safeway', brand: 'Safeway', km: 1 },
  { id: 'e2e-row-walmart', name: 'Walmart Supercenter', brand: 'Walmart', km: 2 },
  { id: 'e2e-row-tj', name: "Trader Joe's", km: 3 },
  { id: 'e2e-row-foodmaxx', name: 'FoodMaxx', km: 4 },
];

function storeRow(seed: Seed) {
  const lat = Number((HOME.lat + seed.km * KM_LAT).toFixed(6));
  return {
    id: seed.id,
    name: seed.name,
    brand: seed.brand ?? null,
    category: 'grocery_store',
    address_line: `${Math.round(seed.km * 100)} Row Road`,
    city: 'Rowville',
    state: 'MT',
    zip: '59330',
    lat,
    lng: HOME.lng,
    geom: `SRID=4326;POINT(${HOME.lng} ${lat})`,
    website: null,
    sources: ['e2e'],
  };
}

test.beforeAll(async () => {
  const { error } = await adminClient().from('stores').upsert(seeds.map(storeRow), { onConflict: 'id' });
  expect(error).toBeNull();
});

/** kroger-deals answers "no Kroger stores here"; any other function gets a 503. Nothing live is called. */
async function stubFunctions(page: Page): Promise<string[]> {
  const called: string[] = [];
  await page.route('**/functions/v1/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const name = new URL(request.url()).pathname.split('/functions/v1/')[1] ?? '';
    called.push(name);
    const kroger = name === 'kroger-deals';
    return route.fulfill({
      status: kroger ? 200 : 503,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(kroger ? { stores: [], configured: true } : { error: 'Not available in this test.' }),
    });
  });
  return called;
}

/** Counts store searches (the nearby_stores function), to prove the row does not search without a location. */
function countStoreSearches(page: Page): { count: number } {
  const seen = { count: 0 };
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/rpc/nearby_stores')) seen.count += 1;
  });
  return seen;
}

async function newUser(label: string, home?: { lat: number; lng: number }): Promise<{ email: string; userId: string }> {
  const email = freshEmail(label);
  const admin = adminClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  if (home) {
    const saved = await admin.from('profiles').update({ home_lat: home.lat, home_lng: home.lng, home_zip: null }).eq('id', userId);
    expect(saved.error).toBeNull();
  }
  return { email, userId };
}

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('topbar-account')).toBeVisible();
}

const row = (page: Page) => page.getByTestId('grocery-store-row');
const rowKeys = (page: Page) =>
  row(page)
    .locator('[data-testid^="store-row-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.slice('store-row-'.length)));

async function favoriteKeys(userId: string): Promise<string[]> {
  const { data, error } = await adminClient()
    .from('user_favorite_stores')
    .select('store_key, sort_order')
    .eq('user_id', userId)
    .order('sort_order');
  expect(error).toBeNull();
  return (data ?? []).map((r) => r.store_key as string);
}

test('no saved location: favourites plus "Find stores", no store search; "Find stores" opens Stores', async ({ page }) => {
  const user = await newUser('store-row-nolocation');
  const fav = await adminClient().from('user_favorite_stores').insert({
    user_id: user.userId,
    store_key: 'e2e-row-safeway',
    name: 'Safeway',
    chain: 'Safeway',
    city: 'Rowville',
    state: 'MT',
    source: 'osm',
    sort_order: 0,
  });
  expect(fav.error).toBeNull();
  await stubFunctions(page);
  const searches = countStoreSearches(page);
  await signIn(page, user.email);

  await page.goto('/grocery');
  await expect(row(page)).toBeVisible();
  await expect.poll(() => rowKeys(page)).toEqual(['e2e-row-safeway', 'find']);
  await expect(row(page).getByRole('button', { name: 'Safeway, favourite. Weekly ad' })).toBeVisible();
  // Safeway has a logo in storeLogos.ts, so its circle shows the logo image instead of initials.
  await expect(page.getByTestId('store-row-e2e-row-safeway').getByTestId('store-badge-logo')).toBeVisible();
  expect(searches.count).toBe(0);

  await row(page).getByRole('button', { name: 'Find stores near you' }).click();
  await expect(page).toHaveURL(/view=stores/);
  await expect(page.getByRole('heading', { name: 'Stores near you', exact: true })).toBeVisible();
});

test('a saved location: the 3 closest chains; a circle opens that store\'s weekly ad in a new tab; fits a narrow screen', async ({ page, context }) => {
  const user = await newUser('store-row-nearest', HOME);
  const called = await stubFunctions(page);
  await signIn(page, user.email);

  await page.goto('/grocery');
  await expect.poll(() => rowKeys(page)).toEqual(['e2e-row-safeway', 'e2e-row-walmart', 'e2e-row-tj']);
  await expect(row(page).getByRole('button', { name: 'Walmart, nearby. Weekly ad' })).toBeVisible();
  await expect(page.getByTestId('store-row-e2e-row-tj')).toContainText("Trader Joe's");
  // Trader Joe's has a logo too, so no initials ("TJ") in its circle.
  await expect(page.getByTestId('store-row-e2e-row-tj').getByTestId('store-badge-logo')).toBeVisible();
  await expect(page.getByTestId('store-row-e2e-row-tj')).not.toContainText('TJ');
  expect(called.every((name) => name === 'kroger-deals')).toBe(true);

  // A flip phone's cover screen: the row stays on screen (it scrolls sideways itself), every circle a 44px+ target.
  await page.setViewportSize({ width: 260, height: 520 });
  // Polled: the page lays out again after the resize.
  await expect
    .poll(async () => {
      const box = await row(page).boundingBox();
      return box != null && box.x >= 0 && box.x + box.width <= 261;
    })
    .toBe(true);
  for (const key of ['e2e-row-safeway', 'e2e-row-walmart']) {
    const box = await page.getByTestId(`store-row-${key}`).boundingBox();
    expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // Nothing real is loaded: Walmart's page is answered here.
  await context.route('https://www.walmart.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ad</title>' }));
  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByTestId('store-row-e2e-row-walmart').click()]);
  await popup.waitForURL(/walmart\.com/);
  await popup.close();
  // The Grocery list stays where it was (a store with a weekly ad does not open the Stores view).
  await expect(page).not.toHaveURL(/view=stores/);
});

test('Home: the weekly-deals row shows the same circles; a circle opens that store\'s weekly ad in a new tab', async ({ page, context }) => {
  const user = await newUser('store-row-home-deals', HOME);
  await stubFunctions(page);
  // Nothing real is loaded: the weekly-ad page is answered here.
  await context.route('https://www.safeway.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ad</title>' }));
  await signIn(page, user.email);

  await page.goto('/');
  const deals = page.getByTestId('home-deals-row');
  await expect(deals).toBeVisible();
  await expect(deals.getByText("Check your stores for deals")).toBeVisible();
  await expect(deals.getByText('Tap a store to open its weekly ad.')).toBeVisible();
  await expect(page.getByTestId('grocery-store-row')).toHaveCount(0);
  await expect
    .poll(() =>
      deals
        .locator('[data-testid^="home-deals-store-"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.slice('home-deals-store-'.length))),
    )
    .toEqual(['e2e-row-safeway', 'e2e-row-walmart', 'e2e-row-tj']);
  await expect(deals.getByRole('button', { name: 'Weekly ad: Safeway' })).toBeVisible();

  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByTestId('home-deals-store-e2e-row-safeway').click()]);
  // A noopener tab starts at about:blank; wait for it to reach the ad page.
  await popup.waitForURL(/safeway\.com\/weeklyad/);
  await popup.close();
  // Home stays where it was.
  await expect(page).toHaveURL(/\/$/);
});

test('starring in Stores adds to the row (newest first, at most 3); offline starring saves nothing', async ({ page, context }) => {
  const user = await newUser('store-row-star', HOME);
  await stubFunctions(page);
  await signIn(page, user.email);

  await page.goto('/grocery?view=stores');
  await expect(page.getByText('Your 3 newest favourites show on your list.')).toBeVisible();
  await expect(page.getByTestId('store-e2e-row-foodmaxx')).toBeVisible();

  // FoodMaxx is the 4th closest, so not in the row until it is starred.
  const addFoodMaxx = page.getByRole('button', { name: 'Add FoodMaxx to favourites' });
  await addFoodMaxx.click();
  await expect(page.getByRole('button', { name: 'Remove FoodMaxx from favourites' })).toBeVisible();
  await expect.poll(() => favoriteKeys(user.userId)).toEqual(['e2e-row-foodmaxx']);

  await page.getByRole('radio', { name: 'List', exact: true }).click();
  await expect.poll(() => rowKeys(page)).toEqual(['e2e-row-foodmaxx', 'e2e-row-safeway', 'e2e-row-walmart']);
  await expect(row(page).getByRole('button', { name: 'FoodMaxx, favourite. Open in Stores' })).toBeVisible();

  // Three more favourites: the row shows the 3 newest; FoodMaxx stays saved.
  await page.getByRole('radio', { name: 'Stores', exact: true }).click();
  for (const name of ['Safeway', 'Walmart', "Trader Joe's"]) {
    await page.getByRole('button', { name: `Add ${name} to favourites` }).click();
    await expect(page.getByRole('button', { name: `Remove ${name} from favourites` })).toBeVisible();
  }
  await expect
    .poll(() => favoriteKeys(user.userId))
    .toEqual(['e2e-row-foodmaxx', 'e2e-row-safeway', 'e2e-row-walmart', 'e2e-row-tj']);
  await page.getByRole('radio', { name: 'List', exact: true }).click();
  await expect.poll(() => rowKeys(page)).toEqual(['e2e-row-tj', 'e2e-row-walmart', 'e2e-row-safeway']);

  // Offline: unstarring is refused with the standard message and nothing changes on the server.
  await page.getByRole('radio', { name: 'Stores', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Safeway from favourites' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Remove Safeway from favourites' }).click();
  await expect(page.getByText(OFFLINE, { exact: true }).last()).toBeVisible({ timeout: 3_000 });
  await expect(page.getByRole('button', { name: 'Remove Safeway from favourites' })).toBeVisible();

  // The row still shows from what was loaded.
  await page.getByRole('radio', { name: 'List', exact: true }).click();
  await expect.poll(() => rowKeys(page)).toEqual(['e2e-row-tj', 'e2e-row-walmart', 'e2e-row-safeway']);

  await context.setOffline(false);
  await page.waitForTimeout(2_000);
  expect(await favoriteKeys(user.userId)).toEqual(['e2e-row-foodmaxx', 'e2e-row-safeway', 'e2e-row-walmart', 'e2e-row-tj']);
});
