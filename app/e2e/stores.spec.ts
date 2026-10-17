import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Stores (the Grocery tab's Stores view since 2026-10-15; the tests open /stores, which redirects
 * there) end to end, against the local stack. A few `stores` rows are seeded (service key,
 * local only) far from any real data, around two fixed places:
 *  - GPS: the browser's location is granted (Playwright geolocation) near Yellowstone; the list must
 *    show recognised chains first, closest first, with the right weekly-ad links, and the profile
 *    must get the ROUNDED position only. Saving a store must survive a reload.
 *  - ZIP: no location; the shopper types ZIP 69201 (Valentine, NE), which is not in the built-in
 *    home-area table, so the app loads its bundled ZCTA table (/zcta-centroids.json). No live geocoder.
 * The live kroger-deals function is never called: the request is intercepted and answered here in
 * the function's real shape. Links open through window.open, which is recorded instead of opening.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Stores-Password-123';
const KROGER = '**/functions/v1/kroger-deals';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const KM_LAT = 0.008993; // degrees of latitude per km

const GPS = { lat: 44.5, lng: -110.6 }; // what the profile should hold (rounded)
const ZIP = { zip: '69201', lat: 42.6917, lng: -100.6176 }; // the ZCTA centroid in public/zcta-centroids.json

type Seed = { id: string; name: string; brand?: string | null; km: number; website?: string | null; base: { lat: number; lng: number } };

function storeRow(seed: Seed) {
  const lat = Number((seed.base.lat + seed.km * KM_LAT).toFixed(6));
  const lng = seed.base.lng;
  return {
    id: seed.id,
    name: seed.name,
    brand: seed.brand ?? null,
    category: 'grocery_store',
    address_line: `${Math.round(seed.km * 100)} E2E Road`,
    city: 'Testville',
    state: 'WY',
    zip: '82190',
    lat,
    lng,
    geom: `SRID=4326;POINT(${lng} ${lat})`,
    website: seed.website ?? null,
    sources: ['e2e'],
  };
}

const SAFEWAY_PAGE = 'https://local.safeway.com/safeway/wy/testville/1-e2e-road.html';
const GROCERY_OUTLET_PAGE = 'https://www.groceryoutlet.com/circulars/storeid/4242';

const seeds: Seed[] = [
  { id: 'e2e-gps-farm', name: 'Wild Prairie Farm', km: 0.5, base: GPS },
  { id: 'e2e-gps-corner', name: 'Corner Pantry Co', km: 1, base: GPS },
  { id: 'e2e-gps-smoke', name: 'Valley Smoke Shop', km: 1.5, base: GPS },
  { id: 'e2e-gps-safeway', name: 'Safeway', brand: 'Safeway', km: 2, website: SAFEWAY_PAGE, base: GPS },
  { id: 'e2e-gps-tj', name: "Trader Joe's", km: 4, base: GPS },
  { id: 'e2e-zip-market', name: 'Sandhills Market', km: 0.5, base: ZIP },
  { id: 'e2e-zip-go', name: 'Grocery Outlet Bargain Market', km: 1, website: GROCERY_OUTLET_PAGE, base: ZIP },
];

/** A Kroger-family store 3 km from the GPS point, in kroger-deals' "locations" answer shape. */
const RALPHS = {
  id: 'e2e-k1',
  name: 'Ralphs',
  chain: 'Ralphs',
  addressLine: '300 Kroger Way',
  city: 'Testville',
  state: 'WY',
  zip: '82190',
  lat: Number((GPS.lat + 3 * KM_LAT).toFixed(6)),
  lng: GPS.lng,
  url: 'https://www.kroger.com/stores/details/e2e-k1',
};

test.beforeAll(async () => {
  const { error } = await adminClient().from('stores').upsert(seeds.map(storeRow), { onConflict: 'id' });
  expect(error).toBeNull();
});

/** Answers kroger-deals (and its CORS preflight); records each POST body. */
async function stubKroger(page: Page, status: number, json: unknown): Promise<Record<string, unknown>[]> {
  const bodies: Record<string, unknown>[] = [];
  await page.route(KROGER, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    bodies.push(JSON.parse(request.postData() ?? '{}'));
    await route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  });
  return bodies;
}

/** window.open is recorded, so a test never opens another company's site. */
async function recordOpenedLinks(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = ((url?: string | URL) => {
      w.__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
}

const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

async function newUser(label: string): Promise<{ email: string; userId: string }> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  return { email, userId: created.data.user!.id };
}

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}

async function profileLocation(userId: string) {
  const { data, error } = await adminClient().from('profiles').select('home_zip, home_lat, home_lng').eq('id', userId).single();
  expect(error).toBeNull();
  return data as { home_zip: string | null; home_lat: number | null; home_lng: number | null };
}

async function favoriteRows(userId: string) {
  const { data, error } = await adminClient()
    .from('user_favorite_stores')
    .select('store_key, name, source, kroger_location_id')
    .eq('user_id', userId)
    .order('store_key');
  expect(error).toBeNull();
  return data ?? [];
}

