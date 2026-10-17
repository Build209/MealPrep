/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createForkyAsker } from '../src/forky/api';
import { ASK_FORKY_COPY, questionsLeftText } from '../src/forky/copy';
import {
  askForkyUrl,
  buildAskForkyBody,
  buildAskForkyRequest,
  forkyErrorFromResponse,
  ForkyError,
  needsSafetyNote,
  parseAskForkyAnswer,
  type ForkyContext,
} from '../src/forky/request';

const functions = join(__dirname, '..', '..', 'supabase', 'functions');
const functionPath = join(functions, 'ask-forky', 'index.ts');
const sharedPath = join(functions, '_shared', 'askForkyText.ts');
// Snapshot of the old app's mobile/config/askForky.ts (mobile/ is deleted): tests/fixtures/old-app/README.md.
// Missing is a failure, never a skip.
const oldCopyPath = join(__dirname, 'fixtures', 'old-app', 'config_askForky.ts.txt');

const context: ForkyContext = {
  pantry: [
    { name: 'Rice', quantity: 2, unit: 'cup', expiresOn: null },
    { name: 'Milk', quantity: 1, unit: 'gallon', expiresOn: '2026-10-20T00:00:00Z' },
    { name: 'Eggs', quantity: 12.3333, unit: 'each', expiresOn: '2026-10-15' },
    { name: 'Salt', quantity: 0, unit: 'pinch', expiresOn: null },
  ],
  recipes: [{ id: 'r_11111111-1111-4111-8111-111111111111', title: 'Fried rice', have: 2, total: 5, missing: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
  householdSize: 3,
};

test('the URL is <supabase url>/functions/v1/ask-forky', () => {
  assert.equal(askForkyUrl('https://abc.supabase.co/'), 'https://abc.supabase.co/functions/v1/ask-forky');
  assert.equal(askForkyUrl(''), '');
});

test('the body is the old app\'s: soonest use-by first, amounts, recipes, household size', () => {
  const history = [
    { role: 'user' as const, text: 'one' },
    { role: 'forky' as const, text: 'two' },
    { role: 'user' as const, text: 'three' },
    { role: 'forky' as const, text: 'four' },
    { role: 'user' as const, text: 'five' },
  ];
  const body = buildAskForkyBody('  What now?  ', history, context);
  assert.equal(body.question, 'What now?');
  assert.deepEqual(body.history.map((t) => t.text), ['two', 'three', 'four', 'five'], 'last 4 turns');
  assert.deepEqual(body.pantry, [
    { name: 'Eggs', amount: '12.33 each', expiresOn: '2026-10-15' },
    { name: 'Milk', amount: '1 gallon', expiresOn: '2026-10-20' },
    { name: 'Rice', amount: '2 cup' },
    { name: 'Salt' },
  ]);
  assert.deepEqual(body.recipes, [
    { id: 'r_11111111-1111-4111-8111-111111111111', title: 'Fried rice', have: 2, total: 5, missing: ['a', 'b', 'c', 'd', 'e', 'f'] },
  ]);
  assert.deepEqual(body.household, { size: 3 });
  assert.equal('household' in buildAskForkyBody('q', [], { ...context, householdSize: 0 }), false);
  assert.equal('household' in buildAskForkyBody('q', [], { ...context, householdSize: null }), false);
});

test('allergens: sent only when there are some, whitelisted, deduped, fixed order', () => {
  assert.equal('allergens' in buildAskForkyBody('q', [], context), false, 'absent when not given');
  assert.equal('allergens' in buildAskForkyBody('q', [], { ...context, allergens: [] }), false, 'absent when empty');
  assert.equal('allergens' in buildAskForkyBody('q', [], { ...context, allergens: ['lactose', 'gluten'] }), false, 'unknown keys dropped');
  const body = buildAskForkyBody('q', [], { ...context, allergens: ['peanuts', 'milk', 'peanuts', 'bogus', 'tree-nuts'] });
  assert.deepEqual(body.allergens, ['milk', 'tree-nuts', 'peanuts']);
  assert.deepEqual(body.household, { size: 3 }, 'household block still carries no health details');
  assert.equal(JSON.stringify(body.household).includes('milk'), false);
});

test('the client no longer promises that allergy details are never sent', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'forky', 'request.ts'), 'utf8');
  assert.doesNotMatch(src, /No diet, allergy or health details are ever sent/);
});

