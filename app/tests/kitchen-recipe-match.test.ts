/// <reference types="node" />
// Cases from the old app's mobile/scripts/recipe-match-regression.ts (matching, shortfalls,
// unit bridges, partial fallback), run on the same live-recipes fixture. The old script's
// Made-it deduction and grocery-merge cases are covered elsewhere: deductions arrive with
// cooking (later phase); the grocery merge runs on the server (db/tests/add_missing_check.sql).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandSynonymKeys, fuzzyNameScore, ingredientMatchScore, canonicalIngredientPhrase } from '../src/kitchen/ingredientNormalize';
import { convertIngredientQuantity, ingredientUnitsConvertible } from '../src/kitchen/ingredientUnits';
import {
  buildPantryMatchIndex,
  compareRecipePantryMatches,
  filterRankedMatches,
  filterRankedMatchesWithPartialFallback,
  isPantryStaple,
  scoreRecipeAgainstPantry,
  type MatchRecipe,
} from '../src/kitchen/recipeMatch';
import { totalPantryQuantityInUnit } from '../src/kitchen/recipeStock';
import { convertQuantity, unitsAreConvertible } from '../src/kitchen/unitConversion';
import { LIVE_RECIPES } from './fixtures/liveRecipes';

const recipes: MatchRecipe[] = LIVE_RECIPES.map((r) => ({ id: r.slug, name: r.name, ingredients: r.ingredients }));

const slug = (n: string) => n.toLowerCase().replace(/\s+/g, '-');
function pantryFrom(names: string[]) {
  return names.map((name, i) => ({ id: `p${i}`, ingredientId: slug(name), name, quantity: 1, unit: 'each' }));
}

test('names: synonyms stay apart, brands and cuts match the old way', () => {
  assert.ok(!expandSynonymKeys('garlic').some((k) => k.includes('rice')), 'garlic should not expand to rice synonyms');
  assert.ok(fuzzyNameScore('Skippy Peanut Butter', 'peanut butter') >= 0.72);
  for (const [a, b] of [
    ['pepper', 'Peppercorn jus'],
    ['pepper', 'Peppercorns'],
    ['apple', 'pineapple'],
    ['rice', 'ice'],
    ['chicken breast', 'Chicken broth'],
    ['rice', 'Rice vinegar'],
    ['Bell pepper', 'pepper'],
    ['White pepper', 'bell pepper'],
  ] as const) {
    assert.ok(fuzzyNameScore(a, b) < 0.72, `${a} must not match ${b}`);
  }
  assert.equal(canonicalIngredientPhrase('Boneless chicken breast 2 lb'), 'chicken breast');
  assert.ok(ingredientMatchScore('chicken breast', 'Boneless chicken breast 2 lb') >= 0.72);
  assert.ok(ingredientMatchScore('chicken breast', 'chicken') < 0.72, 'generic chicken does not cover chicken breast');
  assert.ok(ingredientMatchScore('chicken breast', 'chicken thigh') < 0.72);
  assert.ok(ingredientMatchScore('chicken', 'chicken breast') >= 0.72, 'specific covers generic');
  assert.ok(ingredientMatchScore('ground beef', 'beef') < 0.72);
  assert.ok(ingredientMatchScore('beef', 'ground beef') >= 0.72);
  assert.ok(ingredientMatchScore('cheddar', 'cheese') < 0.72);
  assert.ok(ingredientMatchScore('cheese', 'cheddar') >= 0.72);
  assert.ok(ingredientMatchScore('cheddar', 'mozzarella') < 0.72);
  assert.ok(ingredientMatchScore('diced tomatoes', 'tomato paste') < 0.72);
  assert.ok(ingredientMatchScore('diced tomatoes', 'ketchup') < 0.72);
  assert.ok(ingredientMatchScore('tomatoes', 'canned diced tomatoes') >= 0.72);
  assert.ok(ingredientMatchScore('olives', 'black olives') >= 0.72);
  assert.ok(ingredientMatchScore('onion', 'chopped onion') >= 0.72);
  assert.ok(ingredientMatchScore('Black beans', 'canned beans') >= 0.72, 'canned beans cover a black beans line');
});

