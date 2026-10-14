/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  importAllowanceFor,
  importButtonText,
  importsLeftText,
  importTierFor,
  isImportUsedUp,
  usedFromImportUsage,
  usedUpNote,
} from '../src/recipes/import/allowance';
import { PLAN_TIERS, TIER_LIMITS } from '../src/scan/planTiers';

const livePath = join(__dirname, '..', '..', 'mobile', 'supabase', 'functions', '_shared', 'planTiers.ts');
const skip = !existsSync(livePath) && 'old app removed';

test('import limits are the numbers the live recipe-import function enforces', { skip }, () => {
  const live = readFileSync(livePath, 'utf8');
  for (const tier of PLAN_TIERS) {
    const line = new RegExp(`^\\s*${tier}: \\{ scans: \\d+, imports: (\\d+),`, 'm').exec(live);
    assert.ok(line, `limits line for ${tier}`);
    assert.equal(TIER_LIMITS[tier].imports, Number(line[1]), tier);
  }
});

test('published import limits: free 2, Plus 5, Pro 10, Family 25', () => {
  assert.deepEqual(
    PLAN_TIERS.map((t) => TIER_LIMITS[t].imports),
    [2, 5, 10, 25],
  );
});

test('tier: plan + plan_tier, admins uncapped (as loadImportTier)', () => {
  assert.equal(importTierFor({ role: 'member', plan: 'free', planTier: 'pro' }), 'free');
  assert.equal(importTierFor({ role: 'member', plan: 'paid', planTier: null }), 'plus');
  assert.equal(importTierFor({ role: 'member', plan: 'paid', planTier: 'family' }), 'family');
  assert.equal(importTierFor({ role: 'admin', plan: 'free' }), 'admin');
});

test('button text: N imports left this month, none left, or plain Import', () => {
  assert.equal(importButtonText(importAllowanceFor('free', 0)), 'Import · 2 imports left this month');
  assert.equal(importButtonText(importAllowanceFor('free', 1)), 'Import · 1 import left this month');
  assert.equal(importButtonText(importAllowanceFor('pro', 3)), 'Import · 7 imports left this month');
  assert.equal(importButtonText(importAllowanceFor('free', 2)), 'No imports left this month');
  assert.equal(importButtonText(importAllowanceFor('free', 9)), 'No imports left this month', 'never negative');
  assert.equal(importButtonText(importAllowanceFor('plus', null)), 'Import', 'usage unreadable: promise nothing');
  assert.equal(importButtonText(importAllowanceFor(null, 0)), 'Import', 'profile loading');
  assert.equal(importButtonText(importAllowanceFor('admin', 50)), 'Import');
  assert.equal(importsLeftText(importAllowanceFor('family', 0)), '25 imports left this month');
});

test('used up, and the note under the button', () => {
  assert.equal(isImportUsedUp(importAllowanceFor('free', 2)), true);
  assert.equal(isImportUsedUp(importAllowanceFor('free', 1)), false);
  assert.equal(isImportUsedUp(importAllowanceFor('admin', 99)), false);
  assert.equal(
    usedUpNote(importAllowanceFor('free', 2)),
    "You've used your 2 free recipe imports this month. They start again on the 1st. A paid plan includes more.",
  );
  assert.equal(usedUpNote(importAllowanceFor('plus', 5)), "You've used all 5 recipe imports this month. They start again on the 1st.");
  assert.equal(usedUpNote(importAllowanceFor('plus', 4)), null);
});

test('used count from an import answer', () => {
  assert.equal(usedFromImportUsage({ limit: 5, remaining: 3 }), 2);
  assert.equal(usedFromImportUsage({ limit: null, remaining: null }), null);
  assert.equal(usedFromImportUsage(null), null);
});
