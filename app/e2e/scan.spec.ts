import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Photo and receipt scanning, end to end against the local stack. The local stack runs no edge
 * functions (and the live pantry-vision must never be called from a test), so the request to
 * /functions/v1/pantry-vision is intercepted and answered here in the function's real shape.
 * Everything else (sign-in, the allowance read, the pantry reads and writes) is the real local server.
 * The Scan button lives on the Pantry tab. "See plans" opens the live app in a new tab; that page
 * is answered here too, so no test ever loads the live site.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Scan-Password-123';
const FUNCTION = '**/functions/v1/pantry-vision';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** A 64x64 checkerboard BMP: decodable by the browser and not "blank" to the photo check. */
function checkerboardBmp(size = 64): Buffer {
  const rowBytes = size * 3; // 64*3 is a multiple of 4: no row padding
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
      buf[at] = on ? 30 : 230; // B
      buf[at + 1] = on ? 60 : 200; // G
      buf[at + 2] = on ? 200 : 40; // R
    }
  }
  return buf;
}

async function newSignedInUser(page: Page, label: string): Promise<{ userId: string; accessToken: string }> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Signed in as')).toBeVisible();
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

/** Answers pantry-vision (and its CORS preflight) with `status` and `json`; records each POST. */
async function stubPantryVision(page: Page, status: number, json: Record<string, unknown>): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(FUNCTION, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    captured.push({ headers: await request.allHeaders(), body: request.postDataJSON() as Record<string, unknown> });
    await route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  });
  return captured;
}

async function choosePhoto(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a photo' }).first().click();
  await (await chooser).setFiles({ name: 'shelf.bmp', mimeType: 'image/bmp', buffer: checkerboardBmp() });
}

const period = () => new Date().toISOString().slice(0, 7);

type SeedRow = { ingredient_id: string; name: string; category: string; quantity: number; unit: string; location: string };

/** Puts rows straight into the person's pantry (service role: test setup only). */
async function seedPantry(userId: string, rows: SeedRow[]) {
  const { error } = await adminClient()
    .from('pantry_items')
    .insert(rows.map((row) => ({ ...row, user_id: userId })));
  expect(error).toBeNull();
}