test('staples are assumed and not counted', () => {
  for (const name of ['Salt', 'black pepper', 'Water', 'warm water', 'olive oil', 'Ice']) {
    assert.ok(isPantryStaple(name, slug(name)), `${name} is a staple`);
  }
  for (const name of ['Bell pepper', 'Coconut water', 'Sesame oil dressing', 'Rice']) {
    assert.ok(!isPantryStaple(name, slug(name)), `${name} is not a staple`);
  }
  const match = scoreRecipeAgainstPantry(
    { id: 'r', name: 'R', ingredients: [
      { ingredientId: 'salt', name: 'Salt', quantity: 1, unit: 'tsp' },
      { ingredientId: 'rice', name: 'Rice', quantity: 1, unit: 'cup' },
    ] },
    pantryFrom(['Rice']),
  );
  assert.equal(match.totalIngredients, 1);
  assert.equal(match.staples.length, 1);
  assert.deepEqual(match.lines.map((l) => l.status), ['staple', 'have']);
});

test('flow pantry shows about 1 to 4 recipes, lemon herb chicken among them, no shrimp for chicken', () => {
  const pantry = pantryFrom(['chicken breast', 'jasmine rice', 'onion', 'garlic', 'bell pepper']);
  const { ranked } = buildPantryMatchIndex(recipes, pantry);
  const shown = filterRankedMatches(ranked, 'all', 50, { minMatchedCount: 2, pantryItemCount: pantry.length });
  assert.ok(shown.length >= 1 && shown.length <= 4, `got ${shown.length}`);
  assert.ok(shown.some((m) => m.recipeName.includes('Lemon Herb Chicken')));
  assert.ok(
    !shown.some((m) => m.matched.some((row) => row.matchedPantryItem.name === 'chicken breast' && row.ingredient.name.toLowerCase().includes('shrimp'))),
  );
});

test('a realistic 25-item pantry and the guest QA pantry surface recipes', () => {
  const realistic = pantryFrom([
    'Boneless chicken breast 2 lb', 'Jasmine rice 5 lb bag', 'Yellow onion 3 lb', 'Garlic bulb', 'Bell peppers tri-color',
    'Broccoli crowns', 'Ground beef 93% lean 1 lb', 'Shredded cheddar cheese 8 oz', 'Large eggs dozen', 'Whole milk gallon',
    'Sour cream 16 oz', 'Tortillas flour 10 ct', 'Black beans canned', 'Diced tomatoes 14.5 oz', 'Chicken broth 32 oz',
    'Olive oil', 'Salt', 'Black pepper grinder', 'Pasta penne 16 oz', 'Marinara sauce jar', 'Lemons bag', 'Limes',
    'Fresh cilantro bunch', 'Romaine lettuce head', 'Greek yogurt plain',
  ]);
  const shown = filterRankedMatches(buildPantryMatchIndex(recipes, realistic).ranked, 'all', 0, {
    minMatchedCount: 2,
    pantryItemCount: realistic.length,
  });
  assert.ok(shown.length >= 1);
  assert.ok(shown.some((m) => m.recipeName.includes('Lemon Herb Chicken')));

  const guest = pantryFrom(['boneless chicken breast 2 lb', 'rice', 'broccoli']);
  const guestShown = filterRankedMatches(buildPantryMatchIndex(recipes, guest).ranked, 'all', 0, {
    minMatchedCount: 2,
    pantryItemCount: guest.length,
  });
  assert.ok(guestShown.length >= 1);
});

