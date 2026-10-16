import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILY_PLAN_COPY, PROFILE_COPY } from '../src/account/copy';

function allText(): string[] {
  const out: string[] = [];
  for (const group of [PROFILE_COPY, FAMILY_PLAN_COPY]) {
    for (const value of Object.values(group)) out.push(typeof value === 'function' ? value('Test') : String(value));
  }
  return out;
}

test('profile copy never promises safety', () => {
  for (const text of allText()) {
    assert.doesNotMatch(text, /\bsafe\b|allergen-free|guarantee/i, text);
  }
});

test('the allergen helper line is the agreed words', () => {
  assert.equal(
    PROFILE_COPY.allergensHelp,
    'We move recipes with these to the bottom and mark them. Always check labels and verify before you cook.',
  );
});

test('family plan copy says coming soon and makes no price or savings claims', () => {
  assert.equal(FAMILY_PLAN_COPY.badge, 'Coming soon');
  assert.equal(FAMILY_PLAN_COPY.explain, 'Link accounts so a household can share a plan.');
  for (const value of Object.values(FAMILY_PLAN_COPY)) assert.doesNotMatch(value, /\$|save|%|free/i);
});

test('householdValue pluralises', () => {
  assert.equal(PROFILE_COPY.householdValue(1), '1 person');
  assert.equal(PROFILE_COPY.householdValue(3), '3 people');
});
