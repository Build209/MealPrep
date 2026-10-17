/// <reference types="node" />
// Compliance verdict, PR #356 (option B): the Recipes Ask Forky bar keeps the full AI notice whenever
// saved allergens would be sent with the question, or while that is still unknown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showFullForkyNotice } from '../src/recipes/recipeLogic';

test('the full notice shows during the reminder window', () => {
  assert.equal(showFullForkyNotice({ noticeOpen: true, isLoading: false, hasAllergens: false }), true);
});

test('with no saved allergens the notice collapses after the reminder', () => {
  assert.equal(showFullForkyNotice({ noticeOpen: false, isLoading: false, hasAllergens: false }), false);
});

test('saved allergens keep the full notice up after the reminder', () => {
  assert.equal(showFullForkyNotice({ noticeOpen: false, isLoading: false, hasAllergens: true }), true);
});

test('while the allergen read is loading the full notice stays up', () => {
  assert.equal(showFullForkyNotice({ noticeOpen: false, isLoading: true, hasAllergens: false }), true);
});
