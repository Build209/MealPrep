/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_FORMAT_VERSION,
  buildKitchenExport,
  dataUrlFor,
  exportFilenames,
  formatExportQuantity,
  type KitchenExportInput,
} from '../src/account/export/exportKitchen';
import { EXPORT_COPY } from '../src/account/copy';
import type { GroceryItem } from '../src/data/groceryRows';
import type { AppRecipe } from '../src/data/recipeRows';
import type { PantryItem } from '../src/data/rows';
import type { SavedRecipe } from '../src/data/savedRecipeRows';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-10-17T20:30:00.000Z');

function pantry(over: Partial<PantryItem> = {}): PantryItem {
  return {
    id: ROW,
    userId: USER,
    ingredientId: 'rice',
    name: 'Rice',
    category: 'Grains',
    quantity: 2,
    unit: 'lb',
    location: 'Pantry',
    photoUrl: 'https://example.test/secret-photo.jpg',
    expiresOn: '2027-01-05',
    updatedAt: '2026-10-01T00:00:00Z',
    scanPhotoPath: `scan/${USER}/shelf.jpg`,
    ...over,
  };
}

function grocery(over: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: ROW,
    userId: USER,
    ingredientId: 'milk',
    name: 'Milk',
    category: 'Dairy',
    quantity: 1.5,
    unit: 'gal',
    checked: false,
    sourceRecipeIds: [ROW],
    updatedAt: '2026-10-01T00:00:00Z',
    origin: 'manual',
    plannedMealLinks: [],
    ...over,
  };
}

function saved(over: Partial<SavedRecipe> = {}): SavedRecipe {
  return {
    id: ROW,
    refKey: 'kitchen:brisket',
    sourceType: 'kitchen',
    title: 'Brisket',
    imageUrl: 'https://example.test/brisket.jpg',
    savedAt: '2026-09-30T12:00:00Z',
    kitchenRecipeId: ROW,
    link: { kind: 'recipe', routeId: `r_${ROW}` },
    ...over,
  };
}

function recipe(over: Partial<AppRecipe> = {}): AppRecipe {
  return {
    id: `r_${ROW}`,
    source: 'recipes',
    rowId: ROW,
    slug: 'my-chili',
    name: 'My chili',
    description: 'Family favourite.',
    servings: 6,
    minutes: 45,
    imageUrl: 'https://example.test/chili.jpg',
    tags: [],
    ingredients: [{ ingredientId: 'beans', name: 'Beans', quantity: 2, unit: 'cans' }],
    steps: ['Brown the meat.', '  Simmer   for 30 minutes. '],
    isMealPlanatic: false,
    credit: null,
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  } as AppRecipe;
}

function input(over: Partial<KitchenExportInput> = {}): KitchenExportInput {
  return { exportedAt: NOW, pantry: [], grocery: [], saved: [], ownRecipes: [], ...over };
}

test('an empty kitchen still exports a valid file with every section', () => {
  const out = buildKitchenExport(input());
  const parsed = JSON.parse(out.json);
  assert.equal(parsed.app, 'MealPlanatic');
  assert.equal(parsed.formatVersion, EXPORT_FORMAT_VERSION);
  assert.equal(parsed.exportedAt, NOW.toISOString());
  assert.deepEqual(parsed.pantry, []);
  assert.deepEqual(parsed.groceryList, []);
  assert.deepEqual(parsed.savedRecipes, []);
  assert.deepEqual(parsed.myRecipes, []);
  assert.deepEqual(out.counts, { pantry: 0, groceryList: 0, savedRecipes: 0, myRecipes: 0 });
  assert.match(out.text, /PANTRY \(0\)\nNothing here\./);
});

test('the file never carries ids, the account id, photo addresses or photo paths', () => {
  const out = buildKitchenExport(
    input({ pantry: [pantry()], grocery: [grocery()], saved: [saved()], ownRecipes: [recipe()] }),
  );
  for (const forbidden of [USER, ROW, 'secret-photo', 'shelf.jpg', 'brisket.jpg', 'chili.jpg', 'userId', 'user_id', 'email']) {
    assert.ok(!out.json.includes(forbidden), `json leaks ${forbidden}`);
    assert.ok(!out.text.includes(forbidden), `text leaks ${forbidden}`);
  }
});

test('health-type and plan fields are not part of the export shape', () => {
  const out = buildKitchenExport(input({ pantry: [pantry()], ownRecipes: [recipe()] }));
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        keys.add(k);
        walk(x);
      }
    }
  };
  walk(out.data);
  for (const banned of ['allergens', 'diets', 'dietaryNotes', 'plan', 'planTier', 'householdSize', 'homeZip', 'stores']) {
    assert.ok(!keys.has(banned), `unexpected key ${banned}`);
  }
});

