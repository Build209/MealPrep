/**
 * The manual deploy workflow (.github/workflows/deploy-function.yml) must deploy from this folder:
 * every function here is a choice in the workflow, every choice is a function here, and the
 * deploy step runs from the repo root (where supabase/functions lives), not from mobile/.
 * Run from supabase/: npm run test:deploy-workflow
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const supabaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsDir = path.join(supabaseRoot, 'functions');
const workflow = fs.readFileSync(path.join(supabaseRoot, '../.github/workflows/deploy-function.yml'), 'utf8');

const functions = fs
  .readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort();
for (const name of functions) {
  assert.ok(fs.existsSync(path.join(functionsDir, name, 'index.ts')), `${name}/index.ts exists`);
}

const optionsBlock = /options:\n((?:\s+- [a-z0-9-]+\n)+)/.exec(workflow)?.[1] ?? '';
const options = [...optionsBlock.matchAll(/- ([a-z0-9-]+)/g)].map((m) => m[1]).sort();
assert.ok(options.length > 0, 'workflow lists the functions it can deploy');
assert.deepEqual(options, functions, 'workflow choices and supabase/functions folders match');

// Deploys from the repo root: no working-directory pointing at the old app.
assert.doesNotMatch(workflow, /working-directory:\s*mobile/, 'deploy no longer runs from mobile/');
assert.match(workflow, /test -f "supabase\/functions\/\$FUNCTION_NAME\/index\.ts"/);
assert.match(workflow, /supabase functions deploy "\$FUNCTION_NAME"/);
// Still manual only, and only from main.
assert.match(workflow, /^on:\n  workflow_dispatch:/m, 'manual trigger only');
assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m, 'never deploys on its own');
assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);

console.log(`deploy-workflow-check: ok (${functions.length} functions)`);
