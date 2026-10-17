import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsertSql, pickDollarTag, batches, runQuery, parseArgs, validateRows } from './load.mjs';

const row = (over = {}) => ({
  slug: 'wb-pancakes',
  title: "Grandma's Pancakes",
  url: 'https://en.wikibooks.org/wiki/Cookbook:Pancakes',
  servings: 4,
  tag: 'breakfast',
  ingredients: [{ name: 'flour', unit: 'cup', quantity: 2 }],
  steps: ["Mix it all; don't over-mix."],
  ...over,
});

test('apostrophes and quotes in recipe text are not escaped (dollar-quoted jsonb)', () => {
  const sql = buildInsertSql([row()]);
  assert.ok(sql.includes("Grandma's Pancakes"));
  assert.ok(sql.includes('jsonb_to_recordset($j$['));
  assert.ok(sql.includes(']$j$::jsonb)'));
});

test('dollar tag avoids any tag present in the data', () => {
  const r = row({ steps: ['costs $j$ and $wb$ too'] });
  const sql = buildInsertSql([r]);
  assert.equal(pickDollarTag(JSON.stringify([r])), 'wbj');
  assert.ok(sql.includes('$wbj$['));
  assert.ok(!sql.includes('$j$['));
});

test('only touches drafts from Wikibooks and never inserts anything but drafts', () => {
  const sql = buildInsertSql([row()]);
  assert.ok(sql.includes("WHERE library_recipes.status='draft' AND library_recipes.source_name='Wikibooks Cookbook'"));
  assert.ok(sql.includes("NULL, 'draft'"));
  assert.ok(!/DELETE|TRUNCATE|DROP/i.test(sql));
  assert.ok(sql.includes("'CC BY-SA 4.0'"));
  assert.ok(sql.includes('COALESCE(NULLIF(x.servings, 0), 4)'));
  assert.ok(sql.includes('ON CONFLICT (slug) DO UPDATE'));
  assert.ok(!sql.includes('status=EXCLUDED'));
});

test('batch sizing', () => {
  const rows = Array.from({ length: 250 }, (_, i) => row({ slug: `s${i}` }));
  const b = batches(rows, 100);
  assert.deepEqual(b.map((x) => x.length), [100, 100, 50]);
  assert.equal(batches([], 100).length, 0);
  assert.throws(() => batches(rows, 0));
});

test('missing servings and tag are passed as null', () => {
  const sql = buildInsertSql([row({ servings: null, tag: null })]);
  assert.ok(sql.includes('"servings":null'));
  assert.ok(sql.includes('"tag":null'));
});

test('validateRows rejects duplicate slugs', () => {
  assert.throws(() => validateRows([row(), row()]), /duplicate slug/);
  assert.doesNotThrow(() => validateRows([row()]));
});

test('args: dry run is the default, apply is explicit', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.throws(() => parseArgs(['--apply', '--dry-run']));
  assert.throws(() => parseArgs(['--nope']));
});

test('runQuery retries 429 and 5xx, then succeeds; does not retry 4xx; token only in header', async () => {
  const calls = [];
  const mk = (status, body = '[]') => ({
    ok: status < 300,
    status,
    headers: { get: () => null },
    json: async () => JSON.parse(body),
    text: async () => body,
  });
  const seq = [mk(429, 'slow down'), mk(503, 'oops'), mk(201, '[{"inserted":true}]')];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return seq.shift();
  };
  const out = await runQuery({ ref: 'abc', token: 'SECRET', query: 'select 1', fetchImpl, baseDelayMs: 1 });
  assert.deepEqual(out, [{ inserted: true }]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://api.supabase.com/v1/projects/abc/database/query');
  assert.equal(JSON.parse(calls[0].init.body).query, 'select 1');

  await assert.rejects(
    runQuery({ ref: 'abc', token: 'SECRET', query: 'x', fetchImpl: async () => mk(400, 'bad sql'), baseDelayMs: 1 }),
    (e) => /HTTP 400/.test(e.message) && !e.message.includes('SECRET'),
  );
});
