/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataError, messages, retryUnlessPermanent, run, signedOutError, toDataError } from '../src/data/errors';

test('supabase errors become plain-language DataErrors', () => {
  const notFound = toDataError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
  assert.ok(notFound instanceof Error);
  assert.equal(notFound.kind, 'not-found');
  assert.equal(notFound.message, messages.notFound);

  assert.equal(toDataError({ code: '42501', message: 'new row violates row-level security policy' }).kind, 'forbidden');
  assert.equal(toDataError(new TypeError('Failed to fetch')).kind, 'network');
  const other = toDataError({ code: '23505', message: 'duplicate key value violates unique constraint' });
  assert.equal(other.kind, 'server');
  assert.equal(other.message, messages.server); // raw server text is not shown
});

test('a DataError passes through unchanged', () => {
  const e = signedOutError();
  assert.equal(toDataError(e), e);
});

test('permanent failures are not retried; others retry once', () => {
  assert.equal(retryUnlessPermanent(0, signedOutError()), false);
  assert.equal(retryUnlessPermanent(0, new DataError('network', messages.network)), true);
  assert.equal(retryUnlessPermanent(1, new DataError('network', messages.network)), false);
});

test('run returns data, throws plain errors otherwise', async () => {
  assert.deepEqual(await run<number[]>(Promise.resolve({ data: [1, 2], error: null })), [1, 2]);
  await assert.rejects(run(Promise.resolve({ data: null, error: { code: '42501', message: 'rls' } })), (err: unknown) => {
    return err instanceof DataError && err.kind === 'forbidden';
  });
  await assert.rejects(run(Promise.resolve({ data: null, error: null })), (err: unknown) => {
    return err instanceof DataError && err.kind === 'not-found';
  });
  await assert.rejects(run(Promise.reject(new TypeError('Failed to fetch'))), (err: unknown) => {
    return err instanceof DataError && err.kind === 'network';
  });
});
