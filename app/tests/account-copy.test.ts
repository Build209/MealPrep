/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCOUNT_DELETE_COPY, ACCOUNT_DELETE_ERRORS, SUPPORT_EMAIL } from '../src/account/copy';

const mobile = join(__dirname, '..', '..', 'mobile');
const skip = !existsSync(join(mobile, 'config', 'account.ts')) && 'old app removed';

/** JSX and string concatenation break lines differently: compare with all whitespace squeezed. */
const squeeze = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Joins the pieces of a '...' + '...' concatenation in source so they can be compared. */
const unsplit = (s: string) => s.replace(/'\s*\+\s*'/g, '');

test('LIVE wording is still word for word in the old app', { skip }, () => {
  const read = (f: string) => readFileSync(join(mobile, f), 'utf8');
  const account = read('config/account.ts');
  const page = squeeze(read('app/delete-account.tsx'));
  const client = read('lib/account/deleteAccount.ts');
  const fn = unsplit(read('supabase/functions/delete-user-account/index.ts'));

  for (const line of [
    ACCOUNT_DELETE_COPY.deleteButton,
    ACCOUNT_DELETE_COPY.confirmTitle,
    ACCOUNT_DELETE_COPY.confirmBody,
    ACCOUNT_DELETE_COPY.confirmAction,
    ACCOUNT_DELETE_COPY.cancel,
  ]) {
    assert.ok(account.includes(`'${line}'`), `not in mobile/config/account.ts: ${line}`);
  }
  for (const line of [
    ACCOUNT_DELETE_COPY.title,
    ACCOUNT_DELETE_COPY.whatIsDeleted,
    ACCOUNT_DELETE_COPY.signedOutHint,
    ACCOUNT_DELETE_COPY.deleted,
    ACCOUNT_DELETE_COPY.helpBefore,
    ACCOUNT_DELETE_COPY.helpAfter,
    ACCOUNT_DELETE_COPY.privacyLink,
  ]) {
    assert.ok(page.includes(squeeze(line)), `not in mobile/app/delete-account.tsx: ${line}`);
  }
  for (const line of [ACCOUNT_DELETE_ERRORS.signedOut, ACCOUNT_DELETE_ERRORS.notConfigured, ACCOUNT_DELETE_ERRORS.failed]) {
    assert.ok(client.includes(`'${line}'`), `not in mobile/lib/account/deleteAccount.ts: ${line}`);
  }
  assert.ok(fn.includes(`'${ACCOUNT_DELETE_ERRORS.cancelFailed}'`), 'CANCEL_FAILED wording changed in the function');
  assert.ok(fn.includes("code: 'CANCEL_FAILED'"), 'CANCEL_FAILED code changed in the function');
  assert.ok(read('config/support.ts').includes(`'${SUPPORT_EMAIL}'`), 'support address changed');
});

test('the confirm step says Plus is cancelled and that it cannot be undone', () => {
  assert.match(ACCOUNT_DELETE_COPY.confirmBody, /If you have MealPlanatic Plus, it is cancelled now and you will not be charged again\./);
  assert.match(ACCOUNT_DELETE_COPY.confirmBody, /This cannot be undone\.$/);
  assert.match(ACCOUNT_DELETE_COPY.whatIsDeleted, /cancels MealPlanatic Plus and stops future charges\.$/);
});
