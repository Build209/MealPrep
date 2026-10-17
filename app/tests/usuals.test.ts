/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_OFFERED,
  addDaysKey,
  daysBetween,
  dueUsuals,
  todayKey,
  usualKey,
  type PurchaseDay,
  type UsualSetting,
} from '../src/usuals/usualItems';

const TODAY = '2026-10-17';

function days(name: string, ...offsets: number[]): PurchaseDay[] {
  // offsets are days before TODAY
  return offsets.map((o) => ({ nameKey: usualKey(name), name, boughtOn: addDaysKey(TODAY, -o) }));
}

function due(purchases: PurchaseDay[], extra: Partial<{ settings: UsualSetting[]; openListNames: string[] }> = {}) {
  return dueUsuals({ purchases, settings: [], openListNames: [], today: TODAY, ...extra });
}

test('usualKey matches the database rule: trim, collapse spaces, lower case', () => {
  assert.equal(usualKey('  Whole   MILK '), 'whole milk');
  assert.equal(usualKey('Eggs'), 'eggs');
});

test('date helpers count calendar days and survive month ends', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-17'), 16);
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
  assert.equal(addDaysKey('2026-10-30', 3), '2026-11-02');
  assert.equal(todayKey(new Date(2026, 9, 7, 23, 59)), '2026-10-07');
  assert.ok(Number.isNaN(daysBetween('nope', '2026-10-17')));
});

test('three purchase days on a weekly rhythm make eggs due once 85% of the gap has passed', () => {
  // Bought 21, 14 and 7 days ago: usual gap 7. 7 days since = due.
  const items = due(days('Eggs', 21, 14, 7));
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { nameKey: 'eggs', name: 'Eggs', gapDays: 7, daysSince: 7, purchaseDays: 3 });
  // 6 days since is 86% of 7: due. 5 days is 71%: not yet.
  assert.equal(due(days('Eggs', 20, 13, 6)).length, 1);
  assert.equal(due(days('Eggs', 19, 12, 5)).length, 0);
});

test('fewer than three purchase days is not a usual, and one day counts once', () => {
  assert.equal(due(days('Eggs', 14, 7)).length, 0);
  assert.equal(due(days('Eggs', 7, 7, 7, 7)).length, 0);
});

test('the median gap shrugs off one missed shop', () => {
  // Gaps 7, 7, 28 (a missed month): median 7, so last bought 7 days ago is due.
  const items = due(days('Milk', 49, 42, 35, 7));
  assert.equal(items[0]?.gapDays, 7);
});

test('an item stops being offered after four gaps, and daily habits are skipped', () => {
  assert.equal(due(days('Eggs', 21 + 28, 14 + 28, 7 + 28)).length, 0);
  assert.equal(due(days('Eggs', 20 + 21, 13 + 21, 6 + 21)).length, 1);
  assert.equal(due(days('Coffee', 3, 2, 1)).length, 0);
});

test('hidden, snoozed and already-listed items are not offered', () => {
  const eggs = days('Eggs', 21, 14, 7);
  assert.equal(due(eggs, { settings: [{ nameKey: 'eggs', hidden: true, snoozedUntil: null }] }).length, 0);
  assert.equal(due(eggs, { settings: [{ nameKey: 'eggs', hidden: false, snoozedUntil: '2026-10-20' }] }).length, 0);
  // A snooze that ended is ignored; a snooze ending today is over.
  assert.equal(due(eggs, { settings: [{ nameKey: 'eggs', hidden: false, snoozedUntil: TODAY }] }).length, 1);
  assert.equal(due(eggs, { openListNames: [' EGGS '] }).length, 0);
});

test('most overdue first, at most five, the latest spelling shown', () => {
  const many: PurchaseDay[] = [];
  for (let i = 0; i < 8; i++) many.push(...days(`item${i}`, 21 + i, 14 + i, 7 + i)); // item7 is the most overdue
  const items = due(many);
  assert.equal(items.length, MAX_OFFERED);
  assert.equal(items[0]!.nameKey, 'item7');

  const respelled: PurchaseDay[] = [
    { nameKey: 'eggs', name: 'eggs', boughtOn: addDaysKey(TODAY, -21) },
    { nameKey: 'eggs', name: 'eggs', boughtOn: addDaysKey(TODAY, -14) },
    { nameKey: 'eggs', name: 'Free-range Eggs', boughtOn: addDaysKey(TODAY, -7) },
  ];
  assert.equal(due(respelled)[0]!.name, 'Free-range Eggs');
});

test('bad rows are ignored', () => {
  const bad: PurchaseDay[] = [
    { nameKey: '', name: '', boughtOn: TODAY },
    { nameKey: 'eggs', name: 'Eggs', boughtOn: 'yesterday' },
    ...days('Eggs', 21, 14, 7),
  ];
  assert.equal(due(bad).length, 1);
});

test('usuals words make no money claims and do not say the app knows or learns you', async () => {
  const { USUALS_COPY } = await import('../src/usuals/copy');
  const words = Object.values(USUALS_COPY)
    .map((v) => (typeof v === 'function' ? (v as (x: never) => string)(5 as never) : v))
    .join(' ');
  assert.ok(!/[$%]|\bsavings?\b|\bsaving\b|\bsaves? you\b|\bsaved you\b|\bmoney\b|\bcheaper\b/i.test(words), 'a money or savings word crept in');
  assert.ok(!/\b(learn|learns|knows|smart|ai)\b/i.test(words), 'an overclaim crept in');
  assert.equal(USUALS_COPY.rhythm(7), 'You usually buy this about every 7 days.');
});
