/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withViewportFitCover } from '../src/lib/viewport';

test('viewport-fit=cover is added to Expo web\'s viewport meta', () => {
  assert.equal(
    withViewportFitCover('width=device-width, initial-scale=1, shrink-to-fit=no'),
    'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover',
  );
});

test('an existing viewport-fit is replaced, not doubled', () => {
  assert.equal(withViewportFitCover('width=device-width,viewport-fit=auto'), 'width=device-width, viewport-fit=cover');
  assert.equal(withViewportFitCover('width=device-width, viewport-fit=cover'), 'width=device-width, viewport-fit=cover');
});

test('a missing or empty viewport gets the plain phone viewport plus cover', () => {
  for (const raw of [null, undefined, '', ' , ']) {
    assert.equal(withViewportFitCover(raw), 'width=device-width, initial-scale=1, viewport-fit=cover');
  }
});
