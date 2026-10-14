/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forkyAllowanceFor, forkyTierFor, forkyUsedUp, morePlansExist } from '../src/forky/allowance';
import { TIER_LIMITS } from '../src/scan/planTiers';

test('tier as the function counts it: plan + plan_tier, admins get Family', () => {
  assert.equal(forkyTierFor({ role: 'member', plan: 'free', planTier: 'plus' }), 'free');
  assert.equal(forkyTierFor({ role: 'member', plan: 'paid', planTier: 'pro' }), 'pro');
  assert.equal(forkyTierFor({ role: 'member', plan: 'paid', planTier: null }), 'plus');
  assert.equal(forkyTierFor({ role: 'admin', plan: 'free', planTier: 'plus' }), 'family');
});

test('remaining = plan limit minus this month\'s messages', () => {
  assert.deepEqual(forkyAllowanceFor('free', 2), { state: 'known', tier: 'free', limit: TIER_LIMITS.free.forkyQuestions, used: 2, remaining: TIER_LIMITS.free.forkyQuestions - 2 });
  assert.deepEqual(forkyAllowanceFor('plus', 0), { state: 'known', tier: 'plus', limit: 15, used: 0, remaining: 15 });
  const over = forkyAllowanceFor('free', 99);
  assert.equal(over.state === 'known' ? over.remaining : null, 0);
  assert.deepEqual(forkyAllowanceFor(null, 1), { state: 'unknown' });
  assert.deepEqual(forkyAllowanceFor('free', null), { state: 'unknown' });
});

test('what the server said this month wins (it can lower a limit)', () => {
  const a = forkyAllowanceFor('plus', 1, { limit: 10, remaining: 3 });
  assert.deepEqual(a, { state: 'known', tier: 'plus', limit: 10, used: 7, remaining: 3 });
  assert.equal(forkyUsedUp(forkyAllowanceFor('free', 0, { limit: 5, remaining: 0 })), true);
  assert.equal(forkyUsedUp(forkyAllowanceFor('free', 4)), false);
  assert.equal(forkyUsedUp(forkyAllowanceFor('free', 5)), true);
  assert.equal(forkyUsedUp({ state: 'unknown' }), false);
});

test('See plans only where a bigger plan exists', () => {
  assert.equal(morePlansExist('free'), true);
  assert.equal(morePlansExist('pro'), true);
  assert.equal(morePlansExist('family'), false);
});
