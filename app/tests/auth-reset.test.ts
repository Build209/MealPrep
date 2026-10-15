/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestPasswordReset, updatePassword, type AuthClient } from '../src/auth/actions';
import { AUTH_EMAIL_REDIRECT, AUTH_RESET_COPY, AUTH_RESULT_COPY } from '../src/auth/copy';
import {
  authErrorMessage,
  newPasswordBlocker,
  passwordResetLinkState,
  passwordResetRedirect,
  resetScreenState,
  RESET_PASSWORD_PATH,
} from '../src/auth/logic';

type Call = { name: string; args: unknown[] };

function fakeAuth(replies: Record<string, unknown>): { auth: AuthClient; calls: Call[] } {
  const calls: Call[] = [];
  const handler = (name: string) => async (...args: unknown[]) => {
    calls.push({ name, args });
    const reply = replies[name];
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const auth = {
    resetPasswordForEmail: handler('resetPasswordForEmail'),
    updateUser: handler('updateUser'),
  };
  return { auth: auth as unknown as AuthClient, calls };
}

test('reset links on the web come back to this app on the same address', () => {
  assert.equal(RESET_PASSWORD_PATH, '/reset-password');
  assert.equal(
    passwordResetRedirect(true, 'https://mealplanatic-preview.pages.dev', AUTH_EMAIL_REDIRECT),
    'https://mealplanatic-preview.pages.dev/reset-password',
  );
  assert.equal(
    passwordResetRedirect(true, 'https://mealplanatic.app/', AUTH_EMAIL_REDIRECT),
    'https://mealplanatic.app/reset-password',
  );
  // The local test server (end-to-end tests).
  assert.equal(
    passwordResetRedirect(true, 'http://127.0.0.1:4173', AUTH_EMAIL_REDIRECT),
    'http://127.0.0.1:4173/reset-password',
  );
  assert.equal(passwordResetRedirect(true, 'http://localhost:8081', AUTH_EMAIL_REDIRECT), 'http://localhost:8081/reset-password');
});

test('phones, missing or odd addresses fall back to the live app', () => {
  assert.equal(passwordResetRedirect(false, 'https://mealplanatic.app', AUTH_EMAIL_REDIRECT), AUTH_EMAIL_REDIRECT);
  assert.equal(passwordResetRedirect(true, undefined, AUTH_EMAIL_REDIRECT), AUTH_EMAIL_REDIRECT);
  assert.equal(passwordResetRedirect(true, '', AUTH_EMAIL_REDIRECT), AUTH_EMAIL_REDIRECT);
  assert.equal(passwordResetRedirect(true, 'http://example.com', AUTH_EMAIL_REDIRECT), AUTH_EMAIL_REDIRECT);
  assert.equal(passwordResetRedirect(true, 'not a url', AUTH_EMAIL_REDIRECT), AUTH_EMAIL_REDIRECT);
});

test('reset link state is read from the address', () => {
  assert.equal(passwordResetLinkState('#access_token=x&type=recovery', ''), 'recovery');
  assert.equal(passwordResetLinkState('', '?type=recovery'), 'recovery');
  assert.equal(passwordResetLinkState('#error=access_denied&error_code=otp_expired', ''), 'expired');
  assert.equal(passwordResetLinkState('#access_token=x&type=signup', ''), null);
  assert.equal(passwordResetLinkState('', ''), null);
  assert.equal(passwordResetLinkState('#type=recoveryx', ''), null);
});

test('a new password follows the sign-up length rule and must be typed twice the same', () => {
  assert.equal(newPasswordBlocker('', ''), AUTH_RESULT_COPY.weakPassword);
  assert.equal(newPasswordBlocker('abc', 'abc'), AUTH_RESULT_COPY.weakPassword);
  assert.equal(newPasswordBlocker('secret1', 'secret2'), AUTH_RESET_COPY.mismatch);
  assert.equal(newPasswordBlocker('secret1', 'secret1'), null);
});

test('reset screen: waits, then shows the form only to someone signed in', () => {
  const base = { ready: true, hasSession: true, recovery: false, link: null };
  assert.equal(resetScreenState({ ...base, ready: false }), 'checking');
  assert.equal(resetScreenState({ ...base, link: 'recovery' }), 'form');
  assert.equal(resetScreenState(base), 'form');
  assert.equal(resetScreenState({ ...base, hasSession: false, link: 'recovery' }), 'expired');
  assert.equal(resetScreenState({ ...base, hasSession: false }), 'expired');
  // A refused link with an older session still saved: do not offer to change that account.
  assert.equal(resetScreenState({ ...base, link: 'expired' }), 'expired');
  assert.equal(resetScreenState({ ...base, link: 'expired', recovery: true }), 'form');
});

test('server replies about new passwords get plain wording', () => {
  assert.equal(
    authErrorMessage('New password should be different from the old password.'),
    AUTH_RESET_COPY.samePassword,
  );
  assert.equal(authErrorMessage('Auth session missing!'), AUTH_RESET_COPY.linkExpired);
});

test('the reset email link goes where the screen asks', async () => {
  const { auth, calls } = fakeAuth({ resetPasswordForEmail: { data: {}, error: null } });
  const result = await requestPasswordReset(auth, 'cook@example.com', 'https://preview.example.dev/reset-password');
  assert.deepEqual(calls[0]?.args, ['cook@example.com', { redirectTo: 'https://preview.example.dev/reset-password' }]);
  assert.deepEqual(result, { ok: true, notice: AUTH_RESET_COPY.sent });
});

test('saving a new password calls updateUser once the rules pass', async () => {
  const { auth, calls } = fakeAuth({ updateUser: { data: {}, error: null } });
  assert.deepEqual(await updatePassword(auth, 'secret1', 'secret1'), { ok: true, notice: AUTH_RESET_COPY.saved });
  assert.deepEqual(calls[0], { name: 'updateUser', args: [{ password: 'secret1' }] });
});

test('a bad new password never reaches the server', async () => {
  const { auth, calls } = fakeAuth({});
  assert.deepEqual(await updatePassword(auth, 'abc', 'abc'), { ok: false, error: AUTH_RESULT_COPY.weakPassword });
  assert.deepEqual(await updatePassword(auth, 'secret1', 'secret9'), { ok: false, error: AUTH_RESET_COPY.mismatch });
  assert.equal(calls.length, 0);
});

test('saving a new password: server errors and no server', async () => {
  const same = fakeAuth({
    updateUser: { data: {}, error: { message: 'New password should be different from the old password.' } },
  });
  assert.deepEqual(await updatePassword(same.auth, 'secret1', 'secret1'), {
    ok: false,
    error: AUTH_RESET_COPY.samePassword,
  });
  const offline = fakeAuth({ updateUser: new Error('Failed to fetch') });
  assert.deepEqual(await updatePassword(offline.auth, 'secret1', 'secret1'), {
    ok: false,
    error: AUTH_RESULT_COPY.offline,
  });
  assert.deepEqual(await updatePassword(null, 'secret1', 'secret1'), {
    ok: false,
    error: AUTH_RESULT_COPY.unavailable,
  });
});
