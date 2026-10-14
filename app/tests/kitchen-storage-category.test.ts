/// <reference types="node" />
// Cases from the old app's mobile/scripts/grocery-categorize-check.ts, grocery-regression.ts,
// retest-fixes-b-check.ts, simweek-smaller-bugs-check.ts and pantry-scan-restock-regression.ts,
// plus the place rules in mobile/config/pantryStorage.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferGroceryCategoryFromName } from '../src/kitchen/categorize';
import { CATEGORY_LABELS, normalizePantryCategory, PANTRY_CATEGORIES } from '../src/kitchen/categories';
import {
  labelForPantryStorageLocation,
  normalizePantryStorageLocation,
  PANTRY_STORAGE_LOCATIONS,
  parseVisionStorageField,
  previewResortFromDefaultPantry,
  suggestStorageLocationForCategory,
  suggestStorageLocationForPantryItem,
} from '../src/kitchen/storage';

test('category from a name (grocery-categorize-check)', () => {
  for (const name of ['rice', 'brown rice', 'pasta', 'spaghetti', 'oats', 'flour', 'black beans', 'lentils', 'quinoa']) {
    assert.equal(inferGroceryCategoryFromName(name), 'dry_goods', `${name} → dry_goods`);
  }
  assert.equal(inferGroceryCategoryFromName('chicken breast'), 'meats');
  assert.equal(inferGroceryCategoryFromName('milk'), 'dairy');
  assert.equal(inferGroceryCategoryFromName('frozen peas'), 'frozen');
  assert.equal(inferGroceryCategoryFromName('soy sauce'), 'condiments');
  assert.equal(inferGroceryCategoryFromName('cumin'), 'spices');
  assert.equal(inferGroceryCategoryFromName('spinach'), 'produce');
});

test('category from a name (grocery-regression, retest-fixes-b)', () => {
  assert.equal(inferGroceryCategoryFromName('rice'), 'dry_goods');
  assert.equal(inferGroceryCategoryFromName('pasta'), 'dry_goods');
  assert.equal(inferGroceryCategoryFromName('black beans'), 'dry_goods');
  assert.equal(inferGroceryCategoryFromName('spinach'), 'produce');
  assert.equal(inferGroceryCategoryFromName('chicken thighs'), 'meats');
  assert.equal(inferGroceryCategoryFromName('heavy cream'), 'dairy');
  assert.equal(inferGroceryCategoryFromName('carrots'), 'produce');
  assert.equal(inferGroceryCategoryFromName(''), 'dry_goods', 'empty name falls back to dry goods');
});

test('stored categories are read safely', () => {
  assert.equal(PANTRY_CATEGORIES.length, Object.keys(CATEGORY_LABELS).length);
  assert.equal(normalizePantryCategory('dairy'), 'dairy');
  assert.equal(normalizePantryCategory(' Produce '), 'produce');
  assert.equal(normalizePantryCategory('Grains'), 'dry_goods');
  assert.equal(normalizePantryCategory(null), 'dry_goods');
});

test('places and labels', () => {
  assert.deepEqual([...PANTRY_STORAGE_LOCATIONS], ['pantry', 'fridge', 'spice_rack']);
  assert.equal(labelForPantryStorageLocation('fridge'), 'Fridge');
  assert.equal(labelForPantryStorageLocation('pantry'), 'Pantry');
  assert.equal(labelForPantryStorageLocation('spice_rack'), 'Spice rack');
});

test('stored and old free-text places map to the three places', () => {
  assert.equal(normalizePantryStorageLocation(null), 'pantry');
  assert.equal(normalizePantryStorageLocation(''), 'pantry');
  assert.equal(normalizePantryStorageLocation('Pantry'), 'pantry');
  assert.equal(normalizePantryStorageLocation('fridge'), 'fridge');
  assert.equal(normalizePantryStorageLocation('Refrigerator'), 'fridge');
  assert.equal(normalizePantryStorageLocation('top shelf of the fridge'), 'fridge');
  assert.equal(normalizePantryStorageLocation('spice_rack'), 'spice_rack');
  assert.equal(normalizePantryStorageLocation('Spice rack'), 'spice_rack');
  assert.equal(normalizePantryStorageLocation('garage'), 'pantry');
  assert.equal(parseVisionStorageField('spice rack'), 'spice_rack');
  assert.equal(parseVisionStorageField('garage'), undefined);
  assert.equal(parseVisionStorageField(3), undefined);
});

test('place from category (pantry-scan-restock-regression)', () => {
  assert.equal(suggestStorageLocationForCategory('frozen'), 'fridge', 'frozen items default to fridge');
  assert.equal(suggestStorageLocationForCategory('dairy'), 'fridge', 'dairy defaults to fridge');
  assert.equal(suggestStorageLocationForCategory('meats'), 'fridge', 'meats default to fridge');
  assert.equal(suggestStorageLocationForCategory('dry_goods'), 'pantry', 'dry goods default to pantry');
  assert.equal(suggestStorageLocationForCategory('spices'), 'spice_rack');
});

test('place from name and category (retest-fixes-b, simweek-smaller-bugs)', () => {
  assert.equal(suggestStorageLocationForPantryItem('chicken thighs', 'meats'), 'fridge');
  assert.equal(suggestStorageLocationForPantryItem('heavy cream', 'dairy'), 'fridge');
  assert.equal(suggestStorageLocationForPantryItem('Heavy cream', 'dairy'), 'fridge');
  assert.equal(suggestStorageLocationForPantryItem('Yellow onion', 'produce'), 'pantry');
  assert.equal(suggestStorageLocationForPantryItem('Garlic', 'produce'), 'pantry');
  assert.equal(suggestStorageLocationForPantryItem('Potatoes', 'produce'), 'pantry');
  assert.equal(suggestStorageLocationForPantryItem('Smoked paprika', 'dry_goods'), 'spice_rack');
  assert.equal(suggestStorageLocationForPantryItem('Ketchup', 'condiments'), 'fridge');
  assert.equal(suggestStorageLocationForPantryItem('Peanut butter', 'condiments'), 'pantry');
});

test('re-sort preview only counts default-pantry rows', () => {
  const preview = previewResortFromDefaultPantry([
    { name: 'Milk', category: 'dairy', location: 'pantry' },
    { name: 'Cumin', category: 'spices', location: 'pantry' },
    { name: 'Rice', category: 'dry_goods', location: 'pantry' },
    { name: 'Cheese', category: 'dairy', location: 'fridge' },
  ]);
  assert.deepEqual(preview, { total: 2, toFridge: 1, toSpiceRack: 1 });
});
