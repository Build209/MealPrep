/**
 * Sign-in sheet (bug sweep, 2026-10-10): a failed sign-in must stay on screen with the reason.
 * Run: npx tsx scripts/auth-sheet-check.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AUTH_RESULT_COPY, authErrorMessage } from '../config/authConfig';

// --- Plain wording for the auth server's messages ---
assert.equal(authErrorMessage('Invalid login credentials'), AUTH_RESULT_COPY.wrongCredentials);
assert.equal(authErrorMessage('User already registered'), AUTH_RESULT_COPY.alreadyRegistered);
assert.equal(authErrorMessage('Email not confirmed'), AUTH_RESULT_COPY.emailNotConfirmed);
assert.equal(authErrorMessage('Password should be at least 6 characters.'), AUTH_RESULT_COPY.weakPassword);
assert.equal(authErrorMessage('Unable to validate email address: invalid format'), AUTH_RESULT_COPY.invalidEmail);
assert.equal(authErrorMessage('Email rate limit exceeded'), AUTH_RESULT_COPY.tooManyAttempts);
assert.equal(authErrorMessage('For security purposes, you can only request this after 42 seconds.'), AUTH_RESULT_COPY.tooManyAttempts);
assert.equal(authErrorMessage('Failed to fetch'), AUTH_RESULT_COPY.offline);
assert.equal(authErrorMessage(''), AUTH_RESULT_COPY.generic);
assert.equal(authErrorMessage(undefined), AUTH_RESULT_COPY.generic);
assert.equal(authErrorMessage('Signups not allowed for this instance'), 'Signups not allowed for this instance', 'anything unrecognised is shown as it came');

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

// --- The sheet only closes when the person is signed in ---
const sheet = read('components/account/AuthSheet.tsx');
const run = sheet.slice(sheet.indexOf('async function run('), sheet.indexOf('function submitPassword('));
assert.match(run, /if \(!result\.ok\) \{\s*setError\(result\.error\);\s*return;\s*\}/, 'a failed attempt shows its reason and keeps the sheet open');
assert.match(run, /if \(result\.notice\) \{\s*setStatus\(result\.notice\);\s*return;\s*\}/, '"confirm by email" stays on screen');
assert.equal((run.match(/onClose\(\)/g) ?? []).length, 1, 'one way to close: success');
assert.ok(run.indexOf('onClose()') > run.indexOf('result.notice'), 'closing comes after both checks');
assert.doesNotMatch(sheet, /authError/, 'the sheet shows its own error, not the app-wide one (which could be about the pantry)');
assert.match(sheet, /password\.length < AUTH_MIN_PASSWORD_LENGTH/, 'a too-short password is caught before asking the server');

// --- The context reports what happened instead of swallowing it ---
const context = read('context/AppContext.tsx');
const signIn = context.slice(context.indexOf('const signInWithPassword = useCallback('), context.indexOf('const signUpWithPassword = useCallback('));
assert.match(signIn, /if \(error\) return \{ ok: false, error: authErrorMessage\(error\.message\) \};/);
const signUp = context.slice(context.indexOf('const signUpWithPassword = useCallback('), context.indexOf('const signInWithMagicLink = useCallback('));
assert.match(signUp, /identities\.length === 0\) \{\s*return \{ ok: false, error: AUTH_RESULT_COPY\.alreadyRegistered \};/, 'an address that already has an account says so');
assert.match(signUp, /return \{ ok: true, notice: AUTH_RESULT_COPY\.confirmEmail \};/, 'sign-up that needs email confirmation says so');

// --- Guest kitchen merge is not repeated after a partial failure ---
const load = context.slice(context.indexOf('const loadLiveData = useCallback('), context.indexOf('const clearKitchenError = useCallback('));
assert.ok(
  load.indexOf('writeGuestPantry([]);') > load.indexOf('await insertPantryItems(supabase, userId, merged.pantryInserts)') &&
    load.indexOf('writeGuestPantry([]);') < load.indexOf('nextGrocery = await replaceGroceryList('),
  'the guest pantry is forgotten once saved, before the next step can fail',
);

console.log('auth-sheet-check: ok');
