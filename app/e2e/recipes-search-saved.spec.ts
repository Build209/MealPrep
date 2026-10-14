import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * Recipe search, saved recipes and creator videos end to end, against the local Supabase stack.
 * Seeds (service role, local only) a master recipe, an own recipe, a published library recipe, an
 * enabled creator and one of its videos, all named with a word unique to this run. Then: search
 * finds them by title and by ingredient, videos open outside the app, save and unsave persist across
 * a reload, the saved list shows them, and a row saved the old app's way still links.
 * Serial: later tests use the account and rows the first one creates.
 */
test.describe.configure({ mode: 'serial' });

const email = freshEmail('recipes');
const password = 'e2e-Recipes-123';

function word(): string {
  let out = 'zq';
  for (let i = 0; i < 8; i++) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out;
}
/** In titles. */
const tok = word();
/** Only in an ingredient name. */
const ingredientTok = word();

const stewTitle = `E2E ${tok} Stew`;
const chiliTitle = `E2E ${tok} Chili`;
const saladTitle = `E2E ${tok} Salad`;
const videoTitle = `${tok} stew recipe`;
const videoId = `e2e${tok}`;
const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
const stewSlug = `e2e-${tok}-stew`;
const chiliSlug = `e2e-${tok}-chili`;
const saladSlug = `e2e-${tok}-salad`;

const seeded = { userId: '', stewId: '', chiliId: '', saladId: '' };

const emailBox = (page: Page) => page.getByRole('textbox', { name: 'Email' });
const passwordBox = (page: Page) => page.getByLabel('Password', { exact: true });
const searchBox = (page: Page) => page.getByRole('textbox', { name: 'Search recipes' });
const resultLink = (page: Page, title: string) => page.getByRole('link', { name: new RegExp(`^${title}\\b`) });
const saveButton = (page: Page, title: string) => page.getByRole('button', { name: `Save ${title}`, exact: true });
const removeButton = (page: Page, title: string) => page.getByRole('button', { name: `Remove ${title} from saved`, exact: true });

async function expectHome(page: Page) {
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
}

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectHome(page);
}

/** The signed-in user's id, from the session the app saved in the browser. */
async function appUserId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) return localStorage.getItem(key);
    }
    return null;
  });
  expect(raw, 'the app saved a session in the browser').toBeTruthy();
  const parsed = JSON.parse(raw as string);
  const session = parsed.currentSession ?? parsed;
  expect(typeof session.user?.id).toBe('string');
  return session.user.id as string;
}

/** Records addresses the app opens outside itself (window.open) instead of opening them. */
async function catchOpenedLinks(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[]; open: (url?: string | URL) => null };
    w.__opened = [];
    w.open = (url?: string | URL) => {
      w.__opened.push(String(url));
      return null;
    };
  });
}

const openedLinks = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened ?? []);

async function savedRows(userId: string) {
  const { data, error } = await adminClient()
    .from('user_saved_recipes')
    .select('ref_key, source_type, kitchen_recipe_id, creator_video_id, creator_watch_url, title, preview')
    .eq('user_id', userId);
  expect(error).toBeNull();
  // Sorted here (plain code point order) to match the .sort() in the expectations.
  return (data ?? []).sort((a, b) => (a.ref_key < b.ref_key ? -1 : a.ref_key > b.ref_key ? 1 : 0));
}

async function insertOne(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminClient().from(table).insert(row).select('id').single();
  expect(error, `seed ${table}`).toBeNull();
  return (data as { id: string }).id;
}

