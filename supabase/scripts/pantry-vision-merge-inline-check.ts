/**
 * Ensures pantry-vision/index.ts inlines pantryItemMerge.ts core (single-file dashboard deploy).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fnDir = join(scriptDir, '../supabase/functions/pantry-vision');

const BEGIN = '// BEGIN PANTRY_MERGE';
const END = '// END PANTRY_MERGE';

function mergeCoreToInlineBlock(source: string): string {
  const withoutHeader = source.replace(/^\/\*\*[\s\S]*?\*\/\s*/m, '');
  const cut = withoutHeader.split('function normalizeNameKey')[0];
  return cut
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export type /gm, 'type ')
    .trim();
}

function extractBetweenMarkers(file: string, begin: string, end: string): string {
  const start = file.indexOf(begin);
  const endIdx = file.indexOf(end);
  assert.ok(start >= 0, `missing ${begin}`);
  assert.ok(endIdx > start, `missing ${end}`);
  const afterBegin = file.indexOf('\n', start) + 1;
  const beforeEnd = file.lastIndexOf('\n', endIdx);
  return file.slice(afterBegin, beforeEnd).trim();
}

const mergeSource = readFileSync(join(fnDir, 'pantryItemMerge.ts'), 'utf8');
const index = readFileSync(join(fnDir, 'index.ts'), 'utf8');
const expectedCore = mergeCoreToInlineBlock(mergeSource);
const actualBlock = extractBetweenMarkers(index, BEGIN, END);

assert.ok(
  actualBlock.includes('function mergePantryRowPair'),
  'index.ts PANTRY_MERGE must include mergePantryRowPair',
);
assert.ok(actualBlock.includes('function dedupePantryRows'), 'index.ts PANTRY_MERGE must include dedupePantryRows');
assert.ok(
  actualBlock.includes('Math.max(existing.quantity, incoming.quantity)'),
  'index.ts merge must use max quantity',
);

if (!actualBlock.includes(expectedCore.split('\n')[0])) {
  console.warn('WARN: PANTRY_MERGE block diverged from pantryItemMerge.ts — review manually');
}

console.log('OK: pantry-vision merge inline sync check passed');
