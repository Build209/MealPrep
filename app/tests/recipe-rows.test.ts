/// <reference types="node" />
// Recipe rows from public.recipes and public.library_recipes, the recipe id scheme, and the
// answer of public.add_missing_to_grocery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataError } from '../src/data/errors';
import type { GroceryItem } from '../src/data/groceryRows';
import {
  addMissingItemsBody,
  addMissingResultFromJson,
  addMissingRpcError,
  creditFromRecipeRow,
  libraryRecipeFromRow,
  missingAlreadyOnList,
  parseRecipeRouteId,
  recipeFromRow,
  recipeHref,
  recipeRouteId,
  safeHttpUrl,
  servingsAndTime,
  upsertGroceryRows,
  type LibraryRecipeRow,
  type RecipeRow,
} from '../src/data/recipeRows';

const UUID = '6f0c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';

test('id scheme: r_ for recipes, l_ for library, round trip, junk refused', () => {
  assert.equal(recipeRouteId('recipes', UUID), `r_${UUID}`);
  assert.equal(recipeRouteId('library', UUID), `l_${UUID}`);
  assert.equal(recipeHref('library', UUID), `/recipe/l_${UUID}`);
  assert.deepEqual(parseRecipeRouteId(`r_${UUID}`), { source: 'recipes', rowId: UUID });
  assert.deepEqual(parseRecipeRouteId(`l_${UUID.toUpperCase()}`), { source: 'library', rowId: UUID });
  for (const bad of [UUID, `x_${UUID}`, 'r_brisket', 'l_', '', null, undefined, `r_${UUID}x`]) {
    assert.equal(parseRecipeRouteId(bad), null, String(bad));
  }
});

const recipeRow: RecipeRow = {
  id: UUID,
  slug: 'lemon-chicken',
  name: ' Lemon Herb Chicken ',
  description: 'Bright',
  servings: 4,
  minutes: 35,
  ingredients: [
    { ingredientId: 'chicken-breast', name: 'Chicken breast', quantity: 24, unit: 'oz' },
    { ingredient_id: 'rice', name: 'Rice', quantity: '1.5', unit: 'cup' },
    { name: 'Lemon', quantity: 1 },
    { name: '' },
    'junk',
  ],
  steps: ['Season.', ' ', 'Grill.', 3],
  is_master: true,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  source_url: null,
  source_type: null,
  source_title: null,
  prep_minutes: null,
  cook_minutes: null,
  source_channel_name: null,
  source_channel_url: null,
  source_author_url: null,
  image_url: 'https://example.com/a.jpg',
};

test('recipes row maps to the app recipe', () => {
  const r = recipeFromRow(recipeRow);
  assert.equal(r.id, `r_${UUID}`);
  assert.equal(r.name, 'Lemon Herb Chicken');
  assert.equal(r.minutes, 35);
  assert.equal(r.isMealPlanatic, true);
  assert.equal(r.credit, null);
  assert.deepEqual(r.ingredients, [
    { ingredientId: 'chicken-breast', name: 'Chicken breast', quantity: 24, unit: 'oz' },
    { ingredientId: 'rice', name: 'Rice', quantity: 1.5, unit: 'cup' },
    { ingredientId: 'lemon', name: 'Lemon', quantity: 1, unit: '' },
  ]);
  assert.deepEqual(r.steps, ['Season.', 'Grill.']);
  assert.equal(servingsAndTime(r), '4 servings · 35 min');
  assert.equal(servingsAndTime({ servings: 1, minutes: null }), '1 serving');
  assert.equal(recipeFromRow({ ...recipeRow, image_url: 'javascript:alert(1)' }).imageUrl, null);
});

test('source credit: YouTube credits the channel, others the title; only http links', () => {
  const yt = creditFromRecipeRow({
    source_url: 'https://youtube.com/watch?v=1',
    source_type: 'youtube',
    source_title: 'Video title',
    source_channel_name: 'Smoke Shack',
    source_channel_url: 'https://youtube.com/@smoke',
    source_author_url: null,
  });
  assert.deepEqual(yt, { creatorName: 'Smoke Shack', creatorUrl: 'https://youtube.com/@smoke', originalUrl: 'https://youtube.com/watch?v=1' });
  const web = creditFromRecipeRow({
    source_url: 'ftp://x',
    source_type: 'web',
    source_title: 'Serious Eats',
    source_channel_name: null,
    source_channel_url: null,
    source_author_url: 'https://seriouseats.com',
  });
  assert.deepEqual(web, { creatorName: 'Serious Eats', creatorUrl: 'https://seriouseats.com', originalUrl: null });
  assert.equal(safeHttpUrl(' http://a.b/c '), 'http://a.b/c');
});