test('sign up, then seed recipes, a creator and a video', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await emailBox(page).fill(email);
  await passwordBox(page).fill(password);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectHome(page);
  seeded.userId = await appUserId(page);

  seeded.stewId = await insertOne('recipes', {
    name: stewTitle,
    slug: stewSlug,
    tag: 'Dinner',
    minutes: 40,
    is_master: true,
    ingredients: [{ ingredientId: 'beans', name: `${ingredientTok} beans`, quantity: 2, unit: 'cup' }],
  });
  seeded.chiliId = await insertOne('recipes', {
    name: chiliTitle,
    slug: chiliSlug,
    is_master: false,
    created_by: seeded.userId,
    ingredients: [],
  });
  seeded.saladId = await insertOne('library_recipes', {
    slug: saladSlug,
    title: saladTitle,
    dish_name: saladTitle,
    status: 'published',
    ingredients: [{ name: 'Lettuce', quantity: 1, unit: 'head' }],
  });
  // Someone else's recipe: never shown to this account.
  const { error: otherError } = await adminClient().from('recipes').insert({ name: `E2E ${tok} Secret`, is_master: false, created_by: null });
  expect(otherError).toBeNull();
  // A draft library recipe: not published, never shown.
  const { error: draftError } = await adminClient()
    .from('library_recipes')
    .insert({ slug: `e2e-${tok}-draft`, title: `E2E ${tok} Draft`, dish_name: 'Draft', status: 'draft' });
  expect(draftError).toBeNull();

  const channelId = `UC-e2e-${tok}`;
  const { error: creatorError } = await adminClient()
    .from('recipe_creators')
    .insert({ youtube_channel_id: channelId, display_name: 'E2E Chef', channel_url: 'https://www.youtube.com/@e2echef', enabled: true });
  expect(creatorError).toBeNull();
  const { error: videoError } = await adminClient().from('creator_videos').insert({
    video_id: videoId,
    channel_id: channelId,
    title: videoTitle,
    description_snippet: 'Ingredients: 2 cups beans',
    thumbnail_url: 'http://127.0.0.1:4173/e2e-missing-thumb.png',
    url: watchUrl,
    published_at: new Date().toISOString(),
  });
  expect(videoError).toBeNull();
});

