/**
 * Shared secrets (admin headers, cron secrets) must be compared in constant time with
 * secretsMatch from functions/_shared/secrets.ts, never with plain === or !==, which can leak
 * the secret's length or prefix by timing.
 *
 * Two rules over every .ts file in supabase/functions:
 *   1. No === / !== where one side is a name containing "secret" (typeof checks and .length allowed).
 *   2. A file that reads a shared-secret env var (Deno.env.get('..._SECRET')) must call secretsMatch,
 *      unless the variable is a third-party credential listed in NOT_COMPARED below.
 * Run from supabase/: npm run test:secret-compare
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { secretsMatch } from '../functions/_shared/secrets.ts';
import { secretsMatch as reExported } from '../functions/_shared/scanRetention.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsDir = path.join(root, 'functions');

/** Env secrets that are sent to another service or used as an HMAC key, never compared to input. */
const NOT_COMPARED = new Set([
  'KROGER_CLIENT_SECRET', // OAuth client credential sent to Kroger
  'STRIPE_SECRET_KEY', // Stripe API key
  'STRIPE_WEBHOOK_SECRET', // HMAC key; signatures compared with constantTimeEqual (stripe-webhook/signature.ts)
]);

const PLAIN_COMPARE =
  /(?<!typeof\s)\b([A-Za-z_$][\w$.]*secret[\w$]*)\b(?!\.length)\s*[!=]==|[!=]==\s*(?!typeof\b)([A-Za-z_$][\w$.]*secret[\w$]*)\b(?!\.length)/i;
const SECRET_ENV = /Deno\.env\.get\(\s*['"]([A-Z0-9_]*SECRET[A-Z0-9_]*)['"]\s*\)/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function problemsIn(file: string, source: string): string[] {
  const problems: string[] = [];
  const code = stripComments(source);
  code.split(/\r?\n/).forEach((line, i) => {
    if (PLAIN_COMPARE.test(line)) problems.push(`${file}:${i + 1} compares a secret with === or !==: ${line.trim()}`);
  });
  const envSecrets = [...code.matchAll(SECRET_ENV)].map((m) => m[1]).filter((name) => !NOT_COMPARED.has(name));
  if (envSecrets.length > 0 && !/\bsecretsMatch\s*\(/.test(code)) {
    problems.push(`${file} reads ${envSecrets.join(', ')} but never calls secretsMatch()`);
  }
  return problems;
}

// The detector itself.
assert.equal(problemsIn('a.ts', "if (providedSecret === expectedSecret) {}").length, 1);
assert.equal(problemsIn('a.ts', "if (expected !== body.secret) {}").length, 1);
assert.equal(
  problemsIn('a.ts', "const e = Deno.env.get('CREATOR_ADMIN_SECRET') ?? '';\nreturn provided === e;").length,
  1,
  'reading an admin secret without secretsMatch is caught even when the names hide it',
);
assert.deepEqual(
  problemsIn('a.ts', "const e = Deno.env.get('X_ADMIN_SECRET') ?? '';\nreturn secretsMatch(e, provided);"),
  [],
);
assert.deepEqual(problemsIn('a.ts', "if (typeof secret === 'string' && secret.length === 0) {}"), []);
assert.deepEqual(problemsIn('a.ts', "const k = Deno.env.get('STRIPE_SECRET_KEY');"), []);
assert.deepEqual(problemsIn('a.ts', '// old: provided === secret'), [], 'comments are ignored');

// The helper.
assert.equal(secretsMatch('abc123', 'abc123'), true);
assert.equal(secretsMatch(' abc123 ', 'abc123'), true, 'trims');
assert.equal(secretsMatch('abc123', 'abc124'), false);
assert.equal(secretsMatch('abc123', 'abc1234'), false, 'longer');
assert.equal(secretsMatch('abc123', 'abc12'), false, 'prefix');
assert.equal(secretsMatch('', ''), false, 'empty never matches');
assert.equal(secretsMatch('abc', ''), false);
assert.equal(secretsMatch('', 'abc'), false, 'unset secret never matches');
assert.equal(reExported, secretsMatch, 'scanRetention re-exports the same helper');

// Every function file.
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'fixtures' ? [] : walk(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}
const files = walk(functionsDir);
const problems = files.flatMap((file) =>
  problemsIn(path.relative(root, file), fs.readFileSync(file, 'utf8')),
);
assert.deepEqual(problems, [], `plain secret comparisons:\n${problems.join('\n')}`);

// The two admin-secret functions named in the audit use the helper.
for (const rel of ['functions/creator-videos/index.ts', 'functions/library-generate/auth.ts']) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(source, /import \{ secretsMatch \} from '\.\.\/_shared\/secrets\.ts';/, `${rel} imports secretsMatch`);
}

console.log(`secret-compare-check: ok (${files.length} files)`);