const cardIds = (page: Page) =>
  page.locator('[data-testid^="store-"]:not([data-testid="store-badge-logo"])').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.slice('store-'.length)));

test.describe('with the browser location allowed', () => {
  test.use({ geolocation: { latitude: 44.5012, longitude: -110.6013 }, permissions: ['geolocation'] });

  let user: { email: string; userId: string };

  test('chains first, closest first, with weekly-ad links; only the rounded position is saved', async ({ page }) => {
    user = await newUser('stores-gps');
    const krogerBodies = await stubKroger(page, 200, { stores: [RALPHS], configured: true });
    await recordOpenedLinks(page);
    await signIn(page, user.email);

    await page.goto('/stores');
    await expect(page.getByTestId('stores-origin')).toHaveText('Near your location');
    await expect.poll(() => profileLocation(user.userId)).toEqual({ home_zip: null, home_lat: GPS.lat, home_lng: GPS.lng });

    // Recognised chains first (closest first); unbranded rows hidden; the smoke shop never listed.
    await expect.poll(() => cardIds(page)).toEqual(['e2e-gps-safeway', 'kroger-e2e-k1', 'e2e-gps-tj']);
    await expect(page.getByTestId('store-e2e-gps-safeway')).toContainText('1.2 mi');
    await expect(page.getByTestId('store-e2e-gps-safeway')).toContainText('200 E2E Road, Testville WY 82190');
    await page.getByRole('button', { name: 'More local markets (2)' }).click();
    await expect.poll(() => cardIds(page)).toEqual(['e2e-gps-safeway', 'kroger-e2e-k1', 'e2e-gps-tj', 'e2e-gps-farm', 'e2e-gps-corner']);
    await expect(page.getByText('Valley Smoke Shop')).toHaveCount(0);

    // Weekly-ad links: the store's own page for Safeway, the chain's ad page otherwise, none for a farm.
    await page.getByRole('link', { name: 'Weekly ad: Safeway' }).click();
    await page.getByRole('link', { name: 'Weekly ad: Ralphs' }).click();
    await page.getByRole('link', { name: "Weekly ad: Trader Joe's" }).click();
    await page.getByRole('link', { name: 'Directions: Safeway' }).click();
    await expect.poll(() => opened(page)).toEqual([
      SAFEWAY_PAGE,
      'https://www.ralphs.com/weeklyad',
      'https://www.traderjoes.com/home/flyer',
      `https://www.google.com/maps/dir/?api=1&destination=${Number((GPS.lat + 2 * KM_LAT).toFixed(6))},${GPS.lng}`,
    ]);
    await expect(page.getByRole('link', { name: /^Weekly ad: (Wild Prairie Farm|Corner Pantry Co)$/ })).toHaveCount(0);

    // Kroger was asked the old app's way: locations near the rounded point, no ZIP.
    expect(krogerBodies.length).toBeGreaterThan(0);
    expect(krogerBodies.at(-1)).toEqual({ action: 'locations', lat: GPS.lat, lng: GPS.lng, radiusMiles: 10 });
    await expect(page.getByText('Store data © OpenStreetMap contributors, Overture Maps Foundation')).toBeVisible();
  });

  test('Order online: one section with three tiles; each store card has one button that scrolls back to it', async ({ page }) => {
    await stubKroger(page, 200, { stores: [RALPHS], configured: true });
    await recordOpenedLinks(page);
    await signIn(page, user.email);
    await page.goto('/stores');
    await expect.poll(() => cardIds(page)).toEqual(['e2e-gps-safeway', 'kroger-e2e-k1', 'e2e-gps-tj']);

    // The section sits right under the (collapsed, one-line) location row and above the stores.
    const section = page.getByTestId('order-online');
    await expect(section).toBeVisible();
    await expect(section.getByText('Order online', { exact: true })).toBeVisible();
    for (const id of ['doordash', 'instacart', 'walmart']) await expect(page.getByTestId(`order-online-${id}`)).toBeVisible();
    await expect(page.getByTestId('order-online-doordash')).toContainText('Open DoorDash');
    await expect(page.getByTestId('order-online-instacart')).toContainText('Open Instacart');
    await expect(page.getByTestId('order-online-walmart')).toContainText('Open Walmart grocery');

    // Each tile opens that service's ordering page in a new tab (window.open is recorded).
    await page.getByTestId('order-online-doordash').click();
    await page.getByTestId('order-online-instacart').click();
    await page.getByTestId('order-online-walmart').click();
    await expect.poll(() => opened(page)).toEqual([
      'https://www.doordash.com/',
      'https://www.instacart.com/',
      'https://www.walmart.com/cp/grocery/976759',
    ]);

    // No per-store delivery buttons any more: one "Order online" button per card.
    await expect(page.getByRole('link', { name: /^Order with / })).toHaveCount(0);
    for (const id of ['e2e-gps-safeway', 'kroger-e2e-k1', 'e2e-gps-tj']) {
      await expect(page.getByTestId(`store-${id}`).getByRole('button', { name: /^Order online: / })).toHaveCount(1);
    }

    // Tapping it scrolls back up to the section; it opens no link itself.
    const button = page.getByTestId('store-e2e-gps-tj').getByRole('button', { name: "Order online: Trader Joe's" });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(section).toBeInViewport();
    expect(await opened(page)).toHaveLength(3);
  });

  test('a set location is one compact row that opens the ZIP / Use my location panel in place', async ({ page }) => {
    await stubKroger(page, 200, { stores: [RALPHS], configured: true });
    await signIn(page, user.email);
    await page.goto('/stores');
    const row = page.getByTestId('stores-location-row');
    await expect(row).toBeVisible();
    await expect(page.getByTestId('stores-origin')).toHaveText('Near your location');
    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44); // one line, still a 44px target
    expect(box.height).toBeLessThan(64);
    await expect(page.getByText('Find stores near you')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'ZIP code' })).toHaveCount(0);

    await row.click();
    await expect(page.getByRole('textbox', { name: 'ZIP code' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
    await row.click();
    await expect(page.getByRole('textbox', { name: 'ZIP code' })).toHaveCount(0);
  });

  test('a saved store stays saved after a reload; unsaving removes the server row', async ({ page }) => {
    await stubKroger(page, 200, { stores: [RALPHS], configured: true });
    await signIn(page, user.email);
    await page.goto('/stores');

    // The star: its name says what a tap does ("Add ... to favourites" / "Remove ... from favourites").
    const add = (name: string) => page.getByRole('button', { name: `Add ${name} to favourites` });
    const remove = (name: string) => page.getByRole('button', { name: `Remove ${name} from favourites` });
    await expect(add('Safeway')).toBeVisible();
    await add('Safeway').click();
    await expect(remove('Safeway')).toBeVisible();
    await add('Ralphs').click();
    await expect(remove('Ralphs')).toBeVisible();
    await expect.poll(() => favoriteRows(user.userId)).toEqual([
      { store_key: 'e2e-gps-safeway', name: 'Safeway', source: 'osm', kroger_location_id: null },
      { store_key: 'e2e-k1', name: 'Ralphs', source: 'kroger', kroger_location_id: 'e2e-k1' },
    ]);

    await page.reload();
    await expect(remove('Safeway')).toBeVisible();
    await expect(remove('Ralphs')).toBeVisible();

    await remove('Safeway').click();
    await expect(add('Safeway')).toBeVisible();
    await expect.poll(async () => (await favoriteRows(user.userId)).map((r) => r.store_key)).toEqual(['e2e-k1']);
    await page.reload();
    await expect(remove('Ralphs')).toBeVisible();
    await expect(add('Safeway')).toBeVisible();
  });
});

