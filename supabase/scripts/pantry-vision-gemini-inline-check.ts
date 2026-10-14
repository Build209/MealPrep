/**
 * Ensures pantry-vision/index.ts inlines geminiOrchestration.ts (single-file dashboard deploy).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fnDir = join(scriptDir, '../supabase/functions/pantry-vision');

const BEGIN = '// BEGIN GEMINI_ORCHESTRATION';
const END = '// END GEMINI_ORCHESTRATION';

function orchestrationToInlineBlock(source: string): string {
  const withoutHeader = source.replace(/^\/\*\*[\s\S]*?\*\/\s*/m, '');
  return withoutHeader
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export class /gm, 'class ')
    .replace(/^export type /gm, 'type ')
    .trim();
}

function extractBetweenMarkers(file: string, begin: string, end: string): string {
  const start = file.indexOf(begin);
  const endIdx = file.indexOf(end);
  assert.ok(start >= 0, `missing ${begin}`);
  assert.ok(endIdx > start, `missing ${end}`);
  const afterBegin = file.indexOf('\n', start) + 1;
  return file.slice(afterBegin, endIdx).trim();
}

const orchestration = readFileSync(join(fnDir, 'geminiOrchestration.ts'), 'utf8');
const index = readFileSync(join(fnDir, 'index.ts'), 'utf8');
const expected = orchestrationToInlineBlock(orchestration);
const actual = extractBetweenMarkers(index, BEGIN, END);

assert.equal(actual, expected, 'index.ts GEMINI_ORCHESTRATION block must match geminiOrchestration.ts');

if (index.includes("from './geminiOrchestration")) {
  throw new Error('index.ts must not import geminiOrchestration.ts (dashboard deploy is single-file)');
}

console.log('OK: pantry-vision Gemini inline sync check passed');
