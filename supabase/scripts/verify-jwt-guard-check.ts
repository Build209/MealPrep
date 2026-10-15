/**
 * Some functions read the caller's user id by base64-decoding the JWT payload WITHOUT checking its
 * signature (atob). That is only safe while the Supabase gateway verifies the JWT first, i.e. the
 * function is deployed without --no-verify-jwt. This check fails if any of them would lose it.
 *
 * Where gateway verification is set in this repo: the jwt_flag case in
 * .github/workflows/deploy-function.yml (there is no supabase/config.toml with [functions.*]).
 * Also checked: no workflow passes --no-verify-jwt anywhere else, and no config.toml under
 * supabase/ or db/supabase/ turns verify_jwt off for these functions.
 * Run from supabase/: npm run test:verify-jwt
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const supabaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(supabaseRoot, '..');
const functionsDir = path.join(supabaseRoot, 'functions');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** Functions that decode the JWT without verifying it (audit 2026-10-15). */
const DECODES_UNVERIFIED_JWT = ['pantry-vision', 'recipe-import', 'recipeapi-proxy', 'usda-proxy', 'viral-recipes'];
/** The only functions allowed to skip gateway JWT verification, each with its own auth. */
const NO_VERIFY_ALLOWED = ['creator-videos', 'library-generate', 'scan-photo-retention', 'stripe-webhook'];

const UNVERIFIED_DECODE = /split\(['"]\.['"]\)[\s\S]{0,400}atob\(/;

// 1. The list above is complete: any function that decodes a JWT payload with atob is in it.
const functionNames = fs
  .readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name);
const decoders = functionNames
  .filter((name) => UNVERIFIED_DECODE.test(fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8')))
  .sort();
assert.deepEqual(decoders, [...DECODES_UNVERIFIED_JWT].sort(), 'functions that decode a JWT with atob');

// 2. Each carries the warning comment next to the decode.
for (const name of DECODES_UNVERIFIED_JWT) {
  const source = fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8');
  assert.match(source, /verify-jwt-guard-check\.ts fails CI/, `${name} has the verify_jwt warning comment`);
}

// 3. The deploy workflow turns verification off only for the allowed functions.
const workflow = read('.github/workflows/deploy-function.yml');
const caseLine = /^\s*([a-z0-9|-]+)\)\s*jwt_flag="--no-verify-jwt"\s*;;/m.exec(workflow);
assert.ok(caseLine, 'deploy-function.yml has the --no-verify-jwt case line');
const noVerify = caseLine[1].split('|').sort();
assert.deepEqual(noVerify, [...NO_VERIFY_ALLOWED].sort(), 'functions deployed with --no-verify-jwt');
for (const name of DECODES_UNVERIFIED_JWT) {
  assert.ok(!noVerify.includes(name), `${name} keeps gateway JWT verification`);
}
assert.match(workflow, /\*\)\s*jwt_flag=""\s*;;/, 'every other function deploys with verification on');
assert.equal(
  (workflow.match(/--no-verify-jwt/g) ?? []).length,
  1,
  'deploy-function.yml uses --no-verify-jwt only in the case line',
);

// 4. No other workflow deploys with --no-verify-jwt.
const workflowsDir = path.join(repoRoot, '.github/workflows');
for (const file of fs.readdirSync(workflowsDir)) {
  if (file === 'deploy-function.yml' || !/\.ya?ml$/.test(file)) continue;
  assert.doesNotMatch(fs.readFileSync(path.join(workflowsDir, file), 'utf8'), /no-verify-jwt/, `${file} has no --no-verify-jwt`);
}

// 5. No config.toml turns verify_jwt off for a guarded function.
for (const rel of ['supabase/config.toml', 'supabase/supabase/config.toml', 'db/supabase/config.toml']) {
  if (!fs.existsSync(path.join(repoRoot, rel))) continue;
  const toml = read(rel);
  for (const name of DECODES_UNVERIFIED_JWT) {
    const section = new RegExp(`\\[functions\\.${name}\\]([^\\[]*)`).exec(toml)?.[1] ?? '';
    assert.doesNotMatch(section, /verify_jwt\s*=\s*false/, `${rel} keeps verify_jwt on for ${name}`);
  }
}

console.log(`verify-jwt-guard-check: ok (${DECODES_UNVERIFIED_JWT.length} guarded functions)`);
