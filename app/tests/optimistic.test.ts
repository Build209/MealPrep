/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryClient } from '@tanstack/react-query';
import { DataError } from '../src/data/errors';
import { removeItem, updateItem } from '../src/data/listOps';
import { listMutation } from '../src/data/optimistic';

type Row = { id: string; quantity: number };
type Vars = { id: string; quantity: number };

/** The few QueryClient methods listMutation uses, backed by a Map. */
function fakeClient(initial: Row[] | undefined) {
  const data = new Map<string, unknown>();
  const key = JSON.stringify(['pantry', 'u1', 'list']);
  if (initial) data.set(key, initial);
  const calls = { cancel: 0, invalidate: 0 };
  let running = 0;
  const client = {
    getQueryData: (k: unknown) => data.get(JSON.stringify(k)),
    setQueryData: (k: unknown, updater: unknown) => {
      const id = JSON.stringify(k);
      const next = typeof updater === 'function' ? (updater as (old: unknown) => unknown)(data.get(id)) : updater;
      data.set(id, next);
      return next;
    },
    cancelQueries: async () => {
      calls.cancel += 1;
    },
    invalidateQueries: async () => {
      calls.invalidate += 1;
    },
    isMutating: () => running,
  };
  return {
    queryClient: client as unknown as QueryClient,
    list: () => data.get(key) as Row[] | undefined,
    calls,
    setRunning: (n: number) => {
      running = n;
    },
  };
}

const queryKey = ['pantry', 'u1', 'list'] as const;
const mutationKey = ['pantry', 'update-quantity'] as const;
const start: Row[] = [
  { id: 'a', quantity: 1 },
  { id: 'b', quantity: 2 },
];

function updater(fake: ReturnType<typeof fakeClient>, online = true) {
  return listMutation<Row, Vars, Row>({
    queryClient: fake.queryClient,
    queryKey,
    mutationKey,
    change: ({ id, quantity }) => updateItem<Row>(id, { quantity }),
    isOnline: () => online,
  });
}

test('applies at once, then the server row replaces it', async () => {
  const fake = fakeClient(start);
  const m = updater(fake);
  const ctx = await m.onMutate({ id: 'a', quantity: 5 });
  assert.equal(fake.calls.cancel, 1);
  assert.deepEqual(fake.list(), [{ id: 'a', quantity: 5 }, { id: 'b', quantity: 2 }]);
  m.onSuccess({ id: 'a', quantity: 4 }, { id: 'a', quantity: 5 }); // server rounded it
  assert.deepEqual(fake.list(), [{ id: 'a', quantity: 4 }, { id: 'b', quantity: 2 }]);
  assert.ok(ctx);
});

test('server refuses: rollback restores exactly the snapshot', async () => {
  const fake = fakeClient(start);
  const m = updater(fake);
  const ctx = await m.onMutate({ id: 'a', quantity: 5 });
  m.onError(new Error('no'), { id: 'a', quantity: 5 }, ctx);
  assert.deepEqual(fake.list(), start);
});

test('failed delete brings the item back', async () => {
  const fake = fakeClient(start);
  const m = listMutation<Row, { id: string }, null>({
    queryClient: fake.queryClient,
    queryKey,
    mutationKey,
    change: ({ id }) => removeItem<Row>(id),
  });
  const ctx = await m.onMutate({ id: 'b' });
  assert.deepEqual(fake.list(), [{ id: 'a', quantity: 1 }]);
  m.onError(new Error('no'), { id: 'b' }, ctx);
  assert.deepEqual(fake.list(), start);
});

test('two quick updates to different rows: first fails, second survives', async () => {
  const fake = fakeClient(start);
  const m = updater(fake);
  const ctxA = await m.onMutate({ id: 'a', quantity: 10 });
  const ctxB = await m.onMutate({ id: 'b', quantity: 20 });
  m.onError(new Error('no'), { id: 'a', quantity: 10 }, ctxA);
  assert.deepEqual(fake.list(), [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 20 }]);
  m.onSuccess({ id: 'b', quantity: 20 }, { id: 'b', quantity: 20 });
  assert.deepEqual(fake.list(), [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 20 }]);
  assert.ok(ctxB);
});

test('offline: refuses before anything changes on screen', async () => {
  const fake = fakeClient(start);
  const m = updater(fake, false);
  await assert.rejects(m.onMutate({ id: 'a', quantity: 9 }), (err: unknown) => {
    assert.ok(err instanceof DataError);
    assert.equal(err.kind, 'offline');
    assert.equal(err.message, "You're offline. Changes need a connection.");
    return true;
  });
  assert.deepEqual(fake.list(), start);
});

test('nothing loaded yet: no optimistic change, no crash on error', async () => {
  const fake = fakeClient(undefined);
  const m = updater(fake);
  const ctx = await m.onMutate({ id: 'a', quantity: 9 });
  assert.equal(ctx, undefined);
  m.onError(new Error('no'), { id: 'a', quantity: 9 }, ctx);
  m.onSuccess({ id: 'a', quantity: 9 }, { id: 'a', quantity: 9 });
  assert.equal(fake.list(), undefined);
});

test('refetch waits until the last running change has settled', async () => {
  const fake = fakeClient(start);
  const m = updater(fake);
  fake.setRunning(2); // this one plus another still waiting for the server
  await m.onSettled();
  assert.equal(fake.calls.invalidate, 0);
  fake.setRunning(1); // only this one
  await m.onSettled();
  assert.equal(fake.calls.invalidate, 1);
});
