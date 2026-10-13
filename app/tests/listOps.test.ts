/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, isTempId, removeItem, replaceItem, rollback, tempId, updateItem } from '../src/data/listOps';

type Row = { id: string; name: string; quantity: number };

const list: Row[] = [
  { id: 'a', name: 'Apples', quantity: 3 },
  { id: 'b', name: 'Beans', quantity: 1 },
  { id: 'c', name: 'Carrots', quantity: 5 },
];
const frozen = JSON.stringify(list);

test('updateItem changes only the named row and never mutates the input', () => {
  const next = updateItem<Row>('b', { quantity: 7 }).apply(list);
  assert.deepEqual(next.map((r) => r.quantity), [3, 7, 5]);
  assert.equal(next[0], list[0]); // untouched rows keep their identity
  assert.equal(JSON.stringify(list), frozen);
});

test('updateItem on an unknown id leaves the list as it was', () => {
  assert.deepEqual(updateItem<Row>('zzz', { quantity: 9 }).apply(list), list);
});

test('rollback restores exactly the snapshot when nothing else changed', () => {
  const change = updateItem<Row>('a', { quantity: 0 });
  const applied = change.apply(list);
  const restored = rollback(applied, list, applied, change);
  assert.deepEqual(restored, list);
  assert.equal(JSON.stringify(list), frozen);
});

test('a failed delete brings the item back in its old place', () => {
  const change = removeItem<Row>('b');
  const applied = change.apply(list);
  assert.deepEqual(applied.map((r) => r.id), ['a', 'c']);
  assert.deepEqual(rollback(applied, list, applied, change), list);
});

test('a failed delete brings the item back even after another change moved the list on', () => {
  const del = removeItem<Row>('b');
  const afterDelete = del.apply(list);
  const other = updateItem<Row>('c', { quantity: 9 });
  const afterOther = other.apply(afterDelete);
  const restored = rollback(afterOther, list, afterDelete, del);
  assert.deepEqual(restored, [list[0], list[1], { id: 'c', name: 'Carrots', quantity: 9 }]);
});

test('reverting a delete never duplicates a row that is already back (for example after a refetch)', () => {
  const del = removeItem<Row>('b');
  const applied = del.apply(list);
  const refetched = [...list];
  assert.deepEqual(rollback(refetched, list, applied, del), list);
});

test('two quick updates to different rows do not clobber each other when the first fails', () => {
  const first = updateItem<Row>('a', { quantity: 10 });
  const snap1 = list;
  const applied1 = first.apply(snap1);

  const second = updateItem<Row>('c', { quantity: 20 });
  const snap2 = applied1;
  const applied2 = second.apply(snap2);

  // First fails after the second was applied: only row a goes back.
  const afterRollback = rollback(applied2, snap1, applied1, first);
  assert.deepEqual(afterRollback.map((r) => r.quantity), [3, 1, 20]);
});

test('two quick updates to different rows do not clobber each other when the second fails', () => {
  const first = updateItem<Row>('a', { quantity: 10 });
  const applied1 = first.apply(list);
  const second = updateItem<Row>('c', { quantity: 20 });
  const applied2 = second.apply(applied1);

  // Nothing changed since the second was applied, so its snapshot (which holds the first change) comes back.
  const afterRollback = rollback(applied2, applied1, applied2, second);
  assert.deepEqual(afterRollback.map((r) => r.quantity), [10, 1, 5]);
});

test('rollback with no current list restores the snapshot', () => {
  const change = updateItem<Row>('a', { quantity: 0 });
  assert.deepEqual(rollback(undefined, list, change.apply(list), change), list);
});

test('addItem appends a placeholder and undo removes it', () => {
  const placeholder: Row = { id: tempId(), name: 'Dill', quantity: 1 };
  const change = addItem(placeholder);
  const applied = change.apply(list);
  assert.equal(applied.length, 4);
  assert.equal(applied[3], placeholder);
  assert.deepEqual(addItem(placeholder, 'start').apply(list)[0], placeholder);
  const other = updateItem<Row>('a', { quantity: 0 }).apply(applied);
  assert.deepEqual(rollback(other, list, applied, change).map((r) => r.id), ['a', 'b', 'c']);
});

test('replaceItem swaps the placeholder for the server row', () => {
  const placeholder: Row = { id: tempId(), name: 'Dill', quantity: 1 };
  const withPlaceholder = [...list, placeholder];
  const server: Row = { id: 'd-real', name: 'Dill', quantity: 1 };
  const next = replaceItem(withPlaceholder, server, placeholder.id);
  assert.deepEqual(next.map((r) => r.id), ['a', 'b', 'c', 'd-real']);
});

test('replaceItem keeps one copy when a refetch already brought the server row', () => {
  const placeholder: Row = { id: tempId(), name: 'Dill', quantity: 1 };
  const server: Row = { id: 'd-real', name: 'Dill', quantity: 1 };
  const next = replaceItem([...list, server, placeholder], server, placeholder.id);
  assert.deepEqual(next.map((r) => r.id), ['a', 'b', 'c', 'd-real']);
});

test('replaceItem puts the server copy in place of the same id', () => {
  const server: Row = { id: 'b', name: 'Beans', quantity: 4 };
  const next = replaceItem(list, server);
  assert.equal(next[1], server);
  assert.equal(next[0], list[0]);
});

test('temporary ids are unique and recognisable', () => {
  const a = tempId();
  const b = tempId();
  assert.notEqual(a, b);
  assert.ok(isTempId(a));
  assert.ok(!isTempId('11111111-1111-1111-1111-111111111111'));
});