async function serverPantry(userId: string) {
  const { data, error } = await adminClient()
    .from('pantry_items')
    .select('id, ingredient_id, name, quantity, unit, location')
    .eq('user_id', userId)
    .order('name');
  expect(error).toBeNull();
  return (data ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

function visionAnswer(items: Array<Record<string, unknown>>, kind: 'pantry' | 'receipt') {
  return {
    items,
    model: 'gemini-3.8-flash',
    usage: { isPlus: false, tier: 'free', limit: 3, remaining: 2 },
    scanLocation: 'pantry',
    kind,
    cached: false,
    itemCount: items.length,
  };
}

test('allowance on the button, shelf scan, review edits, save writes the rows', async ({ page }) => {
  const { userId, accessToken } = await newSignedInUser(page, 'scanner');

  // One scan already used this month: a free account has 2 of 3 left.
  const seeded = await adminClient().from('photo_scan_usage').insert({ user_id: userId, period: period(), scans: 1 });
  expect(seeded.error).toBeNull();
  await expect(page.getByText('Scan your food')).toHaveCount(0); // the temporary Home card is gone
  await page.goto('/pantry');
  await expect(page.getByText('Your pantry is empty')).toBeVisible();
  const scanButton = page.getByRole('button', { name: 'Scan · 2 left this month' });
  await expect(scanButton).toBeVisible();

  const captured = await stubPantryVision(page, 200, {
    items: [
      { name: 'cheddar cheese', quantity: 1, unit: 'block', category: 'dairy', storage: 'fridge', confidence: 0.92 },
      { name: 'eggs', quantity: 12, unit: 'each', category: 'dairy', storage: 'fridge', confidence: 0.88 },
      { name: 'whole milk', quantity: 1, unit: 'gallon', category: 'dairy', storage: 'fridge', confidence: 0.5 },
    ],
    model: 'gemini-3.8-flash',
    usage: { isPlus: false, tier: 'free', limit: 3, remaining: 1 },
    scanLocation: 'fridge',
    kind: 'pantry',
    cached: false,
    itemCount: 3,
  });

  await scanButton.click();
  await expect(page).toHaveURL(/\/scan$/);
  await expect(page.getByText('2 of 3 scans left this month', { exact: false })).toBeVisible();
  await page.getByRole('radio', { name: 'Fridge', exact: true }).click();
  await choosePhoto(page);

  await expect(page.getByText('Check what we found (3)')).toBeVisible();
  expect(captured).toHaveLength(1);
  const sent = captured[0]!;
  expect(sent.headers['authorization']).toBe(`Bearer ${accessToken}`);
  expect(sent.headers['content-type']).toContain('application/json');
  expect(sent.body).toMatchObject({ mimeType: 'image/jpeg', location: 'fridge' });
  expect(sent.body.action).toBeUndefined();
  expect(String(sent.body.imageHash)).toMatch(/^[0-9a-f]{64}$/);
  expect(String(sent.body.imageBase64).length).toBeGreaterThan(100);
  await expect(page.getByText('Check this')).toHaveCount(1); // whole milk, low confidence

  // Edit: rename item 1 and move it to the pantry, change item 2's quantity, remove item 3.
  await page.getByRole('textbox', { name: 'Name, item 1' }).fill('Sharp cheddar');
  await page.getByRole('radio', { name: 'Pantry, item 1' }).click();
  await page.getByRole('textbox', { name: 'Quantity, item 2' }).fill('10');
  await page.getByRole('textbox', { name: 'Unit, item 2' }).fill('egg');
  await page.getByRole('button', { name: 'Remove item 3' }).click();
  await expect(page.getByText('Check what we found (2)')).toBeVisible();

  await page.getByRole('button', { name: 'Save 2 items to pantry' }).click();
  await expect(page.getByText('Saved 2 items to your pantry.')).toBeVisible();

  const rows = await adminClient()
    .from('pantry_items')
    .select('user_id, ingredient_id, name, category, quantity, unit, location')
    .eq('user_id', userId)
    .order('name');
  expect(rows.error).toBeNull();
  expect(rows.data!.map((r) => ({ ...r, quantity: Number(r.quantity) }))).toEqual([
    { user_id: userId, ingredient_id: 'eggs', name: 'Eggs', category: 'dairy', quantity: 10, unit: 'egg', location: 'fridge' },
    { user_id: userId, ingredient_id: 'sharp-cheddar', name: 'Sharp Cheddar', category: 'dairy', quantity: 1, unit: 'block', location: 'pantry' },
  ]);
});

test('no scans left: the button says so, a sheet explains the allowance, See plans opens the live app', async ({ page, context }) => {
  const { userId } = await newSignedInUser(page, 'usedup');
  const seeded = await adminClient().from('photo_scan_usage').insert({ user_id: userId, period: period(), scans: 3 });
  expect(seeded.error).toBeNull();
  // The live app's page is answered here: a test never loads the live site.
  const livePages: string[] = [];
  await context.route('https://mealplanatic.app/**', async (route) => {
    livePages.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' });
  });
  const captured = await stubPantryVision(page, 500, { error: 'must not be called' });

  await page.goto('/pantry');
  const scanButton = page.getByRole('button', { name: 'No scans left this month' });
  await expect(scanButton).toBeVisible();
  await scanButton.click();
  await expect(page.getByText('Your plan includes 3 photo scans a month.', { exact: false })).toBeVisible();
  await expect(page.getByText('Your scans start again on the 1st.', { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/pantry$/); // the sheet, not the scan screen

  const opened = context.waitForEvent('page');
  await page.getByRole('link', { name: 'See plans' }).click();
  const plans = await opened;
  await plans.waitForLoadState();
  expect(plans.url()).toBe('https://mealplanatic.app/');
  expect(livePages).toEqual(['https://mealplanatic.app/']);
  await plans.close();
  await expect(page).toHaveURL(/\/pantry$/); // the app stays where it was

  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(page.getByText('Your plan includes 3 photo scans a month.', { exact: false })).toHaveCount(0);
  expect(captured).toHaveLength(0);
});

test('allowance used up: the refusal from the server on a receipt scan shows the plain message and saves nothing', async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'refused');
  const seeded = await adminClient().from('photo_scan_usage').insert({ user_id: userId, period: period(), scans: 3 });
  expect(seeded.error).toBeNull();

  const captured = await stubPantryVision(page, 403, {
    error: 'You have used your 3 free scans for this month. They reset on the 1st. A paid plan includes more.',
    code: 'PLAN_REQUIRED',
    usage: { remaining: 0, limit: 3, isPlus: false, tier: 'free' },
  });

  // The scan screen is still reachable by its address; the server stays the judge.
  await page.goto('/scan');
  await page.getByRole('radio', { name: 'Receipt', exact: true }).click();
  await choosePhoto(page);

  await expect(page.getByRole('alert').filter({ hasText: 'You have used your 3 free scans for this month' })).toBeVisible();
  expect(captured).toHaveLength(1);
  expect(captured[0]!.body.action).toBe('receipt');
  await expect(page.getByText(/Check what we found/)).toHaveCount(0);

  const rows = await adminClient().from('pantry_items').select('id').eq('user_id', userId);
  expect(rows.error).toBeNull();
  expect(rows.data).toEqual([]);
});

test('shelf scan: an item already in the pantry is shown as already there and not duplicated', async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'shelfdupe');
  await seedPantry(userId, [{ ingredient_id: 'eggs', name: 'Eggs', category: 'dairy', quantity: 6, unit: 'each', location: 'fridge' }]);
  const [eggs] = await serverPantry(userId);

  await stubPantryVision(
    page,
    200,
    visionAnswer(
      [
        { name: 'eggs', quantity: 12, unit: 'each', category: 'dairy', storage: 'fridge', confidence: 0.9 },
        { name: 'butter', quantity: 1, unit: 'pack', category: 'dairy', storage: 'fridge', confidence: 0.9 },
      ],
      'pantry',
    ),
  );

  await page.goto('/pantry');
  await expect(page.getByText('1 item', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Scan · 3 left this month' }).click();
  await expect(page).toHaveURL(/\/scan$/);
  await page.getByRole('radio', { name: 'Fridge', exact: true }).click();
  await choosePhoto(page);

  await expect(page.getByText('Check what we found (2)')).toBeVisible();
  await expect(page.getByText('Already in your pantry', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Add item 1 to pantry' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Add item 2 to pantry' })).toBeChecked();
  await page.getByRole('button', { name: 'Save 1 item to pantry' }).click();
  await expect(page.getByText('Saved 1 item to your pantry.')).toBeVisible();

  expect(await serverPantry(userId)).toEqual([
    { id: expect.any(String), ingredient_id: 'butter', name: 'Butter', quantity: 1, unit: 'pack', location: 'fridge' },
    { ...eggs, quantity: 6 }, // untouched: the same row, the same quantity, no second Eggs row
  ]);

  // Back on the Pantry tab, the list is what the server has: two items.
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/pantry$/);
  await expect(page.getByText('2 items', { exact: true })).toBeVisible();
});

