/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIER_LIMITS, TIER_PRICE_CENTS, tierForProfile, tierLimits, usageMonth, PLAN_TIERS } from '../src/scan/planTiers';

// The live pantry-vision function enforces this file; the app's copy must say the same.
const livePath = join(__dirname, '..', '..', 'supabase', 'functions', '_shared', 'planTiers.ts');
const appPath = join(__dirname, '..', 'src', 'scan', 'planTiers.ts');

test('the app copy is the live file verbatim (only a header comment added)', () => {
  const live = readFileSync(livePath, 'utf8');
  const app = readFileSync(appPath, 'utf8');
  assert.ok(app.endsWith(live), 'src/scan/planTiers.ts differs from supabase/functions/_shared/planTiers.ts');
});

test('monthly limits are the same numbers the live function uses', () => {
  const live = readFileSync(livePath, 'utf8');
  for (const tier of PLAN_TIERS) {
    const line = new RegExp(`^\\s*${tier}: \\{ scans: (\\d+), imports: (\\d+), forkyQuestions: (\\d+), priceTagScans: (\\d+) \\},`, 'm').exec(live);
    assert.ok(line, `limits line for ${tier} found in the live file`);
    assert.deepEqual(
      [line[1], line[2], line[3], line[4]].map(Number),
      [TIER_LIMITS[tier].scans, TIER_LIMITS[tier].imports, TIER_LIMITS[tier].forkyQuestions, TIER_LIMITS[tier].priceTagScans],
      tier,
    );
  }
});

test('published numbers (terms page): scans per month and prices', () => {
  assert.deepEqual(
    PLAN_TIERS.map((t) => TIER_LIMITS[t].scans),
    [3, 15, 25, 50],
  );
  assert.deepEqual(TIER_PRICE_CENTS.plus, { month: 499, year: 5388 });
});

test('tier rules match the function: unpaid is free, unknown paid tier is plus', () => {
  assert.equal(tierForProfile('free', 'pro'), 'free');
  assert.equal(tierForProfile('paid', 'pro'), 'pro');
  assert.equal(tierForProfile('paid', null), 'plus');
  assert.equal(tierForProfile('paid', 'gold'), 'plus');
  assert.equal(usageMonth(new Date('2026-10-31T23:59:59Z')), '2026-10');
  assert.equal(tierLimits('free', '{"free":{"scans":9}}').scans, 3, 'override can only lower');
});
