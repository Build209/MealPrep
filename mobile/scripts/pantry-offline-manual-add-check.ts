/**
 * Pantry QA P1-1 / P1-2: offline manual add + overflow menu a11y.
 * Run from mobile/: npm run test:pantry-offline-manual-add
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManualPantryItem, prependPantryItem } from '../lib/pantry/manualPantryItem.ts';
import { PANTRY_LIST_COPY } from '../config/pantryStorage.ts';
import type { PantryItem } from '../types/mealprep.ts';

const item = buildManualPantryItem(
  {
    name: 'Offline Onion',
    quantity: 1,
    unit: 'each',
    category: 'produce',
    location: 'pantry',
  },
  1_700_000_000_000,
);
assert.equal(item.name, 'Offline Onion');
assert.match(item.id, /^manual-/);

const prior: PantryItem[] = [];
const next = prependPantryItem(prior, item);
assert.equal(next.length, 1);
assert.equal(next[0].name, 'Offline Onion');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');

const appContextSource = fs.readFileSync(path.join(mobileRoot, 'context/AppContext.tsx'), 'utf8');
assert.match(appContextSource, /buildManualPantryItem\(input\)/);
assert.match(appContextSource, /writeAccountPantryCache\(userId, next, \{ profile \}\)/);
// Rows added while offline are saved once the server answers again.
assert.match(appContextSource, /const offlineAdds = mergedPantry\.filter\(/);
assert.match(appContextSource, /await insertPantryItems\(supabase, userId, offlineAdds\)/);
assert.match(
  appContextSource,
  /if \(isOffline\(\)\) \{\s*return;\s*\}/,
  'manual add should succeed locally while offline',
);

const pantryScreenSource = fs.readFileSync(path.join(mobileRoot, 'app/(tabs)/pantry.tsx'), 'utf8');
assert.match(
  pantryScreenSource,
  /!profileReady && pantry\.length === 0/,
  'pantry list should render when items exist before profile finishes loading',
);
assert.match(
  pantryScreenSource,
  /accessibilityLabel=\{PANTRY_LIST_COPY\.overflowMenuA11y\}/,
  'overflow menu should expose an accessibility label',
);
assert.match(pantryScreenSource, /accessibilityRole="button"/);
assert.equal(PANTRY_LIST_COPY.overflowMenuA11y, 'More pantry actions');

console.log('pantry-offline-manual-add-check: ok');
