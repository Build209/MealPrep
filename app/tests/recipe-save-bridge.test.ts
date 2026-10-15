/// <reference types="node" />
// The recipe page's heart and the search heart must write and find the same saved row:
// AppRecipe (src/data/recipeRows.ts) and SearchableRecipe (src/data/recipeSearchRows.ts) are built
// from the same table rows, and saveableFromAppRecipe bridges them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryRecipeFromRow, recipeFromRow, type LibraryRecipeRow, type RecipeRow } from '../src/data/recipeRows';
import { searchableFromLibraryRow, searchableFromRecipeRow, type SearchLibraryRow, type SearchRecipeRow } from '../src/data/recipeSearchRows';
import { saveTargetForRecipe, saveableFromAppRecipe } from '../src/data/savedRecipeRows';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const recipeRow: RecipeRow = {
  id: U1,
  slug: 'imported-garlic-pasta',
  name: 'Garlic Pasta',
  description: 'Imported from a link',
  servings: 2,
  minutes: 25,
  ingredients: [{ ingredientId: 'x-spaghetti', name: 'spaghetti', quantity: 12, unit: 'oz' }],
  steps: ['Boil.', 'Toss.'],
  is_master: false,
  created_by: ME,
  created_at: '2026-10-14T00:00:00Z',
  source_url: null,
  source_type: null,
  source_title: null,
  prep_minutes: null,
  cook_minutes: null,
  source_channel_name: null,
  source_channel_url: null,
  source_author_url: null,
  image_url: null,
};

const libraryRow: LibraryRecipeRow = {
  id: U2,
  slug: 'thai-curry',
  title: 'Thai Curry',
  dish_name: 'Curry',
  servings: 4,
  prep_minutes: 10,
  cook_minutes: 20,
  ingredients: [{ name: 'Coconut milk', quantity: 1, unit: 'can' }],
  steps: ['Simmer.'],
  image_url: null,
  created_at: '2026-10-14T00:00:00Z',
};

function searchRecipe(row: RecipeRow): SearchRecipeRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tag: null,
    description: row.description,
    servings: row.servings,
    minutes: row.minutes,
    ingredients: row.ingredients,
    image_url: row.image_url,
    is_master: row.is_master,
    created_by: row.created_by,
  };
}

function searchLibrary(row: LibraryRecipeRow): SearchLibraryRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    dish_name: row.dish_name,
    servings: row.servings,
    prep_minutes: row.prep_minutes,
    cook_minutes: row.cook_minutes,
    ingredients: row.ingredients,
    tags: null,
    cuisine: null,
    image_url: row.image_url,
  };
}

test('recipes row: page and search build the same ref_key, uuid and route', () => {
  const page = saveTargetForRecipe(saveableFromAppRecipe(recipeFromRow(recipeRow))!);
  const search = saveTargetForRecipe(searchableFromRecipeRow(searchRecipe(recipeRow), ME)!);
  assert.equal(page.refKey, 'kitchen:imported-garlic-pasta');
  assert.equal(page.refKey, search.refKey);
  assert.equal(page.kitchenRecipeId, U1);
  assert.equal(page.kitchenRecipeId, search.kitchenRecipeId);
  assert.deepEqual(page.link, { kind: 'recipe', routeId: `r_${U1}` });
  assert.deepEqual(page.link, search.link);
  assert.equal(page.preview.appRoute, recipeFromRow(recipeRow).id);
});

test('recipes row without a slug: keyed by uuid on both sides', () => {
  const row = { ...recipeRow, slug: null };
  const page = saveTargetForRecipe(saveableFromAppRecipe(recipeFromRow(row))!);
  const search = saveTargetForRecipe(searchableFromRecipeRow(searchRecipe(row), ME)!);
  assert.equal(page.refKey, `kitchen:${U1}`);
  assert.equal(page.refKey, search.refKey);
});

test('library row: library-<slug> key, no kitchen uuid, l_ route, same as search', () => {
  const page = saveTargetForRecipe(saveableFromAppRecipe(libraryRecipeFromRow(libraryRow))!);
  const search = saveTargetForRecipe(searchableFromLibraryRow(searchLibrary(libraryRow))!);
  assert.equal(page.refKey, 'kitchen:library-thai-curry');
  assert.equal(page.refKey, search.refKey);
  assert.equal(page.kitchenRecipeId, null);
  assert.deepEqual(page.link, { kind: 'recipe', routeId: `l_${U2}` });
  assert.deepEqual(page.link, search.link);
});

test('library row without a slug cannot be saved (search leaves it out too)', () => {
  const row = { ...libraryRow, slug: '' };
  assert.equal(saveableFromAppRecipe(libraryRecipeFromRow(row)), null);
  assert.equal(searchableFromLibraryRow(searchLibrary(row)), null);
});
