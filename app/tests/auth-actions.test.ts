/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageConfirmationMetadata, requestPasswordReset, signIn, signOut, signUp, type AuthClient } from '../src/auth/actions';
import { AUTH_EMAIL_REDIRECT, AUTH_RESET_COPY, AUTH_RESULT_COPY } from '../src/auth/copy';

type Call = { name: string; args: unknown[] };

const FIXED_NOW = new Date('2026-10-15T12:00:00.000Z');
const AGE_DATA = { age_confirmed: true, age_confirmed_at: '2026-10-15T12:00:00.000Z' };

/** A stand-in for supabase.auth that records calls and returns what each test asks for. */
function fakeAuth(replies: Record<string, unknown>): { auth: AuthClient; calls: Call[] } {
  const calls: Call[] = [];
  const handler = (name: string) => async (...args: unknown[]) => {
    calls.push({ name, args });
    const reply = replies[name];
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const auth = {
    signInWithPassword: handler('signInWithPassword'),
    signUp: handler('signUp'),
    resetPasswordForEmail: handler('resetPasswordForEmail'),
    signOut: handler('signOut'),
  };
  return { auth: auth as unknown as AuthClient, calls };
}

test('no server settings: every action says sign-in is unavailable', async () => {
  for (const result of [
    await signIn(null, 'a@b.co', 'x'),
    await signUp(null, 'a@b.co', 'secret1'),
    await requestPasswordReset(null, 'a@b.co'),
    await signOut(null),
  ]) {
    assert.deepEqual(result, { ok: false, error: AUTH_RESULT_COPY.unavailable });
  }
});

test('sign-in trims the email and maps a wrong password', async () => {
  const { auth, calls } = fakeAuth({
    signInWithPassword: { data: {}, error: { message: 'Invalid login credentials' } },
  });
  const result = await signIn(auth, '  cook@example.com ', 'pw');
  assert.deepEqual(calls[0]?.args[0], { email: 'cook@example.com', password: 'pw' });
  assert.deepEqual(result, { ok: false, error: AUTH_RESULT_COPY.wrongCredentials });
});

test('sign-in ok', async () => {
  const { auth } = fakeAuth({ signInWithPassword: { data: {}, error: null } });
  assert.deepEqual(await signIn(auth, 'cook@example.com', 'pw'), { ok: true });
});

test('a thrown network error becomes the offline message', async () => {
  const { auth } = fakeAuth({ signInWithPassword: new Error('Failed to fetch') });
  assert.deepEqual(await signIn(auth, 'cook@example.com', 'pw'), { ok: false, error: AUTH_RESULT_COPY.offline });
});

test('sign-up sends the confirmation link to the live site and asks to confirm', async () => {
  const { auth, calls } = fakeAuth({
    signUp: { data: { session: null, user: { identities: [{ id: '1' }] } }, error: null },
  });
  const result = await signUp(auth, 'cook@example.com', 'secret1', undefined, FIXED_NOW);
  assert.deepEqual(calls[0]?.args[0], {
    email: 'cook@example.com',
    password: 'secret1',
    options: { emailRedirectTo: AUTH_EMAIL_REDIRECT, data: AGE_DATA },
  });
  assert.deepEqual(result, { ok: true, notice: AUTH_RESULT_COPY.confirmEmail });
});

test('sign-up can send the confirmation link to another address (the preview build)', async () => {
  const { auth, calls } = fakeAuth({
    signUp: { data: { session: null, user: { identities: [{ id: '1' }] } }, error: null },
  });
  await signUp(auth, 'cook@example.com', 'secret1', 'https://preview.example.dev/', FIXED_NOW);
  assert.deepEqual(calls[0]?.args[0], {
    email: 'cook@example.com',
    password: 'secret1',
    options: { emailRedirectTo: 'https://preview.example.dev/', data: AGE_DATA },
  });
});

test('sign-up records the ticked 18+ box in the user metadata, with the time it was sent', async () => {
  const { auth, calls } = fakeAuth({
    signUp: { data: { session: null, user: { identities: [{ id: '1' }] } }, error: null },
  });
  await signUp(auth, 'cook@example.com', 'secret1');
  const sent = calls[0]?.args[0] as { options: { data: Record<string, unknown> } };
  assert.equal(sent.options.data.age_confirmed, true);
  const at = sent.options.data.age_confirmed_at;
  assert.equal(typeof at, 'string');
  assert.ok(Math.abs(Date.parse(at as string) - Date.now()) < 60_000, 'timestamp is now');
  assert.deepEqual(ageConfirmationMetadata(FIXED_NOW), AGE_DATA);
});

test('sign-up with an address that already has an account says so', async () => {
  const { auth } = fakeAuth({ signUp: { data: { session: null, user: { identities: [] } }, error: null } });
  assert.deepEqual(await signUp(auth, 'cook@example.com', 'secret1'), {
    ok: false,
    error: AUTH_RESULT_COPY.alreadyRegistered,
  });
});

test('reset link: same message either way, link goes to the live site', async () => {
  const { auth, calls } = fakeAuth({ resetPasswordForEmail: { data: {}, error: null } });
  const result = await requestPasswordReset(auth, ' cook@example.com ');
  assert.deepEqual(calls[0]?.args, ['cook@example.com', { redirectTo: AUTH_EMAIL_REDIRECT }]);
  assert.deepEqual(result, { ok: true, notice: AUTH_RESET_COPY.sent });
});

test('reset with an empty email does not call the server', async () => {
  const { auth, calls } = fakeAuth({});
  assert.deepEqual(await requestPasswordReset(auth, '  '), { ok: false, error: AUTH_RESET_COPY.missingEmail });
  assert.equal(calls.length, 0);
});

test('sign out', async () => {
  const { auth, calls } = fakeAuth({ signOut: { error: null } });
  assert.deepEqual(await signOut(auth), { ok: true });
  assert.equal(calls[0]?.name, 'signOut');
});
