/// <reference types="node" />
// Allergen detection from ingredient names: matches, false positives, and the "free"/vegan cancels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAllergens, recipeAllergenStatus } from '../src/allergens/detect';
import { ALLERGEN_KEYS, ALLERGEN_LABELS, cleanAllergens } from '../src/allergens/types';

const d = (...names: string[]) => detectAllergens(names);

test('keys and labels match the contract', () => {
  assert.deepEqual([...ALLERGEN_KEYS], ['milk', 'eggs', 'fish', 'shellfish', 'tree-nuts', 'peanuts', 'wheat', 'soy', 'sesame']);
  assert.equal(ALLERGEN_LABELS['tree-nuts'], 'Tree nuts');
  assert.deepEqual(cleanAllergens(['soy', 'bogus', 'milk', 'soy', 7]), ['milk', 'soy']);
});

test('milk: dairy words and plurals', () => {
  for (const n of ['whole milk', 'Butter, softened', '2 cups shredded cheese', 'heavy cream', 'Greek yogurt', 'whey protein', 'casein', 'ghee', 'buttermilk', 'parmesan', 'cream cheese', 'ice cream', 'cheeses', 'crème fraîche', 'sour cream']) {
    assert.deepEqual(d(n), ['milk'], n);
  }
});

test('milk false positives: plant milks and butters, butternut, buttercup, cream of tartar', () => {
  assert.deepEqual(d('almond milk'), ['tree-nuts']);
  assert.deepEqual(d('unsweetened almond milk'), ['tree-nuts']);
  assert.deepEqual(d('coconut milk'), []);
  assert.deepEqual(d('coconut cream'), []);
  assert.deepEqual(d('cream of coconut'), []);
  assert.deepEqual(d('oat milk'), []);
  assert.deepEqual(d('rice milk'), []);
  assert.deepEqual(d('soy milk'), ['soy']);
  assert.deepEqual(d('peanut butter'), ['peanuts']);
  assert.deepEqual(d('almond butter'), ['tree-nuts']);
  assert.deepEqual(d('cocoa butter'), []);
  assert.deepEqual(d('apple butter'), []);
  assert.deepEqual(d('cashew cheese'), ['tree-nuts']);
  assert.deepEqual(d('butternut squash'), []);
  assert.deepEqual(d('buttercup squash'), []);
  assert.deepEqual(d('butter lettuce'), []);
  assert.deepEqual(d('cream of tartar'), []);
  assert.deepEqual(d('vegan butter'), []);
  assert.deepEqual(d('dairy-free cheese'), []);
});

test('eggs', () => {
  assert.deepEqual(d('2 large eggs, beaten'), ['eggs']);
  assert.deepEqual(d('mayonnaise'), ['eggs']);
  assert.deepEqual(d('meringue'), ['eggs']);
  assert.deepEqual(d('egg noodles'), ['eggs', 'wheat']);
  assert.deepEqual(d('eggplant'), []);
  assert.deepEqual(d('flax egg'), []);
  assert.deepEqual(d('egg-free mayo'), []);
});

test('fish and shellfish', () => {
  for (const n of ['salmon fillet', 'canned tuna', 'cod', 'anchovies', 'anchovy paste', 'sardines', 'fish sauce', 'Worcestershire sauce']) {
    assert.deepEqual(d(n), ['fish'], n);
  }
  for (const n of ['shrimp', 'shrimps', 'jumbo prawns', 'lump crab', 'lobster tail', 'scallops', 'clams', 'mussels', 'oysters', 'oyster sauce', 'squid']) {
    assert.deepEqual(d(n), ['shellfish'], n);
  }
  assert.deepEqual(d('oyster mushrooms'), []);
  assert.deepEqual(d('crab apple'), []);
  assert.deepEqual(d('goldfish crackers'), []);
});

test('tree nuts: the listed nuts, pine nuts decided in, coconut and nutmeg out', () => {
  for (const n of ['almonds', 'walnuts', 'pecans', 'cashews', 'pistachios', 'hazelnuts', 'macadamia nuts', 'pine nuts', 'brazil nuts', 'chopped nuts', 'chestnuts', 'marzipan']) {
    assert.deepEqual(d(n), ['tree-nuts'], n);
  }
  assert.deepEqual(d('mixed nuts'), ['tree-nuts', 'peanuts']);
  assert.deepEqual(d('shredded coconut'), []);
  assert.deepEqual(d('coconut'), []);
  assert.deepEqual(d('nutmeg'), []);
  assert.deepEqual(d('ground nutmeg'), []);
  assert.deepEqual(d('water chestnuts'), []);
  assert.deepEqual(d('doughnut'), []);
  assert.deepEqual(d('nut-free granola'), []);
});

test('peanuts', () => {
  assert.deepEqual(d('peanuts'), ['peanuts']);
  assert.deepEqual(d('peanut butter'), ['peanuts']);
  assert.deepEqual(d('peanut oil'), ['peanuts']);
  assert.deepEqual(d('peanut-free sunflower butter'), []);
});

test('wheat', () => {
  for (const n of ['2 cups all-purpose flour', 'bread flour', 'whole wheat flour', 'bread', 'breadcrumbs', 'panko', 'spaghetti', 'pasta', 'couscous', 'semolina', 'bulgur', 'seitan', 'egg-free noodles', 'flour tortillas']) {
    assert.ok(d(n).includes('wheat'), n);
  }
  assert.deepEqual(d('almond flour'), ['tree-nuts']);
  assert.deepEqual(d('coconut flour'), []);
  assert.deepEqual(d('rice flour'), []);
  assert.deepEqual(d('cornflour'), []);
  assert.deepEqual(d('chickpea flour'), []);
  assert.deepEqual(d('rice noodles'), []);
  assert.deepEqual(d('rice pasta'), []);
  assert.deepEqual(d('gluten-free flour'), []);
  assert.deepEqual(d('gluten free pasta'), []);
  assert.deepEqual(d('breadfruit'), []);
  assert.deepEqual(d('barley'), []);
});

test('soy and sesame', () => {
  for (const n of ['soy sauce', 'tofu', 'edamame', 'miso paste', 'tempeh', 'soybeans', 'tamari']) assert.deepEqual(d(n), ['soy'], n);
  for (const n of ['sesame seeds', 'sesame oil', 'tahini']) assert.deepEqual(d(n), ['sesame'], n);
  assert.deepEqual(d('soy-free sauce'), []);
});

test('plain ingredients match nothing', () => {
  assert.deepEqual(d('chicken breast', 'olive oil', 'salt', 'black pepper', 'garlic', 'peas', 'rice', 'tomatoes', 'cornstarch', 'oats'), []);
  assert.deepEqual(d(), []);
  assert.deepEqual(d(''), []);
});

test('several ingredients give each allergen once, in the fixed order', () => {
  assert.deepEqual(d('peanuts', 'butter', 'milk', 'tofu', 'shrimp'), ['milk', 'shellfish', 'peanuts', 'soy']);
});

test('recipeAllergenStatus returns only the user allergens that match', () => {
  const recipe = { ingredients: [{ name: 'peanut butter' }, { name: 'milk' }, { name: 'bread' }] };
  assert.deepEqual(recipeAllergenStatus(recipe, ['peanuts', 'milk']), ['milk', 'peanuts']);
  assert.deepEqual(recipeAllergenStatus(recipe, ['fish', 'soy']), []);
  assert.deepEqual(recipeAllergenStatus(recipe, []), []);
});
