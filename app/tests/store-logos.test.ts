/// <reference types="node" />
// Store logos (src/stores/storeLogos.ts): every entry is a known chain and points at a real, small
// PNG in app/assets/stores/, and every logo is recorded with its source in docs/STORE_LOGOS.md.
// storeLogos.ts is read as text, not imported: its require('...png') lines only work in the bundler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GROCERY_CHAINS, STORE_CHAINS } from '../src/stores/chains';
import { normalizeChainKey } from '../src/stores/storeBadge';

const storesDir = join(__dirname, '..', 'src', 'stores');
const assetsDir = join(__dirname, '..', 'assets', 'stores');
const logosFile = join(storesDir, 'storeLogos.ts');
const docFile = join(__dirname, '..', '..', 'docs', 'STORE_LOGOS.md');

const MAX_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024;

type LogoEntry = { key: string; path: string };

const ENTRY = /^\s*(?:'([^']+)'|([a-z0-9_]+))\s*:\s*require\('([^']+)'\),\s*$/;

/** The lines between the LOGO ENTRIES markers, as { key, path }. Anything else there is an error. */
function parseLogoEntries(source: string): LogoEntry[] {
  const start = source.indexOf('// LOGO ENTRIES START');
  const end = source.indexOf('// LOGO ENTRIES END');
  assert.ok(start >= 0 && end > start, 'storeLogos.ts must keep the LOGO ENTRIES START/END markers');
  const block = source.slice(source.indexOf('\n', start) + 1, end);
  const entries: LogoEntry[] = [];
  for (const line of block.split('\n')) {
    if (!line.trim() || line.trim().startsWith('//')) continue;
    const m = ENTRY.exec(line);
    assert.ok(m, `storeLogos.ts: write each logo as  key: require('../../assets/stores/x.png'),  (got: ${line.trim()})`);
    entries.push({ key: (m[1] ?? m[2])!, path: m[3]! });
  }
  return entries;
}

function knownChainKeys(): Set<string> {
  return new Set([...STORE_CHAINS, ...GROCERY_CHAINS].map((c) => normalizeChainKey(c.displayName)));
}

const entries = parseLogoEntries(readFileSync(logosFile, 'utf8'));

test('the entry parser reads both key forms and rejects other lines', () => {
  const sample = [
    '// LOGO ENTRIES START',
    "  safeway: require('../../assets/stores/safeway.png'),",
    "  'trader joe s': require('../../assets/stores/trader-joes.png'),",
    '// LOGO ENTRIES END',
  ].join('\n');
  assert.deepEqual(parseLogoEntries(sample), [
    { key: 'safeway', path: '../../assets/stores/safeway.png' },
    { key: 'trader joe s', path: '../../assets/stores/trader-joes.png' },
  ]);
  assert.throws(() => parseLogoEntries("// LOGO ENTRIES START\n  safeway: someImage,\n// LOGO ENTRIES END"));
});

test('storeLogos.ts has no require() outside the entry block', () => {
  const source = readFileSync(logosFile, 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((code.match(/require\(/g) ?? []).length, entries.length);
});

test('every logo key is a known chain, written as normalizeChainKey writes it, with no repeats', () => {
  const known = knownChainKeys();
  const seen = new Set<string>();
  for (const { key } of entries) {
    assert.equal(normalizeChainKey(key), key, `"${key}" is not normalised (use "${normalizeChainKey(key)}")`);
    assert.ok(known.has(key), `"${key}" is not a chain in chains.ts`);
    assert.ok(!seen.has(key), `"${key}" is listed twice`);
    seen.add(key);
  }
});

test('every logo file exists in app/assets/stores, is a PNG, and the set stays small', () => {
  let total = 0;
  for (const { key, path } of entries) {
    const file = resolve(storesDir, path);
    assert.ok(file.startsWith(assetsDir + '/'), `${key}: logo must live in app/assets/stores/ (got ${path})`);
    assert.ok(file.endsWith('.png'), `${key}: logo must be a .png (got ${path})`);
    assert.ok(existsSync(file), `${key}: ${path} does not exist`);
    const bytes = readFileSync(file);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${key}: not a PNG file`);
    const size = statSync(file).size;
    assert.ok(size <= MAX_FILE_BYTES, `${key}: ${size} bytes is over ${MAX_FILE_BYTES}`);
    total += size;
  }
  assert.ok(total <= MAX_TOTAL_BYTES, `store logos total ${total} bytes, over ${MAX_TOTAL_BYTES}`);
});

test('docs/STORE_LOGOS.md records every shipped logo and the trademark note', () => {
  assert.ok(existsSync(docFile), 'docs/STORE_LOGOS.md is missing');
  const doc = readFileSync(docFile, 'utf8');
  assert.match(doc, /Trademarks belong to their owners/);
  assert.match(doc, /Compliance to confirm before marketing use/);
  for (const { key, path } of entries) {
    const name = path.split('/').pop()!;
    assert.ok(doc.includes(name), `${key}: ${name} is not listed in docs/STORE_LOGOS.md`);
  }
});
