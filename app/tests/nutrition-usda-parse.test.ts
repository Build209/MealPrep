/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBestFood, per100gFromNutrients } from '../src/nutrition/usdaParse';
import { DETAIL_SHAPE, FOUNDATION_ATWATER, KJ_ONLY, SEARCH } from './fixtures/usda/search-fixtures';

test('picks the raw food over cooked or canned variants', () => {
  const best = pickBestFood('chicken breast', SEARCH['chicken breast']);
  assert.equal(best?.fdcId, 171077);
  assert.deepEqual(best?.per100g, { kcal: 120, proteinG: 22.5, fatG: 2.6, carbsG: 0 });
});

test('prefers raw whole egg over hard-boiled', () => {
  assert.equal(pickBestFood('egg', SEARCH.egg)?.fdcId, 171287);
});

test('matches on the leading word of USDA names and ignores unrelated results', () => {
  assert.equal(pickBestFood('all-purpose flour', SEARCH['all-purpose flour'])?.fdcId, 169761);
  assert.equal(pickBestFood('olive oil', SEARCH['olive oil'])?.fdcId, 171413);
});

test('returns null when nothing shares a word with the ingredient', () => {
  assert.equal(pickBestFood('dragon fruit puree', SEARCH['dragon fruit puree']), null);
});

test('skips a food missing a macro instead of treating it as zero', () => {
  assert.equal(pickBestFood('mystery flour', SEARCH['mystery flour']), null);
});

test('reads Atwater energy when 1008 is absent', () => {
  assert.deepEqual(per100gFromNutrients(FOUNDATION_ATWATER), { kcal: 62, proteinG: 3.2, fatG: 3.5, carbsG: 4.9 });
});

test('converts kJ-only energy to kcal', () => {
  const r = per100gFromNutrients(KJ_ONLY);
  assert.ok(r);
  assert.ok(Math.abs(r.kcal - 100) < 0.01);
});

test('reads the nested detail shape', () => {
  assert.deepEqual(per100gFromNutrients(DETAIL_SHAPE), { kcal: 120, proteinG: 22.5, fatG: 2.6, carbsG: 0 });
});

test('reads nutrients by number when the id is absent', () => {
  const r = per100gFromNutrients([
    { nutrientNumber: '208', unitName: 'KCAL', value: 50 },
    { nutrientNumber: '203', value: 1 },
    { nutrientNumber: '204', value: 2 },
    { nutrientNumber: '205', value: 3 },
  ]);
  assert.deepEqual(r, { kcal: 50, proteinG: 1, fatG: 2, carbsG: 3 });
});

test('defensive parsing: junk in, null out', () => {
  assert.equal(per100gFromNutrients(undefined), null);
  assert.equal(per100gFromNutrients('x'), null);
  assert.equal(per100gFromNutrients([null, 5, {}, { nutrientId: 1008, value: 'NaN' }]), null);
  assert.equal(per100gFromNutrients([{ nutrientId: 1008, unitName: 'KCAL', value: -5 }]), null);
  assert.equal(pickBestFood('egg', null), null);
  assert.equal(pickBestFood('egg', {}), null);
  assert.equal(pickBestFood('egg', { foods: [null, 3, { description: 'Egg' }] }), null);
  assert.equal(pickBestFood('', SEARCH.egg), null);
});
