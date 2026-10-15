/// <reference types="node" />
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { onlineManager } from '@tanstack/react-query';
import { DataError, messages } from '../src/data/errors';
import { refuseWhenOffline } from '../src/data/online';
import { makeQueryClient } from '../src/lib/queryClient';

/**
 * The app's QueryClient must never hold a change made offline and send it later (TanStack
 * Query's default networkMode 'online' pauses it: "Saving..." with no end, then a save on its
 * own). Every mutation fails at once with the plain offline message, before its onMutate runs.
 */

afterEach(() => {
  onlineManager.setOnline(true);
});

/** Rejects if `promise` has not settled within `ms` (a paused mutation never settles). */
function within<T>(promise: Promise<T>, ms = 500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms)),
  ]);
}

function build(client: ReturnType<typeof makeQueryClient>) {
  const calls = { fn: 0, onMutate: 0, onError: 0 };
  const mutation = client.getMutationCache().build(client, {
    mutationKey: ['test', 'save'],
    mutationFn: async (vars: { n: number }) => {
      calls.fn += 1;
      return vars.n * 2;
    },
    onMutate: () => {
      calls.onMutate += 1;
      return { optimistic: true };
    },
    onError: () => {
      calls.onError += 1;
    },
  });
  return { mutation, calls };
}

const isOfflineError = (e: unknown) => e instanceof DataError && e.kind === 'offline' && e.message === messages.offline;

test('refuseWhenOffline throws the plain offline error only when offline', () => {
  onlineManager.setOnline(true);
  assert.doesNotThrow(() => refuseWhenOffline());
  onlineManager.setOnline(false);
  assert.throws(() => refuseWhenOffline(), isOfflineError);
});

test('offline: a mutation fails at once with the offline message, before onMutate and the request', async () => {
  const client = makeQueryClient();
  onlineManager.setOnline(false);
  const { mutation, calls } = build(client);
  await assert.rejects(within(mutation.execute({ n: 2 })), isOfflineError);
  assert.equal(messages.offline, "You're offline. Changes need a connection.");
  assert.equal(calls.onMutate, 0, 'no optimistic change was made');
  assert.equal(calls.fn, 0, 'nothing was sent');
  assert.equal(calls.onError, 1, 'the screen hears the error');
  assert.equal(mutation.state.status, 'error');
  assert.equal(mutation.state.isPaused, false);
});

test('offline: nothing is held and sent when the connection comes back', async () => {
  const client = makeQueryClient();
  onlineManager.setOnline(false);
  const { mutation, calls } = build(client);
  await within(mutation.execute({ n: 2 })).catch(() => undefined);
  onlineManager.setOnline(true);
  await client.resumePausedMutations();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls.fn, 0);
  assert.equal(client.getMutationCache().getAll().filter((m) => m.state.isPaused).length, 0);
});

test('online: mutations run as normal', async () => {
  const client = makeQueryClient();
  onlineManager.setOnline(true);
  const { mutation, calls } = build(client);
  assert.equal(await within(mutation.execute({ n: 3 })), 6);
  assert.equal(calls.onMutate, 1);
  assert.equal(calls.fn, 1);
});

test('mutations never pause for the connection (networkMode always, no retries)', () => {
  const client = makeQueryClient();
  assert.equal(client.getDefaultOptions().mutations?.networkMode, 'always');
  assert.equal(client.getDefaultOptions().mutations?.retry, 0);
});
