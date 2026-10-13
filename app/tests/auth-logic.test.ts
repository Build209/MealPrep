/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_RESET_COPY, AUTH_RESULT_COPY, AUTH_SCREEN_COPY, LEGAL_LINKS, MINIMUM_AGE } from '../src/auth/copy';
import {
  authErrorMessage,
  canSubmit,
  isLongEnoughPassword,
  isPlausibleEmail,
  signUpOutcome,
  submitBlocker,
  type AuthForm,
} from '../src/auth/logic';

const good: AuthForm = { email: 'cook@example.com', password: 'secret1', ageConfirmed: true };

test('email check accepts normal addresses and trims spaces', () => {
  assert.equal(isPlausibleEmail('cook@example.com'), true);
  assert.equal(isPlausibleEmail('  cook@example.co.uk '), true);
  assert.equal(isPlausibleEmail('cook@example'), false);
  assert.equal(isPlausibleEmail('cook example@x.com'), false);
  assert.equal(isPlausibleEmail(''), false);
});

test('password needs at least 6 characters', () => {
  assert.equal(isLongEnoughPassword('12345'), false);
  assert.equal(isLongEnoughPassword('123456'), true);
});

test('sign-up cannot be sent until the 18+ box is ticked', () => {
  const unticked = { ...good, ageConfirmed: false };
  assert.equal(canSubmit('sign-up', unticked, false), false);
  assert.equal(submitBlocker('sign-up', unticked), AUTH_RESULT_COPY.ageNotConfirmed);
  assert.equal(canSubmit('sign-up', good, false), true);
});

test('sign-up also needs a plausible email and a long enough password', () => {
  assert.equal(submitBlocker('sign-up', { ...good, email: '' }), AUTH_RESULT_COPY.missingFields);
  assert.equal(submitBlocker('sign-up', { ...good, email: 'nope' }), AUTH_RESULT_COPY.invalidEmail);
  assert.equal(submitBlocker('sign-up', { ...good, password: 'abc' }), AUTH_RESULT_COPY.weakPassword);
});

test('sign-in does not need the 18+ box or a 6-character password', () => {
  assert.equal(canSubmit('sign-in', { ...good, ageConfirmed: false, password: 'abc' }, false), true);
  assert.equal(submitBlocker('sign-in', { ...good, password: '' }), AUTH_RESULT_COPY.missingFields);
});

test('reset needs only an email', () => {
  assert.equal(canSubmit('reset', { email: 'cook@example.com', password: '', ageConfirmed: false }, false), true);
  assert.equal(submitBlocker('reset', { email: ' ', password: '', ageConfirmed: false }), AUTH_RESET_COPY.missingEmail);
  assert.equal(submitBlocker('reset', { email: 'x', password: '', ageConfirmed: false }), AUTH_RESULT_COPY.invalidEmail);
});

test('nothing can be sent twice while a request is running', () => {
  assert.equal(canSubmit('sign-in', good, true), false);
  assert.equal(canSubmit('sign-up', good, true), false);
  assert.equal(canSubmit('reset', good, true), false);
});

test('server messages become plain words', () => {
  const cases: Array<[string | null | undefined, string]> = [
    ['Invalid login credentials', AUTH_RESULT_COPY.wrongCredentials],
    ['User already registered', AUTH_RESULT_COPY.alreadyRegistered],
    ['Email not confirmed', AUTH_RESULT_COPY.emailNotConfirmed],
    ['Password should be at least 6 characters.', AUTH_RESULT_COPY.weakPassword],
    ['Unable to validate email address: invalid format', AUTH_RESULT_COPY.invalidEmail],
    ['email rate limit exceeded', AUTH_RESULT_COPY.tooManyAttempts],
    ['For security purposes, you can only request this after 42 seconds.', AUTH_RESULT_COPY.tooManyAttempts],
    ['Failed to fetch', AUTH_RESULT_COPY.offline],
    ['Network request failed', AUTH_RESULT_COPY.offline],
    ['', AUTH_RESULT_COPY.generic],
    [null, AUTH_RESULT_COPY.generic],
    [undefined, AUTH_RESULT_COPY.generic],
  ];
  for (const [raw, expected] of cases) assert.equal(authErrorMessage(raw), expected, String(raw));
});

test('an unknown server message is shown as it came', () => {
  assert.equal(authErrorMessage('  Signups not allowed for this instance '), 'Signups not allowed for this instance');
});

test('sign-up reply: session, existing address, or confirm by email', () => {
  assert.deepEqual(signUpOutcome({ session: { access_token: 'x' }, user: { identities: [{}] } }), { ok: true });
  assert.deepEqual(signUpOutcome({ session: null, user: { identities: [] } }), {
    ok: false,
    error: AUTH_RESULT_COPY.alreadyRegistered,
  });
  assert.deepEqual(signUpOutcome({ session: null, user: { identities: [{}] } }), {
    ok: true,
    notice: AUTH_RESULT_COPY.confirmEmail,
  });
  assert.deepEqual(signUpOutcome({ session: null, user: null }), { ok: true, notice: AUTH_RESULT_COPY.confirmEmail });
});

test('18+ wording and legal links match the live pages', () => {
  assert.equal(MINIMUM_AGE, 18);
  assert.match(AUTH_SCREEN_COPY.ageCheckbox, /18 or older/);
  assert.match(AUTH_SCREEN_COPY.ageCheckbox, /Terms and Privacy Policy/);
  assert.equal(LEGAL_LINKS.terms, 'https://mealplanatic.app/terms.html');
  assert.equal(LEGAL_LINKS.privacy, 'https://mealplanatic.app/privacy.html');
});
