/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_DELETE_ERRORS } from '../src/account/copy';
import { buildDeleteRequest, deleteFailure, deleteOutcome } from '../src/account/deleteRequest';

test('request: POST to the live function with the Bearer token, JSON type and an empty JSON body (as the old app)', () => {
  const request = buildDeleteRequest('https://abc.supabase.co', 'tok-123');
  assert.deepEqual(request, {
    url: 'https://abc.supabase.co/functions/v1/delete-user-account',
    init: {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-123', 'Content-Type': 'application/json' },
      body: '{}',
    },
  });
});

test('request: trailing slashes and spaces in the address are dropped', () => {
  assert.equal(buildDeleteRequest(' http://127.0.0.1:54321/ ', 't')?.url, 'http://127.0.0.1:54321/functions/v1/delete-user-account');
  assert.equal(buildDeleteRequest('https://x.co//', 't')?.url, 'https://x.co/functions/v1/delete-user-account');
});

test('request: no server address means not configured', () => {
  assert.equal(buildDeleteRequest('', 't'), null);
  assert.equal(buildDeleteRequest('   ', 't'), null);
});

test('outcome: any 2xx is success (the function answers { ok: true })', () => {
  assert.deepEqual(deleteOutcome(200, { ok: true }), { ok: true });
  assert.deepEqual(deleteOutcome(204, {}), { ok: true });
});

test('outcome: 401 is signed out, in the old words', () => {
  assert.deepEqual(deleteOutcome(401, { error: 'Unauthorized' }), {
    ok: false,
    kind: 'signed-out',
    message: 'Sign in to delete your account.',
  });
});

test('outcome: CANCEL_FAILED shows the function\'s own sentence (Plus not cancelled, nothing deleted)', () => {
  const outcome = deleteOutcome(502, { error: 'whatever the server says', code: 'CANCEL_FAILED' });
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.kind, 'cancel-failed');
  assert.equal(!outcome.ok && outcome.message, ACCOUNT_DELETE_ERRORS.cancelFailed);
  assert.match(ACCOUNT_DELETE_ERRORS.cancelFailed, /your account was not deleted/);
});

test('outcome: other refusals never show raw server text', () => {
  for (const [status, json] of [
    [500, { error: 'update or delete on table "profiles" violates foreign key constraint' }],
    [500, { error: 'Server misconfigured' }],
    [405, { error: 'Method not allowed' }],
    [503, null],
    [500, 'not json'],
  ] as const) {
    const outcome = deleteOutcome(status, json);
    assert.deepEqual(outcome, { ok: false, kind: 'server', message: 'Could not delete account. Try again or contact support.' });
  }
});

test('failures: network and not configured have plain words', () => {
  assert.deepEqual(deleteFailure('network'), {
    ok: false,
    kind: 'network',
    message: "Couldn't reach the server. Check your connection and try again.",
  });
  assert.deepEqual(deleteFailure('not-configured'), {
    ok: false,
    kind: 'not-configured',
    message: 'App is not configured for account deletion.',
  });
});
