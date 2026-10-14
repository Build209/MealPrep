/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USAGE_COPY } from '../src/plans/copy';
import { cleanCount, usageLine, usageLines } from '../src/plans/usage';

test('counts: whole numbers from 0; a missing or odd value is 0', () => {
  assert.equal(cleanCount(4), 4);
  assert.equal(cleanCount(2.7), 2);
  assert.equal(cleanCount(-3), 0);
  assert.equal(cleanCount(null), 0);
  assert.equal(cleanCount(undefined), 0);
  assert.equal(cleanCount('5'), 0);
  assert.equal(cleanCount(Number.NaN), 0);
});

test('one line: used, limit, remaining and bar fraction', () => {
  assert.deepEqual(usageLine('scans', 2, 15), { kind: 'scans', used: 2, limit: 15, remaining: 13, fraction: 2 / 15 });
  assert.deepEqual(usageLine('imports', 5, 5), { kind: 'imports', used: 5, limit: 5, remaining: 0, fraction: 1 });
  assert.deepEqual(usageLine('forky', 9, 5), { kind: 'forky', used: 9, limit: 5, remaining: 0, fraction: 1 }, 'over the limit: never negative');
  assert.deepEqual(usageLine('scans', 0, 0), { kind: 'scans', used: 0, limit: 0, remaining: 0, fraction: 1 });
  assert.deepEqual(usageLine('scans', 7, null), { kind: 'scans', used: 7, limit: null, remaining: null, fraction: 0 });
});

test('lines per plan use the monthly limits from planTiers.ts', () => {
  const counts = { scans: 1, imports: 2, forky: 3 };
  const free = usageLines({ role: 'member', plan: 'free', planTier: 'plus' }, counts);
  assert.deepEqual(
    free.map((l) => [l.kind, l.used, l.limit, l.remaining]),
    [
      ['scans', 1, 3, 2],
      ['imports', 2, 2, 0],
      ['forky', 3, 5, 2],
    ],
  );
  const pro = usageLines({ role: 'member', plan: 'paid', planTier: 'pro' }, counts);
  assert.deepEqual(pro.map((l) => l.limit), [25, 10, 30]);
  const family = usageLines({ role: 'member', plan: 'paid', planTier: 'family' }, counts);
  assert.deepEqual(family.map((l) => l.limit), [50, 25, 60]);
  const paidNoTier = usageLines({ role: 'member', plan: 'paid', planTier: null }, counts);
  assert.deepEqual(paidNoTier.map((l) => l.limit), [15, 5, 15], 'paid with no readable tier is Plus');
});

test('admins are not capped on scans (pantry-vision rule)', () => {
  const lines = usageLines({ role: 'admin', plan: 'free', planTier: 'plus' }, { scans: 12, imports: 0, forky: 0 });
  assert.equal(lines[0]!.limit, null);
  assert.equal(lines[0]!.used, 12);
});

test('usage words: counts only, no daily numbers', () => {
  assert.equal(USAGE_COPY.usedOf(2, 15), '2 of 15 used');
  assert.equal(USAGE_COPY.usedNoLimit(7), '7 used');
  assert.equal(USAGE_COPY.left(13), '13 left this month');
  const all = Object.values(USAGE_COPY)
    .map((v) => (typeof v === 'function' ? (v as (a: number, b: number) => string)(1, 2) : v))
    .join(' ');
  assert.doesNotMatch(all, /\bday\b|daily|today/i);
});
