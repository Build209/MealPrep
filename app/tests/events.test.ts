/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEventRow,
  checkoutStartedProps,
  cleanEventProps,
  EVENT_NAME_FORMAT,
  EVENT_NAMES,
  isEventName,
  newEventSessionId,
  openedFromConfirmLink,
  scanSavedProps,
  shouldStopAfter,
} from '../src/lib/eventRules';

test('every event name passes the database check on app_events.name', () => {
  for (const name of EVENT_NAMES) assert.match(name, EVENT_NAME_FORMAT, name);
});

test('old app names are kept so old and new rows line up', () => {
  for (const name of ['app_open', 'scan_saved', 'ask_forky_asked', 'checkout_started']) {
    assert.ok(isEventName(name), name);
  }
});

test('unknown or malformed names are refused', () => {
  for (const name of ['', 'ab', 'App_Open', 'app open', 'signup', 'a'.repeat(41), 42, null, undefined]) {
    assert.equal(isEventName(name), false, String(name));
    assert.equal(buildEventRow(name, {}, 's', 'web'), null);
  }
});

test('props: only allowed keys, code words, whole numbers and yes/no pass', () => {
  assert.deepEqual(
    cleanEventProps({
      kind: 'receipt',
      count: 3.6,
      standalone: true,
      email: 'someone@example.com',
      text: 'what can I cook',
      source: 'two words',
      tier: 'someone@example.com',
      interval: 'month',
      plan: { nested: true },
    }),
    { kind: 'receipt', count: 4, standalone: true, interval: 'month' },
  );
});

test('props: numbers are clamped, non-finite numbers and long strings dropped', () => {
  assert.deepEqual(cleanEventProps({ count: -5 }), { count: 0 });
  assert.deepEqual(cleanEventProps({ count: 10_000_000 }), { count: 100_000 });
  assert.deepEqual(cleanEventProps({ count: Number.NaN }), {});
  assert.deepEqual(cleanEventProps({ source: 'a'.repeat(33) }), {});
});

test('props: anything that is not a plain object becomes {}', () => {
  for (const value of [null, undefined, 'x', 3, ['kind'], true]) assert.deepEqual(cleanEventProps(value), {});
});

test('props stay far under the 600 byte limit even with every key at its longest', () => {
  const props = cleanEventProps({
    kind: 'k'.repeat(32),
    source: 's'.repeat(32),
    plan: 'p'.repeat(32),
    tier: 't'.repeat(32),
    interval: 'i'.repeat(32),
    count: 100_000,
    standalone: false,
  });
  assert.ok(Buffer.byteLength(JSON.stringify(props)) < 400);
});

test('rows: platform limited to web/ios/android, session id to 40 characters', () => {
  assert.deepEqual(buildEventRow('sign_in', undefined, 'abc', 'ios'), { name: 'sign_in', props: {}, session_id: 'abc', platform: 'ios' });
  assert.equal(buildEventRow('sign_in', {}, 'abc', 'windows')!.platform, 'web');
  assert.equal(buildEventRow('sign_in', {}, 'x'.repeat(60), 'android')!.session_id.length, 40);
  assert.ok(newEventSessionId().length <= 40);
  assert.equal(newEventSessionId(0, () => 0.5), '0-i');
});

test('checkout_started keeps the old plan prop and adds tier and interval', () => {
  assert.deepEqual(checkoutStartedProps('plus', 'month'), { tier: 'plus', interval: 'month', plan: 'plus_month' });
});

test('scan_saved: receipt if any row came from a receipt, with the count', () => {
  assert.deepEqual(scanSavedProps([{ kind: 'shelf' }, { kind: 'receipt' }], 2), { kind: 'receipt', count: 2 });
  assert.deepEqual(scanSavedProps([{ kind: 'shelf' }], 5), { kind: 'shelf', count: 5 });
  assert.deepEqual(scanSavedProps([], 0), { kind: 'shelf', count: 0 });
});

test('confirm links are recognised; reset links and plain addresses are not', () => {
  assert.equal(openedFromConfirmLink('#access_token=x&refresh_token=y&type=signup', ''), true);
  assert.equal(openedFromConfirmLink('', '?type=signup'), true);
  assert.equal(openedFromConfirmLink('#access_token=x&type=recovery', ''), false);
  assert.equal(openedFromConfirmLink('', '?checkout=success'), false);
  assert.equal(openedFromConfirmLink('#type=signupx', ''), false);
});

test('refused-for-good errors stop the log; network trouble does not', () => {
  assert.equal(shouldStopAfter(null), false);
  assert.equal(shouldStopAfter({ code: '42501' }), true);
  assert.equal(shouldStopAfter({ code: '23514' }), true);
  assert.equal(shouldStopAfter({ status: 404 }), true);
  assert.equal(shouldStopAfter({ code: '', status: 0 }), false);
  assert.equal(shouldStopAfter({ status: 503 }), false);
});
