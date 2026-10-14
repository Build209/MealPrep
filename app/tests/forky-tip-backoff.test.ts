/// <reference types="node" />
/**
 * Forky backing off: a tip that keeps being closed rests, a tip that is used is forgiven, and the
 * person can turn tips down or off. Ported with its checks from mobile/scripts/forky-tip-backoff-check.ts
 * (npm run test:forky-tip-backoff in the old app); same dates, same expected values.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMPTY_FORKY_BACKOFF,
  FORKY_BACKOFF_RULES,
  FORKY_STORAGE_PREFIX,
  FORKY_TIP_BACKOFF_STORAGE_KEY,
  FORKY_TIP_FREQUENCY_STORAGE_KEY,
  forkyRestDays,
  forkyTipAllowed,
  forkyTipOutcome,
  forkyTipShown,
  isForkyTipResting,
  mayShowForkyTip,
  readForkyBackoff,
  readForkyTipFrequency,
  recordForkyTipOutcome,
  recordForkyTipShown,
  writeForkyTipFrequency,
  type ForkyBackoffState,
  type TipStore,
} from '../src/forky/tipBackoff';

const day = (iso: string) => new Date(`${iso}T12:00:00`);

function memoryStore(): TipStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test('closed twice without using it: the tip rests for a week; other tips are not affected', () => {
  let state: ForkyBackoffState = EMPTY_FORKY_BACKOFF;
  state = forkyTipShown(state, 'scanner', day('2026-10-01'), 'normal');
  state = forkyTipOutcome(state, 'scanner', 'dismissed', day('2026-10-01'), 'normal');
  assert.equal(mayShowForkyTip(state, 'scanner', day('2026-10-04'), 'normal'), true, 'one close is not enough');
  state = forkyTipShown(state, 'scanner', day('2026-10-04'), 'normal');
  state = forkyTipOutcome(state, 'scanner', 'dismissed', day('2026-10-04'), 'normal');
  assert.equal(state.tips.scanner?.restUntilDay, '2026-10-11');
  assert.equal(isForkyTipResting(state, 'scanner', day('2026-10-10')), true);
  assert.equal(mayShowForkyTip(state, 'scanner', day('2026-10-10'), 'normal'), false);
  assert.equal(mayShowForkyTip(state, 'scanner', day('2026-10-11'), 'normal'), true, 'back after seven days');
  assert.equal(mayShowForkyTip(state, 'aisleSort', day('2026-10-05'), 'normal'), true);

  // Closed twice again: two weeks, then four, and it stops growing there.
  for (const [first, second, until] of [
    ['2026-10-11', '2026-10-12', '2026-10-26'],
    ['2026-10-26', '2026-10-27', '2026-11-24'],
    ['2026-11-24', '2026-11-25', '2026-12-23'],
  ] as const) {
    state = forkyTipOutcome(forkyTipShown(state, 'scanner', day(first), 'normal'), 'scanner', 'dismissed', day(first), 'normal');
    state = forkyTipOutcome(forkyTipShown(state, 'scanner', day(second), 'normal'), 'scanner', 'dismissed', day(second), 'normal');
    assert.equal(state.tips.scanner?.restUntilDay, until);
  }
  assert.equal(state.tips.scanner?.level, FORKY_BACKOFF_RULES.maxLevel);

  // Using the tip forgives everything.
  state = forkyTipOutcome(forkyTipShown(state, 'scanner', day('2026-12-23'), 'normal'), 'scanner', 'tapped', day('2026-12-23'), 'normal');
  assert.deepEqual(state.tips.scanner, { score: 0, level: 0, restUntilDay: null, awaitingOutcome: false });
});

test('left to fold away untouched counts half', () => {
  let ignored: ForkyBackoffState = EMPTY_FORKY_BACKOFF;
  for (const iso of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) {
    ignored = forkyTipShown(ignored, 'aisleSort', day(iso), 'normal');
  }
  assert.equal(ignored.tips.aisleSort?.score, 3, 'the fourth showing is still waiting for an answer');
  assert.equal(isForkyTipResting(ignored, 'aisleSort', day('2026-10-05')), false);
  ignored = forkyTipShown(ignored, 'aisleSort', day('2026-10-05'), 'normal');
  assert.equal(ignored.tips.aisleSort?.restUntilDay, '2026-10-12');

  let mixed: ForkyBackoffState = EMPTY_FORKY_BACKOFF;
  mixed = forkyTipOutcome(forkyTipShown(mixed, 'aisleSort', day('2026-10-01'), 'normal'), 'aisleSort', 'dismissed', day('2026-10-01'), 'normal');
  mixed = forkyTipShown(mixed, 'aisleSort', day('2026-10-02'), 'normal');
  mixed = forkyTipShown(mixed, 'aisleSort', day('2026-10-03'), 'normal');
  assert.equal(isForkyTipResting(mixed, 'aisleSort', day('2026-10-04')), false);
  mixed = forkyTipShown(mixed, 'aisleSort', day('2026-10-04'), 'normal');
  assert.equal(isForkyTipResting(mixed, 'aisleSort', day('2026-10-05')), true);
});

test('food about to expire rests for less time; "less often" doubles rests', () => {
  assert.deepEqual([1, 2, 3].map((level) => forkyRestDays('expiration', level, 'normal')), [3, 7, 14]);
  assert.deepEqual([1, 2, 3].map((level) => forkyRestDays('scanner', level, 'normal')), [7, 14, 28]);
  assert.deepEqual([1, 2, 3].map((level) => forkyRestDays('scanner', level, 'less')), [14, 28, 56]);
});

test('"less often": three days between tips, except expiring food. "Off": none', () => {
  let less: ForkyBackoffState = forkyTipShown(EMPTY_FORKY_BACKOFF, 'aisleSort', day('2026-10-01'), 'less');
  less = forkyTipOutcome(less, 'aisleSort', 'tapped', day('2026-10-01'), 'less');
  assert.equal(mayShowForkyTip(less, 'scanner', day('2026-10-03'), 'less'), false);
  assert.equal(mayShowForkyTip(less, 'scanner', day('2026-10-04'), 'less'), true);
  assert.equal(mayShowForkyTip(less, 'expiration', day('2026-10-02'), 'less'), true);
  assert.equal(mayShowForkyTip(less, 'scanner', day('2026-10-02'), 'normal'), true);
  for (const tip of ['expiration', 'aisleSort', 'scanner'] as const) {
    assert.equal(mayShowForkyTip(EMPTY_FORKY_BACKOFF, tip, day('2026-10-02'), 'off'), false);
  }
});

test('on the device: the greeting and restock are never held back; only real tips are scored', () => {
  const store = memoryStore();
  assert.equal(readForkyTipFrequency(store), 'normal');
  recordForkyTipShown('scanner', day('2026-10-01'), store);
  recordForkyTipOutcome('scanner', 'dismissed', day('2026-10-01'), store);
  recordForkyTipShown('scanner', day('2026-10-02'), store);
  recordForkyTipOutcome('scanner', 'dismissed', day('2026-10-02'), store);
  assert.equal(forkyTipAllowed('scanner', day('2026-10-03'), store), false);
  assert.equal(forkyTipAllowed('greeting', day('2026-10-03'), store), true);
  assert.equal(forkyTipAllowed('restock', day('2026-10-03'), store), true);
  recordForkyTipShown('restock', day('2026-10-03'), store);
  recordForkyTipOutcome('greeting', 'dismissed', day('2026-10-03'), store);
  assert.deepEqual(Object.keys(readForkyBackoff(store).tips), ['scanner'], 'only real tips are scored');
  writeForkyTipFrequency('off', store);
  assert.equal(forkyTipAllowed('expiration', day('2026-12-01'), store), false);
  assert.equal(forkyTipAllowed('restock', day('2026-12-01'), store), true);
  assert.ok(FORKY_TIP_BACKOFF_STORAGE_KEY.startsWith(FORKY_STORAGE_PREFIX));
  assert.ok(!FORKY_TIP_FREQUENCY_STORAGE_KEY.startsWith(FORKY_STORAGE_PREFIX), 'the frequency is a setting, not a tip memory');
  assert.equal(FORKY_TIP_BACKOFF_STORAGE_KEY, 'mealprep.forkinator.tipBackoff', 'same key as the old app');
});

test('broken or missing storage never throws', () => {
  const broken: TipStore = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(readForkyBackoff(broken), EMPTY_FORKY_BACKOFF);
  recordForkyTipShown('scanner', day('2026-10-01'), broken);
  assert.equal(forkyTipAllowed('scanner', day('2026-10-01'), null), true);
  const junk = memoryStore();
  junk.setItem(FORKY_TIP_BACKOFF_STORAGE_KEY, JSON.stringify({ tips: { scanner: { score: 99, level: -4, restUntilDay: 'soon' }, nope: {} }, lastTipDay: 5 }));
  assert.deepEqual(readForkyBackoff(junk), { tips: { scanner: { score: 10, level: 0, restUntilDay: null, awaitingOutcome: false } }, lastTipDay: null });
});

test('wiring: each tip asks before it opens, and every tap or close is recorded', () => {
  const header = readFileSync(join(__dirname, '..', 'src', 'forky', 'ForkyHeader.tsx'), 'utf8');
  const rules = readFileSync(join(__dirname, '..', 'src', 'forky', 'headerTips.ts'), 'utf8');
  assert.match(rules, /mayShowForkyTip\(backoff, 'expiration', now, frequency\)/);
  assert.match(rules, /mayShowForkyTip\(backoff, 'scanner', now, frequency\)/);
  assert.match(header, /recordForkyTipShown\(tip\.kind, now, store\);/);
  assert.match(header, /recordForkyTipOutcome\(tip\.kind, 'tapped'\)/);
  assert.match(header, /recordForkyTipOutcome\(tip\.kind, 'dismissed'\)/);
  assert.match(header, /minWidth: touch\.min, minHeight: touch\.min/, 'tap targets are at least 44px');
});
