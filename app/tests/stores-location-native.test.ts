/// <reference types="node" />
// Phone location for the Stores tab (src/stores/deviceLocation.ts), with a fake expo-location
// passed in: no native code is loaded. Privacy rules checked: rounded to 2 decimals, the prompt
// only on the tap, never a background request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORES_COPY } from '../src/stores/copy';
import {
  createPhoneLocation,
  mapLocationError,
  mapPermission,
  phoneProblemMessage,
  type ExpoLocationApi,
} from '../src/stores/deviceLocation';

type Perm = { status: string; granted: boolean; canAskAgain: boolean };
const GRANTED: Perm = { status: 'granted', granted: true, canAskAgain: true };
const UNDETERMINED: Perm = { status: 'undetermined', granted: false, canAskAgain: true };
const DENIED_FINAL: Perm = { status: 'denied', granted: false, canAskAgain: false };

function fakeApi(overrides: Partial<ExpoLocationApi> = {}) {
  const calls: string[] = [];
  const api: ExpoLocationApi = {
    getForegroundPermissionsAsync: async () => (calls.push('getPerm'), GRANTED),
    requestForegroundPermissionsAsync: async () => (calls.push('requestPerm'), GRANTED),
    hasServicesEnabledAsync: async () => (calls.push('services'), true),
    getLastKnownPositionAsync: async () => (calls.push('last'), null),
    getCurrentPositionAsync: async () => (calls.push('current'), { coords: { latitude: 37.774929, longitude: -122.419416 } }),
    Accuracy: { Balanced: 3 },
    ...overrides,
  };
  return { api, calls };
}

test('mapPermission: granted, undetermined, denied (final or can ask again), missing', () => {
  assert.equal(mapPermission(GRANTED), 'granted');
  assert.equal(mapPermission(UNDETERMINED), 'prompt');
  assert.equal(mapPermission(DENIED_FINAL), 'denied');
  assert.equal(mapPermission({ status: 'denied', granted: false, canAskAgain: true }), 'prompt');
  assert.equal(mapPermission(null), 'unavailable');
  assert.equal(mapPermission({ status: 'weird', granted: false, canAskAgain: false }), 'unavailable');
});

test('mapLocationError: services off, timeout, permission, other', () => {
  assert.equal(mapLocationError({ code: 'E_LOCATION_SERVICES_DISABLED', message: 'Location services are disabled' }), 'services_off');
  assert.equal(mapLocationError({ code: 'E_LOCATION_TIMEOUT' }), 'timeout');
  assert.equal(mapLocationError({ code: 'TIMEOUT' }), 'timeout');
  assert.equal(mapLocationError({ code: 'E_LOCATION_UNAUTHORIZED' }), 'denied');
  assert.equal(mapLocationError({ code: 'E_LOCATION_UNAVAILABLE' }), 'failed'); // no fix right now: try again
  assert.equal(mapLocationError(new Error('boom')), 'failed');
  assert.equal(mapLocationError(null), 'failed');
});

test('phoneProblemMessage: plain words, none where the card already explains', () => {
  assert.equal(phoneProblemMessage('services_off'), STORES_COPY.phoneServicesOff);
  assert.equal(phoneProblemMessage('timeout'), STORES_COPY.phoneTimeout);
  assert.equal(phoneProblemMessage('failed'), STORES_COPY.phoneFailed);
  assert.equal(phoneProblemMessage('denied'), null);
  assert.equal(phoneProblemMessage('unavailable'), null);
});

test('queryGeoPermission only reads the state: it never prompts', async () => {
  const { api, calls } = fakeApi({ getForegroundPermissionsAsync: async () => UNDETERMINED });
  assert.equal(await createPhoneLocation(api).queryGeoPermission(), 'prompt');
  assert.ok(!calls.includes('requestPerm'));
  assert.equal(await createPhoneLocation(null).queryGeoPermission(), 'unavailable');
  const broken = fakeApi({ getForegroundPermissionsAsync: async () => Promise.reject(new Error('no module')) });
  assert.equal(await createPhoneLocation(broken.api).queryGeoPermission(), 'unavailable');
});

test('the tap: asks for foreground permission, then returns the position rounded to 2 decimals', async () => {
  const { api, calls } = fakeApi({ getForegroundPermissionsAsync: async () => UNDETERMINED });
  const result = await createPhoneLocation(api).locateDevice();
  assert.deepEqual(result, { ok: true, lat: 37.77, lng: -122.42 });
  assert.ok(calls.includes('requestPerm'));
  // No background request exists on the fake (or in the code): only these calls are made.
  assert.deepEqual(calls, ['requestPerm', 'services', 'last', 'current']);
});

test('a recent last-known fix is used (rounded) without a fresh GPS request', async () => {
  const { api, calls } = fakeApi({
    getLastKnownPositionAsync: async () => ({ coords: { latitude: 44.50123, longitude: -110.60139 } }),
  });
  assert.deepEqual(await createPhoneLocation(api).requestDeviceLocation(), { lat: 44.5, lng: -110.6 });
  assert.ok(!calls.includes('current'));
});

test('refused: denied with no extra message; final denial does not prompt again', async () => {
  const refused = fakeApi({
    getForegroundPermissionsAsync: async () => UNDETERMINED,
    requestForegroundPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
  });
  assert.deepEqual(await createPhoneLocation(refused.api).locateDevice(), { ok: false, problem: 'denied', message: null });

  const final = fakeApi({ getForegroundPermissionsAsync: async () => DENIED_FINAL });
  assert.deepEqual(await createPhoneLocation(final.api).locateDevice(), { ok: false, problem: 'denied', message: null });
  assert.ok(!final.calls.includes('requestPerm'));
  assert.equal(await createPhoneLocation(final.api).requestDeviceLocation(), null);
});

test('location services off: plain words, no GPS request', async () => {
  const { api, calls } = fakeApi({ hasServicesEnabledAsync: async () => false });
  assert.deepEqual(await createPhoneLocation(api).locateDevice(), {
    ok: false,
    problem: 'services_off',
    message: STORES_COPY.phoneServicesOff,
  });
  assert.ok(!calls.includes('current'));
});

test('timeout: a GPS fix that never comes gives up with plain words', async () => {
  const { api } = fakeApi({ getCurrentPositionAsync: () => new Promise(() => {}) });
  assert.deepEqual(await createPhoneLocation(api, 20).locateDevice(), {
    ok: false,
    problem: 'timeout',
    message: STORES_COPY.phoneTimeout,
  });
});

test('a native error is mapped, and no module at all means ZIP only', async () => {
  const { api } = fakeApi({
    getCurrentPositionAsync: async () => Promise.reject(Object.assign(new Error('x'), { code: 'E_LOCATION_SERVICES_DISABLED' })),
  });
  assert.equal((await createPhoneLocation(api).locateDevice()).ok, false);
  assert.deepEqual(await createPhoneLocation(api).locateDevice(), {
    ok: false,
    problem: 'services_off',
    message: STORES_COPY.phoneServicesOff,
  });
  assert.deepEqual(await createPhoneLocation(null).locateDevice(), { ok: false, problem: 'unavailable', message: null });
});
