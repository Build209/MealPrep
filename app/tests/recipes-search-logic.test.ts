/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchResults,
  matchRecipe,
  matchedIngredient,
  mergeSearchResults,
  normalizeRecipeTitleForDedup,
  recipeResultNote,
  searchRecipes,
  searchWords,
  type RecipeHit,
} from '../src/recipes/search/searchLogic';
import {
  ingredientLines,
  parseRecipeRouteId,
  recipeRouteId,
  searchableFromLibraryRow,
  searchableFromRecipeRow,
  type SearchableRecipe,
} from '../src/data/recipeSearchRows';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function recipe(over: Partial<SearchableRecipe> & { title: string }): SearchableRecipe {
  const uuid = over.uuid ?? U1;
  return {
    routeId: over.routeId ?? recipeRouteId(over.table ?? 'recipes', uuid),
    table: 'recipes',
    uuid,
    legacyId: uuid,
    subtitle: '',
    description: '',
    minutes: null,
    servings: 4,
    imageUrl: null,
    ingredients: [],
    own: false,
    ...over,
  };
}

test('normalizeRecipeTitleForDedup (ported unchanged)', () => {
  assert.equal(normalizeRecipeTitleForDedup('  Crème Brûlée!! '), 'creme brulee');
  assert.equal(normalizeRecipeTitleForDedup('Mac & Cheese'), 'mac cheese');
});

test('searchWords: under 2 characters searches nothing; cut to 80', () => {
  assert.deepEqual(searchWords('a'), []);
  assert.deepEqual(searchWords(' ! '), []);
  assert.deepEqual(searchWords('Chicken  Rice'), ['chicken', 'rice']);
  assert.equal(searchWords('x'.repeat(200)).join('').length, 80);
});

test('matchRecipe: title, description and tag first; then ingredients; all words must be found', () => {
  const stew = recipe({ title: 'Beef Stew', subtitle: 'Comfort', ingredients: [{ name: 'Carrots', quantity: 2, unit: 'each' }] });
  assert.equal(matchRecipe(stew, ['stew']), 'title');
  assert.equal(matchRecipe(stew, ['comfort']), 'title');
  assert.equal(matchRecipe(stew, ['carrot']), 'ingredient');
  assert.equal(matchRecipe(stew, ['beef', 'carrot']), 'ingredient');
  assert.equal(matchRecipe(stew, ['beef', 'tofu']), null);
  assert.equal(matchRecipe(stew, []), null);
});

test('searchRecipes: title matches (starting with the word first) before ingredient matches, then A to Z', () => {
  const list = [
    recipe({ title: 'Lemon Chicken', uuid: U1 }),
    recipe({ title: 'Rice Bowl', uuid: U2, ingredients: [{ name: 'chicken thighs', quantity: 1, unit: 'lb' }] }),
    recipe({ title: 'Chicken Soup', uuid: U3 }),
  ];
  assert.deepEqual(
    searchRecipes(list, 'chicken').map((h) => [h.recipe.title, h.match]),
    [
      ['Chicken Soup', 'title'],
      ['Lemon Chicken', 'title'],
      ['Rice Bowl', 'ingredient'],
    ],
  );
  assert.deepEqual(searchRecipes(list, 'c'), []);
});

test('notes: own recipe, which ingredient matched, minutes', () => {
  const r = recipe({ title: 'Rice Bowl', own: true, minutes: 20, ingredients: [{ name: 'Chicken thighs', quantity: 1, unit: 'lb' }] });
  assert.equal(matchedIngredient(r, ['chicken']), 'Chicken thighs');
  assert.equal(recipeResultNote(r, 'ingredient', ['chicken']), 'Your recipe · Uses Chicken thighs · 20 min');
  assert.equal(recipeResultNote(recipe({ title: 'X', subtitle: 'Thai' }), 'title', ['x']), 'Thai');
});

// The old app's merge check (mobile/scripts/recipes-search-merge-check.ts), on the new shapes.
const hit = (r: SearchableRecipe): RecipeHit<SearchableRecipe> => ({ recipe: r, match: 'title' });
const video = (videoId: string) => ({ videoId, title: `Video ${videoId}` });

test('merge: catalog and videos both present; a second merge gives the same answer', () => {
  const classic = hit(recipe({ title: 'Tomato Pasta', uuid: U1 }));
  const merged = mergeSearchResults([], [classic], [video('vid001')]);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((i) => i.kind === 'recipe'));
  assert.ok(merged.some((i) => i.kind === 'video'));
  assert.equal(mergeSearchResults([], [classic], [video('vid001')]).length, 2);
});

