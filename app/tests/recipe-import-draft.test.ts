/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftFromImport,
  draftProblems,
  editDraftField,
  editIngredient,
  importSlug,
  recipeInsertFromDraft,
  recipeRoute,
  removeIngredient,
  removeStep,
  sourceCredit,
} from '../src/recipes/import/draft';
import { parseImportedRecipe, type ImportedRecipe } from '../src/recipes/import/request';

const USER = '6f1c2a9e-0000-4000-8000-000000000001';

function recipe(over: Record<string, unknown> = {}): ImportedRecipe {
  return parseImportedRecipe({
    title: 'Weeknight garlic pasta',
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 15,
    ingredients: [
      { name: 'spaghetti', quantity: 12, unit: 'oz' },
      { name: 'garlic', quantity: 4, unit: 'clove', note: 'thinly sliced' },
      { name: 'parmesan cheese', quantity: 0.5, unit: 'cup' },
    ],
    steps: ['Boil pasta.', 'Toss with garlic oil and parmesan.'],
    source_url: 'https://example.com/pasta',
    source_type: 'web',
    social_author_name: 'Jane Cook',
    social_author_url: 'https://example.com/jane',
    image_url: 'https://example.com/pasta.jpg',
    ...over,
  });
}

test('the row: own private copy, credit in source_*, as the old upsertLinkImportedRecipe', () => {
  const row = recipeInsertFromDraft(draftFromImport(recipe()), USER, 1000);
  assert.equal(row.is_master, false);
  assert.equal(row.created_by, USER);
  assert.equal(row.name, 'Weeknight garlic pasta');
  assert.equal(row.servings, 4);
  assert.equal(row.minutes, 25);
  assert.equal(row.prep_minutes, 10);
  assert.equal(row.cook_minutes, 15);
  assert.equal(row.tag, 'Imported · Web');
  assert.equal(row.description, 'Imported from a recipe page and saved in your own words.');
  assert.equal(row.source_url, 'https://example.com/pasta');
  assert.equal(row.source_type, 'web');
  assert.equal(row.source_title, 'Jane Cook');
  assert.equal(row.source_author_url, 'https://example.com/jane');
  assert.equal(row.source_channel_name, null);
  assert.equal(row.image_url, 'https://example.com/pasta.jpg');
  assert.equal(row.nutrition_source, 'Link import');
  assert.deepEqual(row.steps, ['Boil pasta.', 'Toss with garlic oil and parmesan.']);
  assert.match(row.slug, /^link-import-6f1c2a9e-[0-9a-z]+$/);
  assert.deepEqual(row.ingredients[1], {
    ingredientId: `${row.slug.slice(0, 24)}-garlic`,
    name: 'garlic (thinly sliced)',
    quantity: 4,
    unit: 'clove',
    notes: 'produce',
  });
  assert.equal(row.ingredients[2]!.notes, 'dairy');
});

test('YouTube credit goes in the channel columns, never source_title', () => {
  const yt = recipe({
    source_type: 'youtube',
    source_url: 'https://www.youtube.com/watch?v=abc',
    social_author_name: null,
    social_author_url: null,
    youtube_channel_name: 'Chef Ann',
    youtube_channel_url: 'https://www.youtube.com/@chefann',
  });
  const row = recipeInsertFromDraft(draftFromImport(yt), USER);
  assert.equal(row.source_type, 'youtube');
  assert.equal(row.source_title, null);
  assert.equal(row.source_channel_name, 'Chef Ann');
  assert.equal(row.source_channel_url, 'https://www.youtube.com/@chefann');
  assert.equal(row.source_author_url, null);
  assert.deepEqual(sourceCredit(yt), {
    creatorLine: 'Recipe video by Chef Ann',
    creatorUrl: 'https://www.youtube.com/@chefann',
    originalUrl: 'https://www.youtube.com/watch?v=abc',
  });
});

test('credit lines: social handle, web author, pasted text', () => {
  assert.equal(sourceCredit(recipe({ source_type: 'tiktok', social_author_name: '@cook' })).creatorLine, 'Recipe from @cook');
  assert.equal(sourceCredit(recipe()).creatorLine, 'By Jane Cook');
  const text = sourceCredit(recipe({ source_url: 'text-import', social_author_name: null, social_author_url: null }));
  assert.deepEqual(text, { creatorLine: null, creatorUrl: null, originalUrl: null });
});

test('slugs: the same link keeps one copy; text and photos get a fresh one each time', () => {
  const a = importSlug(USER, { sourceUrl: 'https://Example.com/pasta', sourceType: 'web', title: 'A' }, 1);
  const b = importSlug(USER, { sourceUrl: 'https://example.com/pasta', sourceType: 'web', title: 'B' }, 2);
  assert.equal(a, b);
  const t1 = importSlug(USER, { sourceUrl: 'text-import', sourceType: 'web', title: 'Soup' }, 1);
  const t2 = importSlug(USER, { sourceUrl: 'text-import', sourceType: 'web', title: 'Soup' }, 2);
  assert.notEqual(t1, t2);
  assert.match(t1, /^photo-import-6f1c2a9e-/);
  assert.match(importSlug(USER, { sourceUrl: 'photo-scan', sourceType: 'photo', title: 'Card' }, 3), /^photo-import-/);
});

test('reddit is not a source_type the table accepts: saved as null', () => {
  const row = recipeInsertFromDraft(draftFromImport(recipe({ source_type: 'reddit' })), USER);
  assert.equal(row.source_type, null);
});

test('light edits and checks before saving', () => {
  let d = draftFromImport(recipe());
  assert.deepEqual(draftProblems(d), {});
  d = editDraftField(d, 'title', '  Garlic pasta for two ');
  d = editDraftField(d, 'servings', '2');
  d = editDraftField(d, 'cookMinutes', '');
  d = editIngredient(d, 'i0', { quantity: '1 1/2', unit: 'cup' });
  d = removeIngredient(d, 'i2');
  d = removeStep(d, 's1');
  assert.deepEqual(draftProblems(d), {});
  const row = recipeInsertFromDraft(d, USER);
  assert.equal(row.name, 'Garlic pasta for two');
  assert.equal(row.servings, 2);
  assert.equal(row.cook_minutes, null);
  assert.equal(row.minutes, 10);
  assert.equal(row.ingredients.length, 2);
  assert.equal(row.ingredients[0]!.quantity, 1.5);
  assert.deepEqual(row.steps, ['Boil pasta.']);

  const bad = editIngredient(editDraftField(editDraftField(d, 'title', ' '), 'servings', 'two'), 'i1', { quantity: 'lots' });
  const problems = draftProblems(bad);
  assert.ok(problems.title);
  assert.ok(problems.servings);
  assert.ok(problems.i1);
  let empty = removeIngredient(removeIngredient(d, 'i0'), 'i1');
  empty = removeStep(empty, 's0');
  assert.ok(draftProblems(empty).content);
});

test('no times given: 30 minutes, as the old app', () => {
  const row = recipeInsertFromDraft(draftFromImport(recipe({ prep_minutes: null, cook_minutes: null })), USER);
  assert.equal(row.minutes, 30);
  assert.equal(row.prep_minutes, null);
});

test('detail route for a recipes row', () => {
  assert.equal(recipeRoute('1234'), '/recipe/r_1234');
});