test('quantities: rice in pounds covers cups, broccoli missing, one egg does not cover six', () => {
  const lemon = recipes.find((r) => r.id === 'lemon-chicken')!;
  const pantry = ([
    ['chicken breast', 2, 'lb'],
    ['jasmine rice', 5, 'lb'],
    ['onion', 3, 'each'],
    ['garlic', 1, 'each'],
    ['bell pepper', 2, 'each'],
  ] as const).map(([name, quantity, unit], i) => ({ id: `p${i}`, ingredientId: name.replace(/ /g, '-'), name, quantity, unit }));
  const match = scoreRecipeAgainstPantry(lemon, pantry);
  assert.ok(match.missing.some((m) => m.name.toLowerCase().includes('broccoli')), 'broccoli is missing');
  assert.ok(!match.missing.some((m) => m.name.toLowerCase().includes('rice')), 'rice cups covered by rice in lb');

  const eggs = scoreRecipeAgainstPantry(
    { id: 'egg', name: 'Eggs', ingredients: [{ name: 'Eggs', ingredientId: 'eggs', quantity: 6, unit: 'each' }] },
    [{ id: 'e', ingredientId: 'eggs', name: 'Eggs', quantity: 1, unit: 'each' }],
  );
  assert.equal(eggs.missingCount, 1);
  assert.equal(eggs.missing[0]!.quantity, 5);
  const line = eggs.lines[0]!;
  assert.equal(line.status, 'missing');
  assert.ok(line.status === 'missing' && line.short && line.need === 5);

  const yolks = scoreRecipeAgainstPantry(
    { id: 'y', name: 'Yolks', ingredients: [{ name: 'Egg yolks', ingredientId: 'egg-yolk', quantity: 2, unit: 'each' }] },
    [{ id: 'e', ingredientId: 'eggs', name: 'Eggs', quantity: 12, unit: 'each' }],
  );
  assert.equal(yolks.missingCount, 0, 'egg yolks come out of whole eggs');
});

test('scan-style staples pantry: strict filter finds nothing, partial fallback shows overlaps', () => {
  const pantry = pantryFrom(['canned beans', 'pasta', 'rice', 'tomato sauce', 'peanut butter', 'cereal', 'broth', 'tuna', 'oats', 'flour', 'sugar']);
  const { ranked } = buildPantryMatchIndex(recipes, pantry);
  const strict = filterRankedMatches(ranked, 'all', 50, { minMatchedCount: 2, pantryItemCount: pantry.length });
  const visible = filterRankedMatchesWithPartialFallback(ranked, 'best_match', 50, { minMatchedCount: 2, pantryItemCount: pantry.length });
  assert.equal(strict.length, 0);
  assert.ok(visible.matches.length >= 1);
  assert.ok(visible.usedPartialFallback);
  assert.ok(visible.matches.every((m) => m.matchedCount >= 1));
});

test('empty pantry ranks nothing; filters return nothing', () => {
  const index = buildPantryMatchIndex(recipes, []);
  assert.equal(index.ranked.length, 0);
  assert.equal(index.byRecipeId.size, recipes.length);
  assert.deepEqual(filterRankedMatchesWithPartialFallback(index.ranked, 'all', 0, { pantryItemCount: 0 }), {
    matches: [],
    usedPartialFallback: false,
  });
});

test('ranking order: percent, then matched count, then fewest missing, then name', () => {
  const base = { recipeId: '', totalIngredients: 4, matched: [], missing: [], staples: [], lines: [] };
  const rows = [
    { ...base, recipeId: 'b', recipeName: 'B', matchedCount: 2, missingCount: 2, percentMatch: 50 },
    { ...base, recipeId: 'a', recipeName: 'A', matchedCount: 2, missingCount: 2, percentMatch: 50 },
    { ...base, recipeId: 'c', recipeName: 'C', matchedCount: 3, missingCount: 1, percentMatch: 75 },
    { ...base, recipeId: 'd', recipeName: 'D', matchedCount: 2, missingCount: 0, percentMatch: 100 },
  ];
  assert.deepEqual([...rows].sort(compareRecipePantryMatches).map((r) => r.recipeId), ['d', 'c', 'a', 'b']);
  const filtered = filterRankedMatches(rows, 'have_all', 0);
  assert.deepEqual(filtered.map((r) => r.recipeId), ['d']);
  assert.deepEqual(filterRankedMatches(rows, 'missing_1_2', 0).map((r) => r.recipeId).sort(), ['a', 'b', 'c']);
});

test('ranking: a small recipe the pantry fully covers beats a long recipe it half covers', () => {
  const line = (name: string) => ({ ingredientId: slug(name), name, quantity: 1, unit: 'each' });
  const small: MatchRecipe = { id: 'small', name: 'Small', ingredients: ['Eggs', 'Cheddar', 'Tortillas'].map(line) };
  const long: MatchRecipe = {
    id: 'long',
    name: 'Aaa Long',
    ingredients: ['Eggs', 'Cheddar', 'Tortillas', 'Salsa', 'Avocado', 'Cilantro'].map(line),
  };
  const pantry = pantryFrom(['Eggs', 'Cheddar', 'Tortillas']);
  const { ranked } = buildPantryMatchIndex([long, small], pantry, new Date(2026, 9, 16));
  assert.deepEqual(ranked.map((m) => m.recipeId), ['small', 'long']);
});

