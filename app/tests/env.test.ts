import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUsableSupabaseUrl } from '../src/lib/env';

test('https server addresses are usable', () => {
  assert.equal(isUsableSupabaseUrl('https://example.supabase.co'), true);
});

test('plain http is usable only for the local stack on this machine', () => {
  assert.equal(isUsableSupabaseUrl('http://127.0.0.1:54321'), true);
  assert.equal(isUsableSupabaseUrl('http://localhost:54321'), true);
  assert.equal(isUsableSupabaseUrl('http://localhost'), true);
  assert.equal(isUsableSupabaseUrl('http://example.com'), false);
  assert.equal(isUsableSupabaseUrl('http://localhost.example.com'), false);
  assert.equal(isUsableSupabaseUrl('http://127.0.0.1.example.com'), false);
  assert.equal(isUsableSupabaseUrl(''), false);
});
