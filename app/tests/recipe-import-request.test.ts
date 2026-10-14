/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImporter } from '../src/recipes/import/api';
import {
  buildImportBody,
  buildImportRequest,
  importErrorFromResponse,
  ImportError,
  IMPORT_MESSAGES,
  parseImportResponse,
  recipeImportUrl,
  requestFromInput,
} from '../src/recipes/import/request';
import { initialImportText } from '../src/recipes/import/shareParams';
import { classifyImportUrl, parseImportInput, safeHttpUrl } from '../src/recipes/import/urlInput';

test('function address: <supabase url>/functions/v1/recipe-import', () => {
  assert.equal(recipeImportUrl('https://abc.supabase.co/'), 'https://abc.supabase.co/functions/v1/recipe-import');
  assert.equal(recipeImportUrl(''), '');
});

test('import box: link, link with caption, recipe text, or nothing usable (old parseImportInput)', () => {
  assert.deepEqual(parseImportInput('https://www.example.com/pasta#jump'), { kind: 'url', url: 'https://www.example.com/pasta' });
  assert.deepEqual(parseImportInput('example.com/soup'), { kind: 'url', url: 'https://example.com/soup' });
  assert.deepEqual(parseImportInput('Great dip! https://www.instagram.com/p/abc/ 2 cups yogurt'), {
    kind: 'url',
    url: 'https://www.instagram.com/p/abc/',
    caption: 'Great dip! 2 cups yogurt',
  });
  const text = 'Pancakes\n1 cup flour\n1 egg\nMix and fry.';
  assert.deepEqual(parseImportInput(text), { kind: 'text', text });
  assert.equal(parseImportInput('   '), null);
  assert.equal(parseImportInput('two words'), null);
});

test('link kinds follow the function', () => {
  assert.equal(classifyImportUrl('https://youtu.be/abc'), 'youtube');
  assert.equal(classifyImportUrl('https://www.tiktok.com/@a/video/1'), 'tiktok');
  assert.equal(classifyImportUrl('https://old.reddit.com/r/x'), 'reddit');
  assert.equal(classifyImportUrl('https://cooking.example.org/r/1'), 'web');
});

test('bodies, field for field as the old app sends them', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(buildImportBody(requestFromInput('https://example.com/pasta')!))), {
    action: 'link',
    url: 'https://example.com/pasta',
  });
  assert.deepEqual(buildImportBody({ mode: 'link', url: 'https://www.instagram.com/p/x/', caption: ' 2 cups yogurt ' }), {
    action: 'link',
    url: 'https://www.instagram.com/p/x/',
    captionText: '2 cups yogurt',
  });
  assert.deepEqual(buildImportBody({ mode: 'text', text: '  Pancakes 1 cup flour 1 egg mix  ' }), {
    action: 'text',
    text: 'Pancakes 1 cup flour 1 egg mix',
    private_import: false,
  });
  assert.deepEqual(buildImportBody({ mode: 'photo', photoStoragePaths: ['u/photo-1-0.jpg'] }), {
    action: 'photo',
    photoStoragePaths: ['u/photo-1-0.jpg'],
    private_import: false,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(buildImportBody({ mode: 'screenshot', photoStoragePaths: ['u/p.jpg'] }))), {
    action: 'screenshot',
    photoStoragePaths: ['u/p.jpg'],
  });
  assert.deepEqual(buildImportBody({ mode: 'video', videoStoragePath: 'u/video-1.mp4' }), { action: 'video', videoStoragePath: 'u/video-1.mp4' });
  assert.deepEqual(buildImportBody({ mode: 'confirm_youtube', youtubeUrl: 'https://www.youtube.com/watch?v=1' }), {
    action: 'confirm_youtube',
    youtubeUrl: 'https://www.youtube.com/watch?v=1',
  });
});

