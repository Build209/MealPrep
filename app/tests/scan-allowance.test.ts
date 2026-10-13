/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowanceFor, allowanceNote, allowanceText, currentUsagePeriod, scanTierFor, usedFromResponse } from '../src/scan/allowance';

test('tier comes from plan and plan_tier; admins are uncapped', () => {
  assert.equal(scanTierFor({ role: 'member', plan: 'free', planTier: 'plus' }), 'free');
  assert.equal(scanTierFor({ role: 'member', plan: 'paid', planTier: 'family' }), 'family');
  assert.equal(scanTierFor({ role: 'admin', plan: 'free', planTier: 'plus' }), 'admin');
});

test('button text: left this month, none left, or plain Scan when unknown', () => {
  assert.equal(allowanceText(allowanceFor('free', 1)), 'Scan · 2 left this month');
  assert.equal(allowanceText(allowanceFor('free', 0)), 'Scan · 3 left this month');
  assert.equal(allowanceText(allowanceFor('plus', 14)), 'Scan · 1 left this month');
  assert.equal(allowanceText(allowanceFor('free', 3)), 'Scan · none left this month');
  assert.equal(allowanceText(allowanceFor('free', 7)), 'Scan · none left this month', 'never negative');
  assert.equal(allowanceText(allowanceFor('pro', null)), 'Scan', 'usage unreadable: promise nothing');
  assert.equal(allowanceText(allowanceFor(null, 0)), 'Scan', 'profile loading');
  assert.equal(allowanceText(allowanceFor('admin', null)), 'Scan');
  assert.equal(allowanceText(allowanceFor('family', 10), 'Scan shelf'), 'Scan shelf · 40 left this month');
});

test('allowance numbers per tier', () => {
  assert.deepEqual(allowanceFor('pro', 5), { state: 'capped', tier: 'pro', limit: 25, used: 5, remaining: 20 });
  assert.deepEqual(allowanceFor('admin', 99), { state: 'uncapped' });
});

test('notes on the scan screen', () => {
  assert.match(allowanceNote(allowanceFor('free', 2)) ?? '', /^1 of 3 scans left this month/);
  assert.match(allowanceNote(allowanceFor('free', 3)) ?? '', /used your 3 free scans .*1st/);
  assert.match(allowanceNote(allowanceFor('plus', 15)) ?? '', /used all 15 scans/);
  assert.equal(allowanceNote(allowanceFor('admin', 0)), null);
});

test('usage period is the UTC month; used count from a scan response', () => {
  assert.equal(currentUsagePeriod(new Date('2026-11-01T00:30:00Z')), '2026-11');
  assert.equal(usedFromResponse({ isPlus: false, limit: 3, remaining: 2 }), 1);
  assert.equal(usedFromResponse({ isPlus: true, limit: null, remaining: null }), null);
  assert.equal(usedFromResponse(undefined), null);
});
