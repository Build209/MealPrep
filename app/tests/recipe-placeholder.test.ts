import assert from 'node:assert/strict';
import { test } from 'node:test';
import { libraryRecipeFromRow, type LibraryRecipeRow } from '../src/data/recipeRows';
import { placeholderFor, type PlaceholderCategory } from '../src/recipes/placeholder';

const CASES: ReadonlyArray<readonly [string, PlaceholderCategory]> = [
  ['soup', 'soup'],
  ['stew', 'soup'],
  ['chili', 'soup'],
  ['salad', 'salad'],
  ['slaw', 'salad'],
  ['dessert', 'dessert'],
  ['cookies', 'dessert'],
  ['pie', 'dessert'],
  ['cake', 'dessert'],
  ['bread', 'bread'],
  ['pizza', 'bread'],
  ['pancakes', 'bread'],
  ['pasta', 'pasta'],
  ['noodles', 'pasta'],
  ['rice', 'rice'],
  ['risotto', 'rice'],
  ['oatmeal', 'rice'],
  ['chicken', 'meat'],
  ['beef', 'meat'],
  ['pork', 'meat'],
  ['salmon', 'seafood'],
  ['shrimp', 'seafood'],
  ['fish', 'seafood'],
  ['potatoes', 'vegetable'],
  ['broccoli', 'vegetable'],
  ['eggs', 'egg'],
  ['breakfast', 'egg'],
  ['smoothie', 'drink'],
  ['lemonade', 'drink'],
  ['sauce', 'sauce'],
  ['dip', 'sauce'],
  ['beans', 'beans'],
  ['lentils', 'beans'],
  ['Dessert', 'dessert'],
];

for (const [tag, category] of CASES) {
  test(`tag "${tag}" is ${category}`, () => {
    assert.equal(placeholderFor([tag], 'Some recipe').category, category);
  });
}

test('cuisine-only tags fall back to the title', () => {
  assert.equal(placeholderFor(['thai'], 'Thai Red Curry Chicken').category, 'meat');
  assert.equal(placeholderFor(['thai'], 'Mango Salad').category, 'salad');
});

test('tag beats title; first matching tag wins', () => {
  assert.equal(placeholderFor(['dessert'], 'Chicken Pie').category, 'dessert');
  assert.equal(placeholderFor(['thai', 'soup'], 'Whatever').category, 'soup');
});

test('soup wins over the protein in a title', () => {
  assert.equal(placeholderFor(null, 'Chicken Noodle Soup').category, 'soup');
});

test('no match, empty, null and junk give the generic plate', () => {
  for (const [tags, title] of [
    [['zzz'], 'Mystery'],
    [[], ''],
    [null, null],
    [undefined, undefined],
    [[''], '   '],
    [[null as unknown as string], 'Plain'],
  ] as const) {
    const p = placeholderFor(tags, title);
    assert.equal(p.category, 'generic');
    assert.equal(p.glyph, 'silverware-fork-knife');
  }
});

test('accepts a single string tag, and every result has a glyph and tint', () => {
  assert.equal(placeholderFor('soup', '').category, 'soup');
  for (const [tag] of CASES) {
    const p = placeholderFor([tag], '');
    assert.ok(p.glyph.length > 0);
    assert.match(p.tint, /^#[0-9A-Fa-f]{6}$/);
  }
});

test('library rows carry their tags through to the recipe', () => {
  const row: LibraryRecipeRow = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'tomato-soup',
    title: 'Tomato Soup',
    dish_name: 'Tomato soup',
    servings: 4,
    prep_minutes: 5,
    cook_minutes: 20,
    ingredients: [],
    steps: [],
    image_url: null,
    tags: ['soup', 'vegetarian'],
    created_at: '2026-10-01T00:00:00Z',
  };
  const recipe = libraryRecipeFromRow(row);
  assert.deepEqual(recipe.tags, ['soup', 'vegetarian']);
  assert.equal(recipe.imageUrl, null);
  assert.deepEqual(libraryRecipeFromRow({ ...row, tags: null }).tags, []);
});