test('merge: own recipes come first', () => {
  const classic = hit(recipe({ title: 'Tomato Pasta', uuid: U1 }));
  const own = hit(recipe({ title: 'Pedernales River Chili', uuid: U2, own: true }));
  const merged = mergeSearchResults([own], [classic], [video('vid001')]);
  assert.equal(merged[0]!.kind, 'recipe');
  assert.equal(merged[0]!.kind === 'recipe' && merged[0]!.hit.recipe.uuid, U2);
});

test('merge: catalog and videos take turns starting with a recipe; repeats dropped', () => {
  const a = hit(recipe({ title: 'Tomato Pasta', uuid: U1 }));
  const aAgain = hit(recipe({ title: 'tomato   pasta!', uuid: U2, table: 'library_recipes' }));
  const b = hit(recipe({ title: 'Garlic Bread', uuid: U3 }));
  const merged = mergeSearchResults([], [a, aAgain, b], [video('v1'), video('v1'), video('v2')]);
  assert.deepEqual(
    merged.map((i) => (i.kind === 'recipe' ? i.hit.recipe.title : i.video.videoId)),
    ['Tomato Pasta', 'v1', 'Garlic Bread', 'v2'],
  );
  // Own recipes are kept even when a catalog recipe has the same title (old behaviour).
  const own = hit(recipe({ title: 'Tomato Pasta', uuid: U3, own: true }));
  assert.equal(mergeSearchResults([own], [a], []).length, 2);
});

test('buildSearchResults: splits own from catalog, no videos for a too-short query', () => {
  const list = [recipe({ title: 'Chili', uuid: U1, own: true }), recipe({ title: 'Chili Dogs', uuid: U2 })];
  const out = buildSearchResults(list, [video('v1')], 'chili');
  assert.deepEqual(out.map((i) => i.key), [`own:r_${U1}`, 'classic:chili dogs', 'video:v1']);
  assert.deepEqual(buildSearchResults(list, [video('v1')], 'c'), []);
});

test('route ids: r_ and l_ with a uuid, both ways', () => {
  assert.equal(recipeRouteId('recipes', U1), `r_${U1}`);
  assert.equal(recipeRouteId('library_recipes', U1), `l_${U1}`);
  assert.deepEqual(parseRecipeRouteId(`l_${U1}`), { table: 'library_recipes', uuid: U1 });
  assert.equal(parseRecipeRouteId('r_brisket'), null);
  assert.equal(parseRecipeRouteId(U1), null);
});

test('row mapping: recipes (own vs master, legacy id) and library (title, minutes, legacy id)', () => {
  const own = searchableFromRecipeRow(
    { id: U1, slug: null, name: ' Chili ', tag: 'Dinner', description: '', servings: 0, minutes: 45, ingredients: [{ name: 'Beans' }, { nope: 1 }, 'x'], image_url: 'http://bad.example/x.jpg', is_master: false, created_by: ME },
    ME,
  );
  assert.ok(own);
  assert.equal(own.title, 'Chili');
  assert.equal(own.own, true);
  assert.equal(own.legacyId, U1);
  assert.equal(own.servings, 1);
  assert.equal(own.imageUrl, null);
  assert.deepEqual(own.ingredients, [{ name: 'Beans', quantity: 1, unit: 'each' }]);
  const master = searchableFromRecipeRow(
    { id: U2, slug: 'brisket', name: 'Brisket', tag: null, description: null, servings: 8, minutes: 0, ingredients: null, image_url: null, is_master: true, created_by: ME },
    ME,
  );
  assert.equal(master?.own, false);
  assert.equal(master?.legacyId, 'brisket');
  assert.equal(master?.minutes, null);
  assert.equal(
    searchableFromRecipeRow(
      { id: 'not-a-uuid', slug: null, name: 'X', tag: null, description: null, servings: 1, minutes: 1, ingredients: [], image_url: null, is_master: true, created_by: null },
      ME,
    ),
    null,
  );

  const lib = searchableFromLibraryRow({
    id: U3, slug: 'thai-curry', title: '', dish_name: 'Thai Curry', servings: 4, prep_minutes: 10, cook_minutes: 20,
    ingredients: [{ name: 'Coconut milk', quantity: 1, unit: 'can' }], tags: [' ', 'Spicy'], cuisine: null, image_url: 'https://x.example/c.jpg',
  });
  assert.ok(lib);
  assert.equal(lib.routeId, `l_${U3}`);
  assert.equal(lib.title, 'Thai Curry');
  assert.equal(lib.subtitle, 'Spicy');
  assert.equal(lib.minutes, 30);
  assert.equal(lib.legacyId, 'library-thai-curry');
  assert.equal(ingredientLines('nope').length, 0);
});