test('request: POST JSON with the user token and the anon key', () => {
  const req = buildImportRequest({ mode: 'link', url: 'https://example.com/a' }, 'user-token', 'anon-key');
  assert.equal(req.method, 'POST');
  assert.deepEqual(req.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer user-token', apikey: 'anon-key' });
  assert.deepEqual(JSON.parse(req.body), { action: 'link', url: 'https://example.com/a' });
});

const answer = {
  recipe: {
    title: '  Weeknight garlic pasta ',
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 15.4,
    ingredients: [
      { name: 'spaghetti', quantity: 12, unit: 'oz' },
      { name: 'garlic', quantity: 4, unit: '', note: 'thinly sliced' },
      { name: '', quantity: 1, unit: 'cup' },
      'junk',
    ],
    steps: ['Boil pasta.', '  ', 'Toss with garlic oil.'],
    is_recipe: true,
    confidence: 0.9,
    source_url: 'https://example.com/pasta',
    source_type: 'web',
    social_author_name: 'Jane Cook',
    social_author_url: 'https://example.com/jane',
    image_url: 'https://example.com/pasta.jpg',
  },
  cached: false,
  usage: { remaining: 1, limit: 2, isPlus: false, tier: 'free' },
};

test('answer: recipe checked field by field, plus usage', () => {
  const result = parseImportResponse(answer);
  assert.equal(result.cached, false);
  assert.deepEqual(result.usage, { tier: 'free', limit: 2, remaining: 1 });
  const r = result.recipe;
  assert.equal(r.title, 'Weeknight garlic pasta');
  assert.equal(r.cookMinutes, 15);
  assert.deepEqual(r.ingredients, [
    { name: 'spaghetti', quantity: 12, unit: 'oz' },
    { name: 'garlic', quantity: 4, unit: 'each', note: 'thinly sliced' },
  ]);
  assert.deepEqual(r.steps, ['Boil pasta.', 'Toss with garlic oil.']);
  assert.equal(r.sourceType, 'web');
  assert.equal(r.socialAuthorName, 'Jane Cook');
  assert.equal(r.youtubeChannelName, null);
});

test('answer without a recipe title is refused', () => {
  assert.throws(() => parseImportResponse({ recipe: { title: ' ' } }), (e: unknown) => e instanceof ImportError && e.kind === 'unexpected');
  assert.throws(() => parseImportResponse({}), ImportError);
});

test('errors: plain words for each refusal', () => {
  const usedUp = importErrorFromResponse(
    429,
    JSON.stringify({
      error: 'You have used your 2 free recipe imports for this month. They reset on the 1st. A paid plan includes more.',
      code: 'IMPORT_LIMIT_REACHED',
      usage: { remaining: 0, limit: 2, isPlus: false, tier: 'free' },
    }),
  );
  assert.equal(usedUp.kind, 'used-up');
  assert.match(usedUp.message, /used your 2 free recipe imports/);
  assert.deepEqual(usedUp.usage, { tier: 'free', limit: 2, remaining: 0 });

  assert.equal(importErrorFromResponse(429, JSON.stringify({ error: 'x', code: 'RATE_LIMIT' })).message, IMPORT_MESSAGES.rateLimit);
  assert.equal(importErrorFromResponse(429, 'not json').kind, 'rate-limit');
  assert.equal(importErrorFromResponse(400, JSON.stringify({ error: 'Unsupported URL', code: 'BAD_REQUEST' })).message, IMPORT_MESSAGES.unsupported);
  assert.equal(importErrorFromResponse(422, JSON.stringify({ error: 'x', code: 'REDDIT_CLIENT_ONLY' })).message, IMPORT_MESSAGES.reddit);
  assert.equal(importErrorFromResponse(400, JSON.stringify({ error: 'Paste a longer recipe or caption to import.', code: 'BAD_REQUEST' })).message, IMPORT_MESSAGES.tooShort);
  assert.equal(importErrorFromResponse(503, JSON.stringify({ error: 'x', code: 'NOT_CONFIGURED' })).kind, 'unavailable');
  assert.equal(importErrorFromResponse(401, JSON.stringify({ error: 'Sign in required', code: 'UNAUTHENTICATED' })).kind, 'signed-out');
  assert.equal(importErrorFromResponse(502, JSON.stringify({ error: 'x', code: 'UPSTREAM_ERROR' })).message, IMPORT_MESSAGES.busy);
  assert.equal(importErrorFromResponse(500, '').kind, 'unexpected');

  const notRecipe = importErrorFromResponse(
    422,
    JSON.stringify({
      error: 'We could not find a recipe on that page.',
      code: 'NOT_RECIPE',
      fallbacks: {
        steps: ['youtube_confirm', 'video_upload', 'screenshot', 'nonsense'],
        youtubeSuggestion: { watchUrl: 'https://www.youtube.com/watch?v=1', videoId: '1', channelTitle: 'Chef', title: 'Pasta' },
        message: 'x',
      },
    }),
  );
  assert.equal(notRecipe.kind, 'not-recipe');
  assert.deepEqual(notRecipe.fallbacks, {
    steps: ['youtube_confirm', 'video_upload', 'screenshot'],
    youtubeSuggestion: { watchUrl: 'https://www.youtube.com/watch?v=1', channelTitle: 'Chef', title: 'Pasta' },
  });
  assert.equal(importErrorFromResponse(422, JSON.stringify({ error: 'x', code: 'FALLBACK_REQUIRED', fallbacks: { steps: ['paste_caption'] } })).kind, 'needs-caption');
});

type Init = { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal };
const ok = (json: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(json) });

