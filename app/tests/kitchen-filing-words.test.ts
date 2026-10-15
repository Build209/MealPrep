/// <reference types="node" />
// Filing words: category guessing matches whole words, not substrings (2026-10-15 bug:
// "peppermint" was filed as a spice because it contains "pepper"). Each row is a name and the
// aisle it should land in; the comment says which substring used to misfile it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferGroceryCategoryFromName } from '../src/kitchen/categorize';
import { filingWords, textHasPhrase } from '../src/kitchen/filingWords';
import { manualGroceryFields } from '../src/kitchen/groceryAisles';
import { ingredientUnitsConvertible } from '../src/kitchen/ingredientUnits';
import { fileScannedItem } from '../src/kitchen/scanFiling';

const CASES: ReadonlyArray<readonly [name: string, category: string]> = [
  // A word inside another word no longer counts.
  ['peppermint', 'dry_goods'], // pepper → spices
  ['peppermint tea', 'dry_goods'],
  ['eggplant', 'produce'], // egg
  ['buttermilk', 'dairy'],
  ['butternut squash', 'produce'], // butter → dairy
  ['unsalted butter', 'dairy'], // salt → spices
  ['salted butter', 'dairy'],
  ['saltines', 'dry_goods'],
  ['graham crackers', 'dry_goods'], // ham → meats
  ['champagne', 'dry_goods'], // ham → meats
  ['chamomile tea', 'dry_goods'], // ham → meats
  ['goats milk', 'dairy'], // oats → dry goods
  ['honeydew melon', 'produce'], // honey → dry goods
  ['honeycrisp apples', 'produce'], // honey → dry goods
  ['beefsteak tomatoes', 'produce'], // beef / steak → meats
  ['grapeseed oil', 'condiments'], // grape → produce
  ['aluminum foil', 'dry_goods'], // oil
  ['tea', 'dry_goods'],
  ['steak', 'meats'], // tea
  ['goldfish crackers', 'dry_goods'], // fish → meats
  ['cornbread', 'dry_goods'], // corn
  ['popcorn', 'dry_goods'],
  // Compound words that used to match by luck still land right.
  ['pineapple', 'produce'],
  ['crabapple', 'produce'],
  ['grapefruit', 'produce'],
  ['oatmilk', 'dairy'],
  ['cornstarch', 'dry_goods'],
  ['strawberries', 'produce'],
  ['blackberries', 'produce'],
  ['catfish fillets', 'meats'],
  // Plurals of listed words.
  ['eggs', 'dairy'],
  ['large eggs', 'dairy'],
  ['bananas', 'produce'],
  ['potatoes', 'produce'],
  ['corn tortillas', 'dry_goods'],
  ['hot dogs', 'meats'],
  ['peppercorns', 'spices'],
  // Names two lists fight over (exceptions list).
  ['ice cream', 'frozen'], // cream → dairy
  ['heavy cream', 'dairy'],
  ['cream of mushroom soup', 'dry_goods'], // cream → dairy
  ["Campbell's Cream of Chicken", 'dry_goods'], // chicken → meats
  ['chicken noodle soup', 'dry_goods'],
  ['cream of tartar', 'spices'],
  ['coconut milk', 'dry_goods'], // milk → dairy
  ['evaporated milk', 'dry_goods'],
  ['peanut butter', 'dry_goods'], // butter → dairy
  ['apple butter', 'dry_goods'],
  ['applesauce', 'dry_goods'], // apple → produce
  ['apple', 'produce'],
  ['oat milk', 'dairy'], // oats → dry goods
  ['oats', 'dry_goods'],
  ['rice vinegar', 'condiments'], // rice → dry goods
  ['rice', 'dry_goods'],
  ['apple cider vinegar', 'condiments'],
  ['chicken broth', 'dry_goods'], // chicken → meats
  ['chicken', 'meats'],
  ['hot dog buns', 'dry_goods'], // hot dog → meats
  ['hamburger buns', 'dry_goods'], // ham → meats
  ['hamburger', 'meats'],
  ['corn starch', 'dry_goods'],
  ['corn', 'produce'],
  ['candy corn', 'dry_goods'],
  ['ginger ale', 'dry_goods'], // ginger → produce
  ['fresh ginger', 'produce'],
  ['ground ginger', 'spices'],
  ['steak sauce', 'condiments'], // steak → meats
  ['fish sauce', 'condiments'], // fish → meats
  ['salt pork', 'meats'], // salt → spices
  ['salt', 'spices'],
  ['milk chocolate', 'dry_goods'], // milk → dairy
  ['chocolate milk', 'dairy'],
  ['butter lettuce', 'produce'], // butter → dairy
  ['sugar snap peas', 'produce'], // sugar → dry goods
  ['mustard greens', 'produce'], // mustard → condiments
  ['bread and butter pickles', 'condiments'],
  ['coffee creamer', 'dairy'], // coffee → dry goods
  ['egg noodles', 'dry_goods'],
  ['olive oil', 'condiments'],
];

test('category guessing matches whole words (table)', () => {
  assert.ok(CASES.length >= 40);
  for (const [name, category] of CASES) {
    assert.equal(inferGroceryCategoryFromName(name), category, name);
  }
});

test('word matcher: whole words, singular or plural', () => {
  assert.deepEqual(filingWords('Red Bell-Peppers'), ['red', 'bell', 'pepper']);
  assert.deepEqual(filingWords('blueberries, tomatoes & beans'), ['blueberry', 'tomato', 'bean']);
  assert.equal(textHasPhrase('bell peppers', 'pepper'), true);
  assert.equal(textHasPhrase('peppermint', 'pepper'), false);
  assert.equal(textHasPhrase('unsalted butter', 'salt'), false);
  assert.equal(textHasPhrase('aluminum foil', 'oil'), false);
  assert.equal(textHasPhrase('sugar snap peas', 'snap pea'), true);
  assert.equal(textHasPhrase('hummus', 'hummu'), false, 'singular words ending in -us stay whole');
});

test('grocery aisles and scan filing use the same matcher', () => {
  assert.equal(manualGroceryFields({ name: 'peppermint', quantity: 1, unit: '' }).category, 'dry_goods');
  assert.equal(manualGroceryFields({ name: 'eggplant', quantity: 1, unit: '' }).category, 'produce');
  assert.equal(manualGroceryFields({ name: 'graham crackers', quantity: 1, unit: 'box' }).category, 'dry_goods');
  // A scan the model wrongly called cookware is re-guessed from its name.
  const scanned = fileScannedItem({ name: 'peppermint candy', unit: 'bag', category: 'cookware', storage: 'pantry' }, 'pantry');
  assert.deepEqual(scanned, { category: 'dry_goods', storage: 'pantry' });
});

test('unit bridges match whole words (butter sticks, egg sizes)', () => {
  assert.equal(ingredientUnitsConvertible('butter', 'stick', 'cup'), true);
  assert.equal(ingredientUnitsConvertible('unsalted butter', 'stick', 'tbsp'), true);
  assert.equal(ingredientUnitsConvertible('butternut squash', 'stick', 'cup'), false);
  assert.equal(ingredientUnitsConvertible('buttermilk', 'stick', 'cup'), false);
  assert.equal(ingredientUnitsConvertible('almond butter', 'stick', 'cup'), false);
  assert.equal(ingredientUnitsConvertible('large eggs', 'large', 'cup'), true);
  assert.equal(ingredientUnitsConvertible('roasted eggplant', 'large', 'cup'), false);
});