test('receipt scan: a bought item adds to the matching pantry row instead of making a second row', async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'receipttopup');
  await seedPantry(userId, [
    { ingredient_id: 'black-beans', name: 'Black Beans', category: 'dry_goods', quantity: 2, unit: 'can', location: 'pantry' },
  ]);
  const [beans] = await serverPantry(userId);

  const captured = await stubPantryVision(
    page,
    200,
    visionAnswer(
      [
        { name: 'black beans', quantity: 3, unit: 'can', category: 'dry_goods', storage: 'pantry', confidence: 0.9 },
        { name: 'bananas', quantity: 6, unit: 'each', category: 'produce', storage: 'pantry', confidence: 0.9 },
      ],
      'receipt',
    ),
  );

  await page.goto('/pantry');
  await expect(page.getByText('1 item', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Scan · 3 left this month' }).click();
  await expect(page).toHaveURL(/\/scan$/);
  await page.getByRole('radio', { name: 'Receipt', exact: true }).click();
  await choosePhoto(page);

  await expect(page.getByText('Check what we found (2)')).toBeVisible();
  expect(captured[0]!.body.action).toBe('receipt');
  await expect(page.getByText('Adds to what you have', { exact: true })).toHaveCount(1);
  await expect(page.getByText('making 5 can', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Save 2 items to pantry' }).click();
  await expect(page.getByText('Saved 1 item to your pantry and added to 1 item you already had.')).toBeVisible();

  const rows = await serverPantry(userId);
  expect(rows).toHaveLength(2);
  expect(rows).toContainEqual({ ...beans, quantity: 5 }); // the same row id, 2 + 3
  expect(rows).toContainEqual({
    id: expect.any(String),
    ingredient_id: 'bananas',
    name: 'Bananas',
    quantity: 6,
    unit: 'each',
    location: 'pantry',
  });
});
