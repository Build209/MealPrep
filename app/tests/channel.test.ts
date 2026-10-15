/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLine, channelLabel, parseChannel, PREVIEW_LABEL, shortSha, signUpRedirect } from '../src/lib/channel';

test('only the exact "preview" channel is a preview', () => {
  assert.equal(parseChannel('preview'), 'preview');
  assert.equal(parseChannel(' Preview '), 'preview');
  for (const raw of [undefined, '', 'production', 'previews', 'dev']) {
    assert.equal(parseChannel(raw), 'default');
  }
});

test('the label shows on preview builds only', () => {
  assert.equal(channelLabel('preview'), PREVIEW_LABEL);
  assert.equal(PREVIEW_LABEL, 'Preview build');
  assert.equal(channelLabel('default'), null);
});

test('short commit id is the first 7 characters of a real commit id', () => {
  assert.equal(shortSha('1A2B3C4D5E6F7a8b9c0d1e2f3a4b5c6d7e8f9a0b'), '1a2b3c4');
  assert.equal(shortSha('abcdef1'), 'abcdef1');
  for (const raw of [undefined, '', 'abc12', 'not-a-sha', 'xyz1234567']) {
    assert.equal(shortSha(raw), null);
  }
});

test('build line for the Home card', () => {
  assert.equal(buildLine('fe1d823aaaa'), 'Build fe1d823');
  assert.equal(buildLine(undefined), null);
});

test('sign-up email link goes back to the preview address only on preview web builds', () => {
  const live = 'https://mealplanatic.app/';
  assert.equal(signUpRedirect('preview', 'https://mealplanatic-preview.pages.dev', live), 'https://mealplanatic-preview.pages.dev/');
  assert.equal(signUpRedirect('preview', 'https://x.pages.dev/pantry?a=1', live), 'https://x.pages.dev/');
  assert.equal(signUpRedirect('default', 'https://x.pages.dev', live), live);
  assert.equal(signUpRedirect('preview', undefined, live), live);
  assert.equal(signUpRedirect('preview', 'http://localhost:8081', live), live);
  assert.equal(signUpRedirect('preview', 'not a url', live), live);
});
