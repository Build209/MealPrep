import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUSEHOLD_MAX,
  HOUSEHOLD_MIN,
  NAME_MAX,
  NOTES_MAX,
  cleanDraft,
  clampHousehold,
  hasErrors,
  isDirty,
  saveLineKind,
  toggleKey,
  validateProfile,
  type ProfileDraft,
} from '../src/account/profile/profileForm';

const base: ProfileDraft = { name: 'Dana', householdSize: 2, dietaryNotes: '', diets: [], allergens: [] };

test('validateProfile accepts a normal profile', () => {
  assert.equal(hasErrors(validateProfile(base)), false);
});

test('validateProfile: name must be present and not too long (after trimming)', () => {
  assert.equal(validateProfile({ ...base, name: '   ' }).name, 'empty');
  assert.equal(validateProfile({ ...base, name: 'x'.repeat(NAME_MAX + 1) }).name, 'too-long');
  assert.equal(validateProfile({ ...base, name: `  ${'x'.repeat(NAME_MAX)}  ` }).name, undefined);
});

test('validateProfile: household size is a whole number from 1 to 12', () => {
  assert.equal(validateProfile({ ...base, householdSize: 0 }).householdSize, 'range');
  assert.equal(validateProfile({ ...base, householdSize: HOUSEHOLD_MAX + 1 }).householdSize, 'range');
  assert.equal(validateProfile({ ...base, householdSize: 2.5 }).householdSize, 'range');
  assert.equal(validateProfile({ ...base, householdSize: HOUSEHOLD_MIN }).householdSize, undefined);
  assert.equal(validateProfile({ ...base, householdSize: HOUSEHOLD_MAX }).householdSize, undefined);
});

test('validateProfile: notes have a short limit', () => {
  assert.equal(validateProfile({ ...base, dietaryNotes: 'y'.repeat(NOTES_MAX + 1) }).dietaryNotes, 'too-long');
  assert.equal(validateProfile({ ...base, dietaryNotes: 'y'.repeat(NOTES_MAX) }).dietaryNotes, undefined);
});

test('clampHousehold keeps the stepper inside its range', () => {
  assert.equal(clampHousehold(0), 1);
  assert.equal(clampHousehold(99), 12);
  assert.equal(clampHousehold(3.6), 4);
  assert.equal(clampHousehold(Number.NaN), 1);
});

test('toggleKey adds and removes, in the order of the full list', () => {
  const all = ['a', 'b', 'c'] as const;
  assert.deepEqual(toggleKey([], 'b', all), ['b']);
  assert.deepEqual(toggleKey(['c'], 'a', all), ['a', 'c']);
  assert.deepEqual(toggleKey(['a', 'c'], 'a', all), ['c']);
});

test('cleanDraft trims text and clamps the household size without touching the input', () => {
  const input = { ...base, name: '  Dana ', dietaryNotes: ' no mushrooms ', householdSize: 40, diets: ['vegan'] };
  const clean = cleanDraft(input);
  assert.equal(clean.name, 'Dana');
  assert.equal(clean.dietaryNotes, 'no mushrooms');
  assert.equal(clean.householdSize, 12);
  assert.notEqual(clean.diets, input.diets);
  assert.equal(input.name, '  Dana ');
});

test('isDirty ignores whitespace and list order, sees real changes', () => {
  const saved = { ...base, diets: ['vegan', 'low-carb'], allergens: ['milk', 'soy'] };
  assert.equal(isDirty({ ...saved, name: ' Dana ', diets: ['low-carb', 'vegan'] }, saved), false);
  assert.equal(isDirty({ ...saved, allergens: ['milk'] }, saved), true);
  assert.equal(isDirty({ ...saved, householdSize: 3 }, saved), true);
  assert.equal(isDirty({ ...saved, dietaryNotes: 'x' }, saved), true);
});

test('saveLineKind maps state to the line under Save', () => {
  assert.equal(saveLineKind('saving', true, true), 'saving');
  assert.equal(saveLineKind('idle', false, true), 'offline');
  assert.equal(saveLineKind('idle', false, false), 'idle');
  assert.equal(saveLineKind('saved', true, false), 'saved');
  assert.equal(saveLineKind('saved', true, true), 'idle');
  assert.equal(saveLineKind('error', true, true), 'error');
});