test.describe('without location: the ZIP fallback', () => {
  test('a ZIP outside the home area is found in the bundled table and saved; coordinates stay empty', async ({ page }) => {
    const user = await newUser('stores-zip');
    const krogerBodies = await stubKroger(page, 503, { error: 'Live Kroger prices are not set up yet.', configured: false });
    await recordOpenedLinks(page);
    await signIn(page, user.email);

    await page.goto('/stores');
    await expect(page.getByText('Find stores near you')).toBeVisible();
    const zipBox = page.getByRole('textbox', { name: 'ZIP code' });

    await zipBox.fill('12');
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await expect(page.getByText('Enter a valid 5-digit US ZIP code.')).toBeVisible();

    const table = page.waitForResponse((res) => res.url().endsWith('/zcta-centroids.json') && res.ok());
    await zipBox.fill(ZIP.zip);
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await table;
    await expect(page.getByTestId('stores-origin')).toHaveText(`Near ${ZIP.zip}`);
    // Set: the full panel folds into the one-line row.
    await expect(page.getByTestId('stores-location-row')).toBeVisible();
    await expect(zipBox).toHaveCount(0);
    await expect.poll(() => profileLocation(user.userId)).toEqual({ home_zip: ZIP.zip, home_lat: null, home_lng: null });

    // Kroger not set up on the server (503): the list shows without it.
    await expect.poll(() => cardIds(page)).toEqual(['e2e-zip-go']);
    await expect(page.getByTestId('store-e2e-zip-go')).toContainText('Grocery Outlet');
    await page.getByRole('link', { name: 'Weekly ad: Grocery Outlet' }).click();
    await expect.poll(() => opened(page)).toEqual([GROCERY_OUTLET_PAGE]);
    await expect(page.getByRole('button', { name: 'More local markets (1)' })).toBeVisible();

    expect(krogerBodies.at(-1)).toEqual({ action: 'locations', lat: 42.69, lng: -100.62, zip: ZIP.zip, radiusMiles: 10 });

    // The choice is kept on the server: a reload searches from the same ZIP.
    await page.reload();
    await expect(page.getByTestId('stores-origin')).toHaveText(`Near ${ZIP.zip}`);
    await expect.poll(() => cardIds(page)).toEqual(['e2e-zip-go']);
  });
});