test('importer: sends once, shares a running request, refuses without a token', async () => {
  const calls: Array<{ url: string; init: Init }> = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const importer = createImporter({
    url: 'https://x.supabase.co/functions/v1/recipe-import',
    anonKey: 'anon',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      await gate;
      return ok(answer);
    },
  });
  const a = importer({ mode: 'link', url: 'https://example.com/pasta' }, 'tok');
  const b = importer({ mode: 'link', url: 'https://example.com/pasta' }, 'tok');
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(calls.length, 1, 'a double tap is one request');
  assert.equal(ra.recipe.title, 'Weeknight garlic pasta');
  assert.equal(rb, ra);
  assert.equal(calls[0]!.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(importer({ mode: 'link', url: 'https://example.com/pasta' }, null), (e: unknown) => e instanceof ImportError && e.kind === 'signed-out');
});

test('importer: timeout and network failures become plain messages', async () => {
  const slow = createImporter({ url: 'https://x/fn', anonKey: 'a', timeoutMs: 20, fetchImpl: () => new Promise(() => {}) });
  await assert.rejects(slow({ mode: 'text', text: 'x'.repeat(30) }, 't'), (e: unknown) => e instanceof ImportError && e.message === IMPORT_MESSAGES.timeout);
  const down = createImporter({ url: 'https://x/fn', anonKey: 'a', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(down({ mode: 'text', text: 'x'.repeat(30) }, 't'), (e: unknown) => e instanceof ImportError && e.kind === 'network');
  const refused = createImporter({
    url: 'https://x/fn',
    anonKey: 'a',
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ code: 'IMPORT_LIMIT_REACHED', error: 'You have used all 5 recipe imports for this month. They reset on the 1st.' }) }),
  });
  await assert.rejects(refused({ mode: 'link', url: 'https://e.com/a' }, 't'), (e: unknown) => e instanceof ImportError && e.kind === 'used-up');
  const unset = createImporter({ url: '', anonKey: 'a' });
  await assert.rejects(unset({ mode: 'link', url: 'https://e.com/a' }, 't'), (e: unknown) => e instanceof ImportError && e.kind === 'unavailable');
});

test('shared links fill the box; only http(s) links are ever tappable', () => {
  assert.equal(initialImportText({ url: ' https://e.com/a ' }), 'https://e.com/a');
  assert.equal(initialImportText({ text: 'Look at this https://e.com/b!' }), 'https://e.com/b!');
  assert.equal(initialImportText({ text: ['Pancakes 1 cup flour'] }), 'Pancakes 1 cup flour');
  assert.equal(initialImportText({}), '');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('text-import'), null);
  assert.equal(safeHttpUrl('https://user:pw@e.com/'), null);
  assert.equal(safeHttpUrl(' https://e.com/x '), 'https://e.com/x');
});