test('search finds recipes by title and ingredient, and creator videos that open outside the app', async ({ page }) => {
  await catchOpenedLinks(page);
  await signIn(page);
  await page.goto('/recipes/search');
  await expect(page.getByText('Type at least 2 letters', { exact: false })).toBeVisible();

  await searchBox(page).fill(tok);
  await expect(resultLink(page, stewTitle)).toBeVisible();
  await expect(resultLink(page, chiliTitle)).toBeVisible();
  await expect(resultLink(page, saladTitle)).toBeVisible();
  await expect(resultLink(page, chiliTitle)).toHaveAccessibleName(/Your recipe/);
  const videoLink = page.getByRole('link', { name: `${videoTitle}, by E2E Chef. Watch on YouTube` });
  await expect(videoLink).toBeVisible();
  await expect(page.getByText(`E2E Chef · Watch on YouTube`)).toBeVisible();
  // Not shown: someone else's recipe and a draft.
  await expect(page.getByText(`E2E ${tok} Secret`)).toHaveCount(0);
  await expect(page.getByText(`E2E ${tok} Draft`)).toHaveCount(0);
  // Own recipe first.
  await expect(page.getByRole('link').filter({ hasText: tok }).first()).toHaveAccessibleName(new RegExp(`^${chiliTitle}`));

  await videoLink.click();
  await expect.poll(() => openedLinks(page)).toContain(watchUrl);

  // By ingredient only.
  await searchBox(page).fill(ingredientTok);
  await expect(resultLink(page, stewTitle)).toHaveAccessibleName(new RegExp(`Uses ${ingredientTok} beans`));
  await expect(resultLink(page, chiliTitle)).toHaveCount(0);

  // Nothing.
  await searchBox(page).fill(`${tok}nothing`);
  await expect(page.getByText(`Nothing matches "${tok}nothing".`)).toBeVisible();

  // A recipe opens its page.
  await searchBox(page).fill(tok);
  await resultLink(page, stewTitle).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/r_${seeded.stewId}$`));
});

test('the creator videos page shows the video', async ({ page }) => {
  await catchOpenedLinks(page);
  await signIn(page);
  await page.goto('/creators');
  const card = page.getByRole('link', { name: `${videoTitle}, by E2E Chef. Watch on YouTube` });
  await expect(card).toBeVisible();
  await card.click();
  await expect.poll(() => openedLinks(page)).toContain(watchUrl);
});

test('save and unsave persist across reloads, and the saved list shows them', async ({ page }) => {
  await catchOpenedLinks(page);
  await signIn(page);
  const userId = seeded.userId;

  await page.goto(`/recipes/search?q=${tok}`);
  await expect(resultLink(page, stewTitle)).toBeVisible();
  await saveButton(page, stewTitle).click();
  await expect(removeButton(page, stewTitle)).toBeVisible();
  await saveButton(page, saladTitle).click();
  await expect(removeButton(page, saladTitle)).toBeVisible();
  await saveButton(page, videoTitle).click();
  await expect(removeButton(page, videoTitle)).toBeVisible();

  await expect.poll(async () => (await savedRows(userId)).map((r) => r.ref_key)).toEqual(
    [`creator:${videoId}`, `kitchen:${stewSlug}`, `kitchen:library-${saladSlug}`].sort(),
  );
  const rows = await savedRows(userId);
  const stew = rows.find((r) => r.ref_key === `kitchen:${stewSlug}`)!;
  expect(stew.source_type).toBe('kitchen');
  expect(stew.kitchen_recipe_id).toBe(seeded.stewId);
  expect((stew.preview as { appRoute?: string }).appRoute).toBe(`r_${seeded.stewId}`);
  const video = rows.find((r) => r.ref_key === `creator:${videoId}`)!;
  expect(video.source_type).toBe('creator_video');
  expect(video.creator_watch_url).toBe(watchUrl);
  expect(rows.find((r) => r.ref_key === `kitchen:library-${saladSlug}`)!.kitchen_recipe_id).toBeNull();

  // Still saved after a reload.
  await page.reload();
  await expect(removeButton(page, stewTitle)).toBeVisible();
  await expect(removeButton(page, videoTitle)).toBeVisible();
  await expect(saveButton(page, chiliTitle)).toBeVisible();

  // The saved list.
  await page.goto('/recipes/saved');
  await expect(page.getByText('3 saved')).toBeVisible();
  await expect(page.getByRole('link', { name: `${stewTitle}. Recipe` })).toBeVisible();
  await expect(page.getByRole('link', { name: `${videoTitle}. Watch on YouTube` })).toBeVisible();
  await page.getByRole('link', { name: `${videoTitle}. Watch on YouTube` }).click();
  await expect.poll(() => openedLinks(page)).toContain(watchUrl);
  await page.getByRole('link', { name: `${saladTitle}. Recipe` }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/l_${seeded.saladId}$`));

  // Unsave from the saved list.
  await page.goto('/recipes/saved');
  await removeButton(page, stewTitle).click();
  await expect(page.getByRole('link', { name: `${stewTitle}. Recipe` })).toHaveCount(0);
  await expect.poll(async () => (await savedRows(userId)).map((r) => r.ref_key)).toEqual(
    [`creator:${videoId}`, `kitchen:library-${saladSlug}`].sort(),
  );

  // Unsave from search.
  await page.goto(`/recipes/search?q=${tok}`);
  await removeButton(page, videoTitle).click();
  await expect(saveButton(page, videoTitle)).toBeVisible();
  await expect.poll(async () => (await savedRows(userId)).map((r) => r.ref_key)).toEqual([`kitchen:library-${saladSlug}`]);

  // Gone after a reload too.
  await page.goto('/recipes/saved');
  await expect(page.getByText('1 saved')).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 saved')).toBeVisible();
  await expect(page.getByRole('link', { name: `${saladTitle}. Recipe` })).toBeVisible();
  await expect(page.getByRole('link', { name: `${stewTitle}. Recipe` })).toHaveCount(0);
});

test('a row saved the old app way (slug key, no uuid) still links and shows as saved', async ({ page }) => {
  await signIn(page);
  const { error } = await adminClient().from('user_saved_recipes').insert({
    user_id: seeded.userId,
    ref_key: `kitchen:${chiliSlug}`,
    source_type: 'kitchen',
    title: chiliTitle,
    preview: {},
  });
  expect(error).toBeNull();

  await page.goto('/recipes/saved');
  await expect(page.getByText('2 saved')).toBeVisible();
  await page.getByRole('link', { name: `${chiliTitle}. Recipe` }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/r_${seeded.chiliId}$`));

  await page.goto(`/recipes/search?q=${tok}`);
  await expect(removeButton(page, chiliTitle)).toBeVisible();
  await removeButton(page, chiliTitle).click();
  await expect(saveButton(page, chiliTitle)).toBeVisible();
  await expect.poll(async () => (await savedRows(seeded.userId)).map((r) => r.ref_key)).toEqual([`kitchen:library-${saladSlug}`]);
});