test('caps: 60 pantry items, 8 recipes', () => {
  const many: ForkyContext = {
    pantry: Array.from({ length: 70 }, (_, i) => ({ name: `item ${i}`, quantity: 1, unit: 'each', expiresOn: null })),
    recipes: Array.from({ length: 12 }, (_, i) => ({ id: `r_${i}`, title: `R${i}`, have: 0, total: 1, missing: [] })),
  };
  const body = buildAskForkyBody('q', [], many);
  assert.equal(body.pantry.length, 60);
  assert.equal(body.recipes.length, 8);
});

test('request: POST with the person\'s token and JSON', () => {
  const init = buildAskForkyRequest(buildAskForkyBody('q', [], context), 'tok');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
  assert.equal(JSON.parse(init.body).question, 'q');
});

test('answers are read in the function\'s shape', () => {
  const answer = parseAskForkyAnswer({
    answer: 'Make fried rice.',
    recipeIds: ['r_1', 7, 'l_2'],
    offTopic: false,
    safetyNote: false,
    remaining: 4,
    limit: 5,
    isPlus: false,
    tier: 'free',
  });
  assert.deepEqual(answer, {
    answer: 'Make fried rice.',
    recipeIds: ['r_1', 'l_2'],
    offTopic: false,
    safetyNote: false,
    remaining: 4,
    limit: 5,
    isPlus: false,
    tier: 'free',
  });
  assert.equal(parseAskForkyAnswer({ answer: '' }), null);
  assert.equal(parseAskForkyAnswer(null), null);
});

test('errors in plain words, by code first', () => {
  const free = forkyErrorFromResponse(429, JSON.stringify({ error: 'No questions left this month.', code: 'LIMIT_REACHED', remaining: 0, limit: 5, isPlus: false, tier: 'free' }));
  assert.equal(free.kind, 'used-up');
  assert.equal(free.message, ASK_FORKY_COPY.limitFree);
  assert.equal(free.limit, 5);
  const plus = forkyErrorFromResponse(429, JSON.stringify({ code: 'LIMIT_REACHED', limit: 15, isPlus: true, tier: 'plus' }));
  assert.equal(plus.message, ASK_FORKY_COPY.limitPlus);
  assert.equal(forkyErrorFromResponse(429, '').kind, 'rate-limit');
  assert.equal(forkyErrorFromResponse(429, '').message, ASK_FORKY_COPY.rateLimit);
  assert.equal(forkyErrorFromResponse(403, JSON.stringify({ code: 'FEATURE_OFF' })).message, ASK_FORKY_COPY.featureOff);
  assert.equal(forkyErrorFromResponse(503, JSON.stringify({ code: 'NOT_CONFIGURED' })).message, ASK_FORKY_COPY.notConfigured);
  assert.equal(forkyErrorFromResponse(503, 'gateway').kind, 'unavailable');
  assert.equal(forkyErrorFromResponse(401, JSON.stringify({ code: 'UNAUTHENTICATED' })).kind, 'signed-out');
  assert.equal(forkyErrorFromResponse(502, JSON.stringify({ error: 'Forky could not answer. Please try again.', code: 'UPSTREAM_ERROR' })).message, ASK_FORKY_COPY.genericError);
  assert.equal(forkyErrorFromResponse(400, JSON.stringify({ code: 'BAD_REQUEST' })).kind, 'unexpected');
});

test('rule 9: the check line shows when the server says so, or the words say so', () => {
  const base = parseAskForkyAnswer({ answer: 'Toss it in a pan.' })!;
  assert.equal(needsSafetyNote('What can I make?', base), false);
  assert.equal(needsSafetyNote('What can I make?', { ...base, safetyNote: true }), true);
  assert.equal(needsSafetyNote('Is this chicken still good?', base), true);
  assert.equal(needsSafetyNote('Dinner?', { ...base, answer: 'Watch for gluten in the soy sauce.' }), true);
});

test('questions left wording', () => {
  assert.equal(questionsLeftText(3), '3 questions left this month');
  assert.equal(questionsLeftText(1), '1 question left this month');
  assert.equal(questionsLeftText(0), 'No questions left this month');
});

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };

