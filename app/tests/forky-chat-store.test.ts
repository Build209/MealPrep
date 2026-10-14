/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createChatStore, usageForPeriod } from '../src/forky/chatStore';

test('messages are kept per account, in memory', () => {
  const store = createChatStore();
  let notified = 0;
  const off = store.subscribe(() => (notified += 1));
  const asked = store.add('u1', { role: 'user', text: 'What can I make?' });
  store.add('u1', { role: 'forky', text: 'Fried rice.', recipes: [], safetyNote: false });
  assert.deepEqual(store.snapshot('u1').messages.map((m) => m.text), ['What can I make?', 'Fried rice.']);
  assert.equal(notified, 2);

  // Another account sees nothing, and its first message replaces the old chat.
  assert.deepEqual(store.snapshot('u2').messages, []);
  assert.equal(store.snapshot('u2'), store.snapshot('u2'), 'stable snapshot');
  store.add('u2', { role: 'user', text: 'Hi' });
  assert.deepEqual(store.snapshot('u1').messages, []);

  store.remove('u2', asked.key); // a key from the old chat changes nothing
  assert.equal(store.snapshot('u2').messages.length, 1);
  const again = store.snapshot('u2').messages[0]!;
  store.remove('u2', again.key);
  assert.deepEqual(store.snapshot('u2').messages, []);
  off();
});

test('server usage counts only for its month', () => {
  const store = createChatStore();
  store.setServerUsage('u1', { period: '2026-10', limit: 5, remaining: 0 });
  assert.deepEqual(usageForPeriod(store.snapshot('u1').serverUsage, '2026-10'), { limit: 5, remaining: 0 });
  assert.equal(usageForPeriod(store.snapshot('u1').serverUsage, '2026-11'), null);
  assert.equal(store.snapshot('u2').serverUsage, null);
});

test('the chat is never written to device storage', () => {
  const dir = join(__dirname, '..', 'src', 'forky');
  for (const file of ['chatStore.ts', 'ForkyChatScreen.tsx', 'api.ts', 'request.ts']) {
    const text = readFileSync(join(dir, file), 'utf8');
    assert.doesNotMatch(text, /localStorage|AsyncStorage|sessionStorage|setItem\(/, file);
  }
  assert.ok(readdirSync(dir).includes('chatStore.ts'));
});
