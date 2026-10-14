/**
 * Unit checks for pantry-vision Gemini time budget and model ordering.
 * Run from mobile/: npm run test:pantry-vision-gemini
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_GEMINI_REQUEST_TIMEOUT_MS,
  GEMINI_REQUEST_TOTAL_BUDGET_MS,
  ModelTimeoutMemory,
  RequestTimeBudget,
  buildGeminiModelCandidates,
  deprioritizeRecentlyTimedOutModels,
  orderModelsForAttempt,
  parseGeminiRequestTimeoutMs,
  shouldRetrySameModelAfterError,
} from '../supabase/functions/pantry-vision/geminiOrchestration.ts';

function testBuildCandidates() {
  const list = buildGeminiModelCandidates('gemini-3.6-flash', 'gemini-3.5-flash,gemini-3.6-flash');
  assert.deepEqual(list.slice(0, 4), [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
  ]);
}

function testDeprioritizeTimedOutModels() {
  const now = 1_000_000;
  const map = new Map<string, number>([['gemini-3.6-flash', now - 60_000]]);
  const ordered = deprioritizeRecentlyTimedOutModels(
    ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.7-flash'],
    map,
    now,
  );
  assert.deepEqual(ordered, ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
}

function testSkipLargeImageTimeouts() {
  const now = 1_000_000;
  const largeMap = new Map<string, number>([['gemini-3.5-flash', now - 30_000]]);
  const ordered = deprioritizeRecentlyTimedOutModels(
    ['gemini-3.5-flash', 'gemini-3.8-flash'],
    new Map(),
    now,
    5 * 60 * 1000,
    largeMap,
    true,
  );
  assert.deepEqual(ordered, ['gemini-3.8-flash']);
}

function testParseTimeout() {
  assert.equal(parseGeminiRequestTimeoutMs(undefined), DEFAULT_GEMINI_REQUEST_TIMEOUT_MS);
  assert.equal(parseGeminiRequestTimeoutMs('45000'), 45_000);
  assert.equal(parseGeminiRequestTimeoutMs('not-a-number'), DEFAULT_GEMINI_REQUEST_TIMEOUT_MS);
}

function testOrderModelsForAttempt() {
  const memory = new ModelTimeoutMemory();
  memory.record('gemini-3.6-flash', Date.now() - 30_000);
  const ordered = orderModelsForAttempt('gemini-3.8-flash', undefined, memory);
  assert.equal(ordered[0], 'gemini-3.8-flash');
  assert.ok(ordered.includes('gemini-3.6-flash'));
  assert.ok(ordered.indexOf('gemini-3.6-flash') > ordered.indexOf('gemini-3.7-flash'));
}

function testShouldNotRetryOnTimeout() {
  assert.equal(shouldRetrySameModelAfterError({ kind: 'timeout' }, 0), false);
  assert.equal(
    shouldRetrySameModelAfterError({ kind: 'http', retryable: true }, 0),
    true,
  );
  assert.equal(
    shouldRetrySameModelAfterError({ kind: 'http', retryable: true }, 1),
    false,
  );
}

function testRequestTimeBudget() {
  let now = 0;
  const budget = new RequestTimeBudget(100_000, () => now);
  assert.equal(budget.perCallTimeoutMs(38_000), 38_000);
  now = 90_000;
  assert.equal(budget.perCallTimeoutMs(38_000), 10_000);
  now = 98_000;
  assert.equal(budget.perCallTimeoutMs(DEFAULT_GEMINI_REQUEST_TIMEOUT_MS), null);
  assert.equal(budget.isExhausted(), true);
}

function testBudgetConstants() {
  assert.ok(
    DEFAULT_GEMINI_REQUEST_TIMEOUT_MS >= 30_000 && DEFAULT_GEMINI_REQUEST_TIMEOUT_MS <= 50_000,
  );
  assert.ok(GEMINI_REQUEST_TOTAL_BUDGET_MS >= 100_000 && GEMINI_REQUEST_TOTAL_BUDGET_MS <= 120_000);
}

testBuildCandidates();
testDeprioritizeTimedOutModels();
testSkipLargeImageTimeouts();
testParseTimeout();
testOrderModelsForAttempt();
testShouldNotRetryOnTimeout();
testRequestTimeBudget();
testBudgetConstants();

console.log('OK: pantry-vision Gemini budget checks passed');