test('the asker posts once and returns the answer; refusals become ForkyErrors', async () => {
  const calls: Call[] = [];
  const ask = createForkyAsker({
    url: 'https://x.test/functions/v1/ask-forky',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => JSON.stringify({ answer: 'Hi', recipeIds: [], remaining: 2, limit: 5, isPlus: false, tier: 'free' }) };
    },
  });
  const answer = await ask({ question: 'Hello', history: [], context, accessToken: 'tok' });
  assert.equal(answer.answer, 'Hi');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://x.test/functions/v1/ask-forky');
  assert.equal(calls[0]!.init.headers.Authorization, 'Bearer tok');

  const refused = createForkyAsker({
    url: 'https://x.test/f',
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ code: 'LIMIT_REACHED', isPlus: false, limit: 5 }) }),
  });
  await assert.rejects(refused({ question: 'q', history: [], context, accessToken: 't' }), (e: unknown) => e instanceof ForkyError && e.kind === 'used-up');

  const offline = createForkyAsker({ url: 'https://x.test/f', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(offline({ question: 'q', history: [], context, accessToken: 't' }), (e: unknown) => e instanceof ForkyError && e.kind === 'network');

  const slow = createForkyAsker({ url: 'https://x.test/f', timeoutMs: 20, fetchImpl: () => new Promise<never>(() => {}) });
  await assert.rejects(slow({ question: 'q', history: [], context, accessToken: 't' }), (e: unknown) => e instanceof ForkyError && e.kind === 'timeout');

  const noCall = createForkyAsker({ url: 'https://x.test/f', fetchImpl: async () => { throw new Error('must not be called'); } });
  await assert.rejects(noCall({ question: 'q', history: [], context, accessToken: null }), (e: unknown) => e instanceof ForkyError && e.kind === 'signed-out');
  await assert.rejects(noCall({ question: 'x'.repeat(501), history: [], context, accessToken: 't' }), (e: unknown) => e instanceof ForkyError && e.kind === 'too-long');
  const unset = createForkyAsker({ url: '' });
  await assert.rejects(unset({ question: 'q', history: [], context, accessToken: 't' }), (e: unknown) => e instanceof ForkyError && e.kind === 'unavailable');
});

test('the live function still speaks this contract', () => {
  const source = readFileSync(functionPath, 'utf8');
  for (const code of ['UNAUTHENTICATED', 'FEATURE_OFF', 'LIMIT_REACHED', 'BAD_REQUEST', 'UPSTREAM_ERROR', 'NOT_CONFIGURED']) {
    assert.ok(source.includes(`'${code}'`), code);
  }
  assert.match(source, /jsonResponse\(\{ \.\.\.reply, remaining, limit, isPlus, tier \}\)/);
  assert.match(source, /claim_forky_message/);
});

test('the safety words are the function\'s own', () => {
  const shared = readFileSync(sharedPath, 'utf8');
  const app = readFileSync(join(__dirname, '..', 'src', 'forky', 'request.ts'), 'utf8');
  const pick = (text: string) => /const SAFETY_WORDS =\s*(\/.+\/i);/.exec(text)?.[1];
  assert.ok(pick(shared));
  assert.equal(pick(app), pick(shared));
});

test('the AI notice is the old app\'s, word for word (chatbot disclosure and rule 9)', () => {
  assert.ok(existsSync(oldCopyPath), 'old-app snapshot of config/askForky.ts is missing (tests/fixtures/old-app)');
  const old = readFileSync(oldCopyPath, 'utf8');
  const quoted = /aiNotice:\s*'([^']+)'/.exec(old)?.[1];
  assert.ok(quoted, 'aiNotice found in the old-app snapshot of config/askForky.ts');
  // The old app's line is kept word for word; the allergen-sharing sentence is appended (compliance review 2026-10-16).
  assert.ok(ASK_FORKY_COPY.aiNotice.startsWith(quoted));
  assert.ok(ASK_FORKY_COPY.aiNotice.endsWith('If you have saved allergens, they are sent with your question so Forky can avoid them.'));
  for (const key of ['safetyNote', 'limitFree', 'limitPlus', 'intro', 'featureOff', 'notConfigured', 'genericError'] as const) {
    assert.ok(old.includes(JSON.stringify(ASK_FORKY_COPY[key]).slice(1, -1)) || old.includes(ASK_FORKY_COPY[key]), key);
  }
});