test('pantry and grocery rows are mapped, tidied and sorted by name', () => {
  const out = buildKitchenExport(
    input({
      pantry: [pantry({ name: '  Rice ', location: '', expiresOn: null }), pantry({ name: 'apples', location: 'Fridge' }), pantry({ name: '   ' })],
      grocery: [grocery({ name: 'Milk', checked: true }), grocery({ name: 'bread', quantity: 0.3333333, unit: 'loaf' })],
    }),
  );
  assert.deepEqual(
    out.data.pantry.map((i) => i.name),
    ['apples', 'Rice'],
  );
  assert.equal(out.data.pantry[1]!.place, null);
  assert.equal(out.data.pantry[1]!.expiresOn, null);
  assert.equal(out.data.pantry[0]!.expiresOn, '2027-01-05');
  assert.deepEqual(
    out.data.groceryList.map((i) => [i.name, i.bought]),
    [
      ['bread', false],
      ['Milk', true],
    ],
  );
  assert.match(out.text, /- apples \(2 lb, Fridge, use by 2027-01-05\)/);
  assert.match(out.text, /- \[x\] Milk \(1.5 gal\)/);
  assert.match(out.text, /- \[ \] bread \(0.33 loaf\)/);
});

test('only the person\'s own recipes are exported, with ingredients and steps', () => {
  const out = buildKitchenExport(
    input({
      ownRecipes: [
        recipe({ name: 'MealPlanatic master', isMealPlanatic: true }),
        recipe({ credit: { creatorName: 'Chef Sam', creatorUrl: null, originalUrl: 'https://example.test/chili' } }),
      ],
    }),
  );
  assert.equal(out.data.myRecipes.length, 1);
  const r = out.data.myRecipes[0]!;
  assert.equal(r.name, 'My chili');
  assert.deepEqual(r.steps, ['Brown the meat.', 'Simmer for 30 minutes.']);
  assert.deepEqual(r.ingredients, [{ name: 'Beans', quantity: 2, unit: 'cans' }]);
  assert.equal(r.sourceUrl, 'https://example.test/chili');
  assert.equal(r.sourceName, 'Chef Sam');
  assert.match(out.text, /My chili\nServes 6, 45 min\nFamily favourite\.\nSource: Chef Sam - https:\/\/example\.test\/chili/);
  assert.match(out.text, /Ingredients:\n- 2 cans Beans\nSteps:\n1\. Brown the meat\.\n2\. Simmer for 30 minutes\./);
});

test('a saved recipe gives its title and date; only a video gives a link', () => {
  const out = buildKitchenExport(
    input({
      saved: [
        saved(),
        saved({
          title: 'Easy tacos',
          refKey: 'creator:abc',
          sourceType: 'creator_video',
          link: { kind: 'video', url: 'https://www.youtube.com/watch?v=abc', label: 'Watch' },
        }),
        saved({ title: 'Gone', link: { kind: 'none' } }),
      ],
    }),
  );
  assert.deepEqual(
    out.data.savedRecipes.map((s) => [s.title, s.kind, s.link]),
    [
      ['Brisket', 'recipe', null],
      ['Easy tacos', 'video', 'https://www.youtube.com/watch?v=abc'],
      ['Gone', 'other', null],
    ],
  );
  assert.equal(out.data.savedRecipes[0]!.savedOn, '2026-09-30');
});

test('quantities are tidy and survive odd numbers', () => {
  assert.equal(formatExportQuantity(2), '2');
  assert.equal(formatExportQuantity(1.5), '1.5');
  assert.equal(formatExportQuantity(0.3333333), '0.33');
  assert.equal(formatExportQuantity(Number.NaN), '');
});

test('file names carry the day and the download address round-trips the text', () => {
  assert.deepEqual(exportFilenames(NOW), {
    json: 'mealplanatic-kitchen-2026-10-17.json',
    text: 'mealplanatic-kitchen-2026-10-17.txt',
  });
  const out = buildKitchenExport(input({ pantry: [pantry({ name: 'Crème fraîche & "chives"' })] }));
  const url = dataUrlFor({ filename: out.jsonFilename, mime: 'application/json', content: out.json });
  assert.ok(url.startsWith('data:application/json;charset=utf-8,'));
  assert.equal(decodeURIComponent(url.slice(url.indexOf(',') + 1)), out.json);
  assert.equal(JSON.parse(out.json).pantry[0].name, 'Crème fraîche & "chives"');
});

test('export words stay plain: no other app is named and nothing is called safe or guaranteed', () => {
  const words = JSON.stringify(EXPORT_COPY) + EXPORT_COPY.done({ pantry: 1, groceryList: 2, savedRecipes: 3, myRecipes: 4 });
  assert.ok(!/mealime/i.test(words));
  assert.ok(!/\b(safe|guaranteed|allergen-free)\b/i.test(words));
  assert.equal(
    EXPORT_COPY.done({ pantry: 1, groceryList: 2, savedRecipes: 3, myRecipes: 4 }),
    'Exported 1 pantry, 2 grocery, 3 saved and 4 of your own recipes.',
  );
});
