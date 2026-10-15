/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keys, mutationKeys, SIGNED_OUT } from '../src/data/keys';

test('same input gives an equal key every time', () => {
  assert.deepEqual(keys.pantry.list('u1'), keys.pantry.list('u1'));
  assert.deepEqual(keys.profile.own('u1'), keys.profile.own('u1'));
  assert.deepEqual(keys.auth.session(), keys.auth.session());
  assert.deepEqual(mutationKeys.pantry.updateQuantity(), mutationKeys.pantry.updateQuantity());
});

test('keys are plain arrays of strings (stable under JSON hashing)', () => {
  const k = keys.pantry.list('u1');
  assert.equal(JSON.stringify(k), JSON.stringify(['pantry', 'u1', 'list']));
  assert.ok(k.every((part) => typeof part === 'string'));
});

test('different users never share a key', () => {
  assert.notDeepEqual(keys.pantry.list('u1'), keys.pantry.list('u2'));
  assert.notDeepEqual(keys.profile.own('u1'), keys.profile.own('u2'));
});

test('signed out maps to one fixed scope', () => {
  assert.deepEqual(keys.pantry.list(null), ['pantry', SIGNED_OUT, 'list']);
  assert.deepEqual(keys.pantry.list(undefined), keys.pantry.list(null));
  assert.deepEqual(keys.pantry.list(''), keys.pantry.list(null));
});

test('feature prefixes reach every key of that feature', () => {
  const startsWith = (key: readonly string[], prefix: readonly string[]) => prefix.every((p, i) => key[i] === p);
  assert.ok(startsWith(keys.pantry.list('u1'), keys.pantry.all));
  assert.ok(startsWith(keys.profile.own('u1'), keys.profile.all));
  assert.ok(startsWith(keys.auth.session(), keys.auth.all));
  assert.ok(startsWith(mutationKeys.pantry.updateQuantity(), mutationKeys.pantry.all));
  assert.ok(!startsWith(keys.profile.own('u1'), keys.pantry.all));
});
