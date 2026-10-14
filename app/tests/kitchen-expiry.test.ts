/// <reference types="node" />
// Cases from the old app's mobile/scripts/pantry-expiry-check.ts, plus the day counting the
// "Use soon" group relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToIsoDate,
  daysUntilPantryExpiry,
  formatPantryDaysLeft,
  formatPantryExpiryShort,
  isExpiringSoon,
  isPantryItemExpired,
  parseIsoDateOnly,
  todayIsoDate,
} from '../src/kitchen/expiry';

test('expired and expiring soon (pantry-expiry-check)', () => {
  const breadOct10 = { expiresOn: '2026-10-10' };
  const milkOct12 = { expiresOn: '2026-10-12' };
  const sunday = new Date('2026-10-11T12:00:00Z');
  assert.equal(isPantryItemExpired(breadOct10, sunday), true, 'Oct 10 bread expired on Oct 11');
  assert.equal(isExpiringSoon(breadOct10, 7, sunday), false, 'expired item is not expiring soon');
  assert.equal(isPantryItemExpired(milkOct12, sunday), false, 'Oct 12 milk not expired on Oct 11');
  assert.equal(isExpiringSoon(milkOct12, 7, sunday), true, 'Oct 12 milk expiring soon on Oct 11');
});

test('day counting', () => {
  const now = new Date(2026, 9, 10, 12, 0, 0);
  assert.equal(todayIsoDate(now), '2026-10-10');
  assert.equal(daysUntilPantryExpiry({ expiresOn: '2026-10-10' }, now), 0);
  assert.equal(daysUntilPantryExpiry({ expiresOn: '2026-10-13' }, now), 3);
  assert.equal(daysUntilPantryExpiry({ expiresOn: '2026-10-08' }, now), -2);
  assert.equal(daysUntilPantryExpiry({ expiresOn: null }, now), null);
  assert.equal(daysUntilPantryExpiry({ expiresOn: 'soon' }, now), null);
  assert.equal(formatPantryDaysLeft({ expiresOn: '2026-10-10' }, now), 'Use today');
  assert.equal(formatPantryDaysLeft({ expiresOn: '2026-10-11' }, now), '1 day left');
  assert.equal(formatPantryDaysLeft({ expiresOn: '2026-10-13' }, now), '3 days left');
  assert.equal(formatPantryDaysLeft({ expiresOn: '2026-10-09' }, now), null);
  assert.equal(formatPantryExpiryShort('2026-10-12'), 'exp Oct 12');
});

test('calendar dates', () => {
  assert.equal(addDaysToIsoDate('2026-10-30', 3), '2026-11-02');
  assert.equal(addDaysToIsoDate('2026-12-31', 1), '2027-01-01');
  assert.equal(parseIsoDateOnly('2026-02-30'), null, 'no 30 February');
  assert.equal(parseIsoDateOnly('20261010'), null);
  assert.ok(parseIsoDateOnly('2028-02-29'));
});
