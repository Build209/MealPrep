/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoTipsAllowedHere,
  chooseHeaderTip,
  E2E_TIPS_KEY,
  EMPTY_TIP_MEMORY,
  expirationMessage,
  HEADER_TIP_COPY,
  readTipMemory,
  rememberShown,
  SCANNER_NUDGE_COOLDOWN_MS,
  writeTipMemory,
  type HeaderTipMemory,
} from '../src/forky/headerTips';
import { EMPTY_FORKY_BACKOFF, forkyTipOutcome, forkyTipShown, type TipStore } from '../src/forky/tipBackoff';

const now = new Date('2026-10-14T12:00:00');
const seen: HeaderTipMemory = { ...EMPTY_TIP_MEMORY, greetingShown: true };
const base = { backoff: EMPTY_FORKY_BACKOFF, frequency: 'normal' as const, now };

function memoryStore(): TipStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test('nothing while the pantry loads; the greeting first, once', () => {
  assert.equal(chooseHeaderTip({ ...base, memory: EMPTY_TIP_MEMORY, pantry: null }), null);
  const greeting = chooseHeaderTip({ ...base, memory: EMPTY_TIP_MEMORY, pantry: [] });
  assert.deepEqual(greeting, { kind: 'greeting', message: HEADER_TIP_COPY.greeting });
  assert.equal(rememberShown(EMPTY_TIP_MEMORY, greeting!, now).greetingShown, true);
  // Tips set to off do not hold the greeting back (it is not a tip).
  assert.equal(chooseHeaderTip({ ...base, frequency: 'off', memory: EMPTY_TIP_MEMORY, pantry: [] })?.kind, 'greeting');
});

test('food expiring today or tomorrow, once a day for the same items', () => {
  const pantry = [
    { id: 'a', name: 'Spinach', expiresOn: '2026-10-15' },
    { id: 'b', name: 'Milk', expiresOn: '2026-10-14' },
    { id: 'c', name: 'Rice', expiresOn: null },
    { id: 'd', name: 'Yogurt', expiresOn: '2026-10-13' }, // already expired: not "about to"
  ];
  const tip = chooseHeaderTip({ ...base, memory: seen, pantry });
  assert.equal(tip?.kind, 'expiration');
  assert.equal(tip?.message, 'That Spinach and 1 more item are living on borrowed time!');
  assert.deepEqual(tip?.kind === 'expiration' ? tip.action : null, { label: 'Show me', href: '/pantry' });
  const after = rememberShown(seen, tip!, now);
  assert.notEqual(chooseHeaderTip({ ...base, memory: after, pantry })?.kind, 'expiration', 'same items, same day');
  assert.equal(chooseHeaderTip({ ...base, memory: after, pantry: [...pantry, { id: 'e', name: 'Fish', expiresOn: '2026-10-14' }] })?.kind, 'expiration', 'new items');
  assert.equal(chooseHeaderTip({ ...base, memory: after, pantry, now: new Date('2026-10-15T09:00:00') })?.kind, 'expiration', 'next day');
  assert.equal(expirationMessage(['Milk']), 'That Milk is living on borrowed time! Use it today or tomorrow.');
});

test('a resting tip stays quiet', () => {
  const pantry = [{ id: 'b', name: 'Milk', expiresOn: '2026-10-14' }];
  let backoff = EMPTY_FORKY_BACKOFF;
  for (const d of ['2026-10-12', '2026-10-13']) {
    const at = new Date(`${d}T12:00:00`);
    backoff = forkyTipOutcome(forkyTipShown(backoff, 'expiration', at, 'normal'), 'expiration', 'dismissed', at, 'normal');
  }
  assert.equal(chooseHeaderTip({ ...base, backoff, memory: seen, pantry }), null);
});

test('scan nudge while the pantry is empty, at most every 3 days', () => {
  const tip = chooseHeaderTip({ ...base, memory: seen, pantry: [] });
  assert.deepEqual(tip, { kind: 'scanner', message: HEADER_TIP_COPY.scanner, action: { label: 'Scan now', href: '/scan' } });
  const after = rememberShown(seen, tip!, now);
  assert.equal(chooseHeaderTip({ ...base, memory: after, pantry: [] }), null);
  assert.equal(chooseHeaderTip({ ...base, memory: after, pantry: [], now: new Date(now.getTime() + SCANNER_NUDGE_COOLDOWN_MS) })?.kind, 'scanner');
  assert.equal(chooseHeaderTip({ ...base, memory: seen, pantry: [{ id: 'c', name: 'Rice', expiresOn: null }] }), null, 'pantry has food');
  assert.equal(chooseHeaderTip({ ...base, frequency: 'off', memory: seen, pantry: [] }), null);
});

test('tip memory round-trips through device storage with the old keys', () => {
  const store = memoryStore();
  assert.deepEqual(readTipMemory(store), EMPTY_TIP_MEMORY);
  const memory: HeaderTipMemory = { greetingShown: true, expirationLastDay: '2026-10-14', expirationFingerprint: 'a\0b', scannerLastShownAt: 123 };
  writeTipMemory(store, memory);
  assert.deepEqual(readTipMemory(store), memory);
  assert.equal(store.getItem('mealprep.forkinator.greetingShown'), 'true');
  assert.deepEqual(readTipMemory(null), EMPTY_TIP_MEMORY);
});

test('browser automation gets no tips unless a test asks', () => {
  const store = memoryStore();
  const g = globalThis as { navigator?: unknown };
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { webdriver: true }, configurable: true, writable: true });
  try {
    assert.equal(autoTipsAllowedHere(store), false);
    store.setItem(E2E_TIPS_KEY, 'true');
    assert.equal(autoTipsAllowedHere(store), true);
    Object.defineProperty(globalThis, 'navigator', { value: { webdriver: false }, configurable: true, writable: true });
    assert.equal(autoTipsAllowedHere(memoryStore()), true);
  } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', had);
    else delete g.navigator;
  }
});
