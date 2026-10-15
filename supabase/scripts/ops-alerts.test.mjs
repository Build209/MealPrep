// Unit tests for the owner-alert thresholds and log sanitising. No network.
// Run: node --test supabase/scripts/ops-alerts.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CONSOLE_SQL,
  EDGE_SQL,
  classifyLine,
  evaluate,
  issueBody,
  issueTitle,
  postedRecently,
  readFailureBody,
  sanitize,
  signature,
} from './ops-alerts.mjs';

const PV_ID = 'f5bea684-1027-4887-a3e8-30179fd736bd';
const edgeOk = [{ fn: 'pantry-vision', function_id: PV_ID, status: 200, n: 12 }];
// Shape of the real Oct 10 outage lines (function_logs, level "warning").
const creditLine = 'pantry-vision: gemini failed gemini-3.8-flash (402): Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';

test('quiet window: no findings', () => {
  const routine = [{ function_id: PV_ID, level: 'warning', msg: 'pantry-vision: scan failed model=none items=0 ms=402 imageBytes=1402' }];
  assert.deepEqual(evaluate(edgeOk, routine).findings, []);
});

test('Gemini credit outage alerts on the first line', () => {
  const { findings } = evaluate(edgeOk, [{ function_id: PV_ID, level: 'warning', msg: creditLine }]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].reason, /AI credit or quota ran out \(pantry-vision\)/);
  assert.equal(findings[0].count, 1);
});

test('ALERT line alerts once seen, and wins over other buckets', () => {
  const msg = 'pantry-vision: ALERT scanner unavailable: Google refused the account (billing or key)';
  assert.equal(classifyLine(msg), 'alertLines');
  const { findings } = evaluate(edgeOk, [{ function_id: PV_ID, level: 'warning', msg }]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].reason, /^ALERT logged/);
});

test('Anthropic 402 from ask-forky counts as credit', () => {
  assert.equal(classifyLine('ask-forky: model error 402 billing_error'), 'aiCredit');
  assert.equal(classifyLine('ask-forky: model error 429 rate_limit_error'), 'aiRateLimit');
});

test('429s only alert in a burst', () => {
  const line = { function_id: PV_ID, level: 'warning', msg: 'pantry-vision: gemini failed gemini-3.8-flash (429): busy' };
  assert.equal(evaluate(edgeOk, Array(4).fill(line)).findings.length, 0);
  assert.equal(evaluate(edgeOk, Array(5).fill(line)).findings.length, 1);
});

test('5xx: alert at 5 from one function, not 4, not summed across functions', () => {
  const four = [{ fn: 'recipe-import', function_id: 'a', status: 500, n: 4 }];
  assert.equal(evaluate(four, []).findings.length, 0);
  const split = [
    { fn: 'recipe-import', function_id: 'a', status: 500, n: 3 },
    { fn: 'ask-forky', function_id: 'b', status: 502, n: 3 },
  ];
  assert.equal(evaluate(split, []).findings.length, 0);
  const five = [
    { fn: 'recipe-import', function_id: 'a', status: 500, n: 3 },
    { fn: 'recipe-import', function_id: 'a', status: 546, n: 2 },
    { fn: 'recipe-import', function_id: 'a', status: 429, n: 50 },
  ];
  const { findings } = evaluate(five, []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, 'recipe-import failing (5 server errors)');
});

test('our own 429 usage limits (edge status) do not alert', () => {
  assert.equal(evaluate([{ fn: 'recipe-import', function_id: 'a', status: 429, n: 99 }], []).findings.length, 0);
});

test('function name falls back to the log prefix when id is unknown', () => {
  const { findings } = evaluate([], [{ function_id: 'zzz', level: 'error', msg: 'ask-forky: model error 402 x' }]);
  assert.match(findings[0].reason, /\(ask-forky\)/);
});

test('sanitize removes people and secrets', () => {
  const dirty = [
    'user jane.doe@example.com',
    'id 93b5ae09-4c1e-4c9c-8fe9-3af24f1165f9',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcDEF123',
    'key AIzaSyA1234567890abcdefGHIJ',
    'sk-ant-api03-abcdefghijk',
    'sk_live_abcdef123456',
    'Bearer abc.def.ghi',
    'sub_1UOV7wBJwnfbXonf8FcbJrwJ',
    'from 203.0.113.9',
    'https://x.supabase.co/storage/v1/object/sign/a.jpg?token=secret123',
    'blob QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0NTY3ODk=',
  ].join(' | ');
  const clean = sanitize(dirty, 2000);
  for (const bad of ['jane.doe', 'example.com', '93b5ae09', 'eyJ', 'AIza', 'sk-ant', 'sk_live', 'abc.def.ghi', 'sub_1UOV', '203.0.113.9', 'token=', 'secret123', 'QUJDREVG']) {
    assert.ok(!clean.includes(bad), `"${bad}" removed from: ${clean}`);
  }
  assert.ok(clean.includes('https://x.supabase.co/storage/v1/object/sign/a.jpg'), 'URL path kept');
});

test('sanitize keeps the useful part and truncates', () => {
  const s = sanitize(creditLine);
  assert.match(s, /gemini failed gemini-3\.8-flash \(402\): Your prepayment credits are depleted/);
  assert.ok(sanitize('x'.repeat(10) + ' ' + 'word '.repeat(100)).length <= 200);
  assert.ok(!sanitize('a `code` b\nline2').includes('`'));
  assert.ok(!sanitize('a\nb').includes('\n'));
});

test('issue text: title, samples sanitised, signature marker', () => {
  const { findings, stats } = evaluate(edgeOk, [
    { function_id: PV_ID, level: 'warning', msg: `${creditLine} user=bob@example.com` },
  ]);
  const sig = signature(findings);
  const body = issueBody({ findings, stats, windowMinutes: 35, sig, now: new Date('2026-10-15T00:00:00Z') });
  assert.equal(issueTitle(findings), 'Alert: AI credit or quota ran out (pantry-vision)');
  assert.ok(body.includes(`<!-- ops-alert:sig=${sig} -->`));
  assert.ok(!body.includes('bob@example.com'));
  assert.ok(readFailureBody('logs API HTTP 401').includes('sig=read-failure'));
});

test('repeat suppression by signature and age', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const posts = [{ body: 'x <!-- ops-alert:sig=fn5xx:a -->', created_at: '2026-10-15T10:00:00Z' }];
  assert.equal(postedRecently(posts, 'fn5xx:a', 3, now), true);
  assert.equal(postedRecently(posts, 'fn5xx:a', 1, now), false);
  assert.equal(postedRecently(posts, 'fn5xx:b', 3, now), false);
});

test('queries read only the function log sources', () => {
  assert.match(EDGE_SQL, /source = 'function_edge_logs'/);
  assert.match(CONSOLE_SQL, /source = 'function_logs'/);
  for (const sql of [EDGE_SQL, CONSOLE_SQL]) assert.match(sql.trim(), /^select /i);
});

test('workflow: schedule, manual run, least permissions, existing secret', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const wf = fs.readFileSync(path.join(here, '../../.github/workflows/ops-alerts.yml'), 'utf8');
  assert.match(wf, /cron: "\*\/30 \* \* \* \*"/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /contents: read/);
  assert.match(wf, /issues: write/);
  assert.match(wf, /secrets\.SUPABASE_ACCESS_TOKEN/);
  assert.ok(!/secrets\.(?!SUPABASE_ACCESS_TOKEN|GITHUB_TOKEN)\w+/.test(wf), 'no new secrets');
});