test('ranking: use-by within 3 days lifts a recipe; past dates and far dates do not', () => {
  const line = (name: string) => ({ ingredientId: slug(name), name, quantity: 1, unit: 'each' });
  const a: MatchRecipe = { id: 'a', name: 'A dish', ingredients: ['Eggs', 'Cheddar', 'Tortillas', 'Salsa'].map(line) };
  const b: MatchRecipe = { id: 'b', name: 'B dish', ingredients: ['Chicken', 'Rice', 'Peas', 'Carrots'].map(line) };
  const now = new Date(2026, 9, 16); // Fri Oct 16, 2026
  const pantryWith = (expiresOn: string | null) => [
    ...pantryFrom(['Eggs', 'Cheddar', 'Tortillas']).map((p) => ({ ...p, expiresOn: null as string | null })),
    ...pantryFrom(['Chicken', 'Rice', 'Peas']).map((p, i) => ({ ...p, id: `q${i}`, expiresOn: i === 0 ? expiresOn : null })),
  ];
  const order = (expiresOn: string | null) =>
    buildPantryMatchIndex([a, b], pantryWith(expiresOn), now).ranked.map((m) => m.recipeId).join('');
  assert.equal(order(null), 'ab', 'tie on percent falls back to name');
  assert.equal(order('2026-10-16'), 'ba', 'due today lifts B');
  assert.equal(order('2026-10-19'), 'ba', 'due in 3 days lifts B');
  assert.equal(order('2026-10-20'), 'ab', 'due in 4 days does not');
  assert.equal(order('2026-10-15'), 'ab', 'already past does not');
  assert.equal(order('not a date'), 'ab', 'bad date does not');
  const b1 = buildPantryMatchIndex([b], pantryWith('2026-10-16'), now).ranked[0]!;
  assert.equal(b1.expiringSoonCount, 1);
  assert.equal(b1.rankScore, b1.percentMatch + 10);
});

test('ranking: the use-it-up bonus is capped at two items', () => {
  const line = (name: string) => ({ ingredientId: slug(name), name, quantity: 1, unit: 'each' });
  const r: MatchRecipe = { id: 'r', name: 'R', ingredients: ['Eggs', 'Cheddar', 'Tortillas', 'Salsa'].map(line) };
  const now = new Date(2026, 9, 16);
  const pantry = pantryFrom(['Eggs', 'Cheddar', 'Tortillas']).map((p) => ({ ...p, expiresOn: '2026-10-17' as string | null }));
  const m = buildPantryMatchIndex([r], pantry, now).ranked[0]!;
  assert.equal(m.expiringSoonCount, 3);
  assert.equal(m.rankScore, m.percentMatch + 20);
});

test('units: families convert, distinct count units do not, ingredient bridges', () => {
  assert.equal(Math.round(convertQuantity(1, 'lb', 'oz')! * 100) / 100, 16);
  assert.equal(convertQuantity(1, 'dozen', 'each'), 12);
  assert.equal(convertQuantity(1, 'can', 'each'), null);
  assert.ok(unitsAreConvertible('cup', 'tbsp'));
  assert.ok(!unitsAreConvertible('cup', 'g'));
  assert.equal(convertIngredientQuantity(1, 'head', 'cloves', 'garlic'), 10);
  assert.equal(convertIngredientQuantity(2, 'lb', 'cup', 'jasmine rice'), 5);
  assert.equal(convertIngredientQuantity(1, 'stick', 'tbsp', 'butter'), 8);
  assert.ok(ingredientUnitsConvertible('eggs', 'large', 'each'));
  assert.ok(!ingredientUnitsConvertible('peanut butter', 'stick', 'tbsp'));
  assert.equal(totalPantryQuantityInUnit([{ id: 'a', ingredientId: 'garlic', name: 'Garlic', quantity: 1, unit: 'head' }], 'clove', 'garlic'), 10);
  assert.equal(totalPantryQuantityInUnit([{ id: 'a', ingredientId: 'flour', name: 'Flour', quantity: 1, unit: 'bag' }], 'cup'), null);
});
