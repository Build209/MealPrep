import { expect, test, type Page, type Route } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Photo and receipt scanning, end to end against the local stack. The local stack runs no edge
 * functions (and the live pantry-vision must never be called from a test), so the request to
 * /functions/v1/pantry-vision is intercepted and answered here in the function's real shape.
 * Everything else (sign-in, the allowance read, the pantry insert) is the real local server.
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

test('allowance on the button, shelf scan, review edits, save writes the rows', async ({ page }) => {
  const { userId, accessToken } = await newSignedInUser(page, 'scanner');

  // One scan already used this month: a free account has 2 of 3 left.
  const seeded = await adminClient().from('photo_scan_usage').insert({ user_id: userId, period: period(), scans: 1 });
  expect(seeded.error).toBeNull();
  await page.reload();
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

test('allowance used up: a receipt scan shows the plain message and saves nothing', async ({ page }) => {
  const { userId } = await newSignedInUser(page, 'usedup');
  const seeded = await adminClient().from('photo_scan_usage').insert({ user_id: userId, period: period(), scans: 3 });
  expect(seeded.error).toBeNull();
  await page.reload();
  const scanButton = page.getByRole('button', { name: 'Scan · none left this month' });
  await expect(scanButton).toBeVisible();

  const captured = await stubPantryVision(page, 403, {
    error: 'You have used your 3 free scans for this month. They reset on the 1st. A paid plan includes more.',
    code: 'PLAN_REQUIRED',
    usage: { remaining: 0, limit: 3, isPlus: false, tier: 'free' },
  });

  await scanButton.click();
  await expect(page).toHaveURL(/\/scan$/);
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
