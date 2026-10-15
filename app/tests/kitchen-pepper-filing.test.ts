/// <reference types="node" />
// Peppers: fresh ones go to produce, dried / ground ones stay spices (2026-10-15 bug: "bell pepper"
// was filed as a spice because "pepper" is on the spice list and spices are checked first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferGroceryCategoryFromName } from '../src/kitchen/categorize';

function expectAll(category: string, names: string[]) {
  for (const name of names) assert.equal(inferGroceryCategoryFromName(name), category, name);
}

test('fresh peppers and chiles are produce', () => {
  expectAll('produce', [
    'bell pepper',
    'Red Bell Peppers',
    '2 large green bell peppers, diced',
    'red pepper',
    'yellow peppers',
    'jalapeño pepper',
    'jalapeno peppers',
    'Jalapeños',
    'poblano',
    'poblano peppers',
    'serrano pepper',
    'habanero',
    'banana peppers',
    'sweet mini peppers',
    'green chile peppers',
    'shishito peppers',
    'roasted red peppers',
  ]);
});

test('dried and ground pepper stays a spice', () => {
  expectAll('spices', [
    'pepper',
    'black pepper',
    'freshly ground black pepper',
    'ground pepper',
    'cracked pepper',
    'peppercorns',
    'Sichuan peppercorns',
    'red pepper flakes',
    'crushed red pepper',
    'cayenne pepper',
    'white pepper',
    'lemon pepper',
    'salt and pepper',
    'salt',
    'kosher salt',
  ]);
});

test('pepper names that are not peppers', () => {
  assert.equal(inferGroceryCategoryFromName('pepper jack'), 'dairy');
  assert.equal(inferGroceryCategoryFromName('Pepper Jack cheese'), 'dairy');
  assert.equal(inferGroceryCategoryFromName('pepperoni'), 'meats');
  assert.equal(inferGroceryCategoryFromName('serrano ham'), 'meats');
});

test('"unsalted" / "salted" butter is dairy, not a spice', () => {
  assert.equal(inferGroceryCategoryFromName('unsalted butter'), 'dairy');
  assert.equal(inferGroceryCategoryFromName('salted butter'), 'dairy');
});