test('library row maps to the app recipe (notes kept in the name, numbered line ids)', () => {
  const row: LibraryRecipeRow = {
    id: UUID,
    slug: 'beef-stew',
    title: 'Beef Stew',
    dish_name: 'beef stew',
    servings: 6,
    prep_minutes: 20,
    cook_minutes: 100,
    ingredients: [
      { name: 'Beef chuck', quantity: 2, unit: 'lb' },
      { name: 'Carrots', quantity: 3, unit: '', note: 'sliced' },
      { name: 'Thyme' },
    ],
    steps: ['Brown the beef.'],
    image_url: null,
    created_at: '2026-01-01T00:00:00Z',
  };
  const r = libraryRecipeFromRow(row);
  assert.equal(r.id, `l_${UUID}`);
  assert.equal(r.minutes, 120);
  assert.equal(r.isMealPlanatic, true);
  assert.deepEqual(r.ingredients, [
    { ingredientId: 'lib-beef-stew-0', name: 'Beef chuck', quantity: 2, unit: 'lb' },
    { ingredientId: 'lib-beef-stew-1', name: 'Carrots (sliced)', quantity: 3, unit: 'each' },
    { ingredientId: 'lib-beef-stew-2', name: 'Thyme', quantity: 1, unit: 'each' },
  ]);
});

const groceryRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'g1',
  user_id: 'u1',
  ingredient_id: 'broccoli',
  name: 'Broccoli',
  category: 'produce',
  quantity: '3',
  unit: 'lb',
  checked: false,
  source_recipe_ids: [`r_${UUID}`],
  updated_at: '2026-01-01T00:00:00Z',
  origin: 'add_missing',
  planned_meal_links: [],
  ...over,
});

test('add missing answer, request body and errors', () => {
  const result = addMissingResultFromJson({ rows: [groceryRow(), null], added: 1, merged: 0, unchanged: 0 });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.quantity, 3);
  assert.deepEqual(result.rows[0]!.sourceRecipeIds, [`r_${UUID}`]);
  assert.equal(result.added, 1);
  assert.throws(() => addMissingResultFromJson(null), DataError);
  assert.deepEqual(addMissingItemsBody([{ ingredientId: 'a', name: 'A', category: 'produce', quantity: 1, unit: 'each' }]), [
    { ingredient_id: 'a', name: 'A', category: 'produce', quantity: 1, unit: 'each' },
  ]);
  assert.match(addMissingRpcError({ code: 'PGRST202' }).message, /isn't available on this server yet/);
  assert.equal(addMissingRpcError({ code: '22023' }).kind, 'invalid');
  assert.equal(addMissingRpcError({ code: '42501' }).kind, 'forbidden');
});

test('grocery list: server rows replace by id; "already on the list" needs every line', () => {
  const [row] = addMissingResultFromJson({ rows: [groceryRow()] }).rows as [GroceryItem];
  const apples: GroceryItem = { ...row, id: 'g0', name: 'Apples', ingredientId: 'apple', sourceRecipeIds: [] };
  const merged = upsertGroceryRows([apples, { ...row, quantity: 1 }], [row]);
  assert.deepEqual(merged.map((r) => [r.id, r.quantity]), [['g0', 3], ['g1', 3]]);

  const lines = [{ ingredientId: 'broccoli', name: 'Broccoli', unit: 'LB' }];
  assert.equal(missingAlreadyOnList(`r_${UUID}`, lines, [row]), true);
  assert.equal(missingAlreadyOnList(`r_${UUID}`, [...lines, { ingredientId: 'lemon', name: 'Lemon', unit: 'each' }], [row]), false);
  assert.equal(missingAlreadyOnList(`l_${UUID}`, lines, [row]), false, 'another recipe');
  assert.equal(missingAlreadyOnList(`r_${UUID}`, lines, [{ ...row, checked: true }]), false, 'ticked rows do not count');
  assert.equal(missingAlreadyOnList(`r_${UUID}`, [], [row]), false);
});

test('a library recipe from an outside source carries a credit line and link', () => {
  const base = {
    id: UUID, slug: 'pancakes', title: 'Pancakes', dish_name: 'Pancakes', servings: 4, prep_minutes: null, cook_minutes: null,
    ingredients: [], steps: [], image_url: null, created_at: '2026-01-01T00:00:00Z',
  };
  const own = libraryRecipeFromRow(base);
  assert.equal(own.credit, null);
  const wiki = libraryRecipeFromRow({
    ...base,
    source_name: 'Wikibooks Cookbook',
    source_url: 'https://en.wikibooks.org/wiki/Cookbook:Pancake',
    license: 'CC BY-SA 4.0',
  });
  assert.equal(wiki.credit?.sourceLine, 'Source: Wikibooks Cookbook, CC BY-SA 4.0');
  assert.equal(wiki.credit?.originalUrl, 'https://en.wikibooks.org/wiki/Cookbook:Pancake');
});
