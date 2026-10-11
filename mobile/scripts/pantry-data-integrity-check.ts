/**
 * Pantry data integrity (bug sweep, 2026-10-10): deleted rows must not come back from the copy
 * kept on the device, and the screen, the server and the untick ledger must agree on row ids.
 * Run: npx tsx scripts/pantry-data-integrity-check.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  diffPantryForServer,
  groceryItemToPantryItem,
  pantryNameFromGroceryName,
  reconcilePantryAfterServerLoad,
  replacePantryRowsById,
} from '../lib/pantry/mergePantryStock';
import { applyGroceryCheckRestockBatch, reverseGroceryCheckRestock } from '../lib/grocery/restockLedger';
import { isPersistedRowUuid } from '../lib/pantry/persistIds';
import type { GroceryListItem, PantryItem } from '../types/mealprep';

const U = (n: number) => `3f2b8c1e-1111-4222-8333-${String(n).padStart(12, '0')}`;
function row(id: string, name: string, extra: Partial<PantryItem> = {}): PantryItem {
  return {
    id,
    ingredientId: `ing-${name.toLowerCase()}`,
    name,
    category: 'dry_goods',
    quantity: 1,
    unit: 'each',
    location: 'pantry',
    photoUri: null,
    expiresOn: null,
    updatedAt: '2026-10-10T00:00:00.000Z',
    ...extra,
  };
}

// --- A cleared pantry stays cleared ---
const cachedOnDevice = [row(U(1), 'Rice'), row(U(2), 'Milk'), row(U(3), 'Eggs')];
assert.deepEqual(
  reconcilePantryAfterServerLoad([], cachedOnDevice),
  [],
  'rows the server no longer has (cleared here or on another device) do not come back from the device copy',
);
assert.deepEqual(
  reconcilePantryAfterServerLoad([row(U(2), 'Milk')], cachedOnDevice).map((r) => r.name),
  ['Milk'],
  'only what the server returns is kept',
);
// Rows the server has never seen are kept: local ids, and saves in flight under a client-chosen id.
const kept = reconcilePantryAfterServerLoad(
  [row(U(2), 'Milk')],
  [row('manual-1', 'Tomatoes'), row('scan-1-0', 'Basil'), row(U(9), 'Flour'), row(U(8), 'Sugar')],
  { pendingIds: new Set([U(9)]) },
);
assert.deepEqual(kept.map((r) => r.name), ['Milk', 'Tomatoes', 'Basil', 'Flour']);

// --- One diff feeds the screen and the server ---
const before = [row(U(1), 'Rice', { quantity: 2 }), row(U(2), 'Milk'), row(U(3), 'Eggs')];
const after = [row(U(4), 'Bread'), row(U(1), 'Rice', { quantity: 3 }), row(U(2), 'Milk')];
const diff = diffPantryForServer(before, after);
assert.deepEqual(diff.inserted.map((r) => r.id), [U(4)]);
assert.deepEqual(diff.updated.map((r) => [r.id, r.quantity]), [[U(1), 3]]);
assert.deepEqual(diff.removedIds, [U(3)]);
assert.deepEqual(diffPantryForServer(before, before), { inserted: [], updated: [], removedIds: [] });
const saved = { ...after[0], updatedAt: '2026-10-10T01:00:00.000Z' };
assert.equal(replacePantryRowsById(after, [saved])[0].updatedAt, '2026-10-10T01:00:00.000Z');
assert.equal(replacePantryRowsById(after, [saved]).length, after.length, 'no row is added or dropped');

// --- Tick, then untick: the ledger points at the row that was saved ---
function groceryItem(id: string, name: string, quantity = 1): GroceryListItem {
  return {
    id,
    ingredientId: `g-${name.toLowerCase()}`,
    name,
    category: 'dry_goods',
    quantity,
    unit: 'each',
    checked: false,
    sourceRecipeIds: [],
  } as unknown as GroceryListItem;
}
const ledger = new Map<string, { pantryItemId: string; quantityAdded: number; unit: string }>();
const start = [row(U(1), 'Rice', { quantity: 2 })];
const ticked = applyGroceryCheckRestockBatch(start, [groceryItem('g1', 'Rice'), groceryItem('g2', 'Lentils', 2)], ledger);
const toServer = diffPantryForServer(start, ticked);
assert.deepEqual(toServer.updated.map((r) => [r.name, r.quantity]), [['Rice', 3]], 'an item already owned is an update');
assert.equal(toServer.inserted.length, 1, 'a new item is one insert');
assert.ok(isPersistedRowUuid(toServer.inserted[0].id), 'the new row has an id the server keeps as it is');
assert.equal(ledger.get('g2')?.pantryItemId, toServer.inserted[0].id, 'the untick ledger names the row that is saved');
// Untick the new item: it leaves the pantry, and the diff says to delete exactly that saved row.
const unticked = reverseGroceryCheckRestock(ticked, 'g2', ledger);
assert.deepEqual(diffPantryForServer(ticked, unticked).removedIds, [toServer.inserted[0].id]);
// Untick the owned item: its quantity goes back, as an update the server will receive.
const untickedRice = reverseGroceryCheckRestock(unticked, 'g1', ledger);
assert.deepEqual(diffPantryForServer(unticked, untickedRice).updated.map((r) => r.quantity), [2]);
assert.equal(reverseGroceryCheckRestock(untickedRice, 'g1', ledger), untickedRice, 'a second untick changes nothing');

// --- A ticked grocery line reads like a thing you own, not a recipe step (testing T-18) ---
assert.equal(pantryNameFromGroceryName('butter (for toasting buns)'), 'butter');
assert.equal(pantryNameFromGroceryName('cooked white rice (cooled)'), 'cooked white rice');
assert.equal(pantryNameFromGroceryName('Parmesan cheese (freshly grated for serving)'), 'Parmesan cheese');
assert.equal(pantryNameFromGroceryName('garlic paste (or minced garlic)'), 'garlic paste');
assert.equal(pantryNameFromGroceryName('flour tortillas (taco-sized), warmed'), 'flour tortillas, warmed');
assert.equal(pantryNameFromGroceryName('  Olive oil  '), 'Olive oil');
assert.equal(pantryNameFromGroceryName('(optional)'), '(optional)', 'never an empty name');
assert.equal(groceryItemToPantryItem(groceryItem('g9', 'butter (for toasting buns)')).name, 'butter');

// --- Wiring in the app context ---
const context = fs.readFileSync(path.join(__dirname, '..', 'context/AppContext.tsx'), 'utf8').replace(/\r\n/g, '\n');
const between = (from: string, to: string) => context.slice(context.indexOf(from), context.indexOf(to, context.indexOf(from)));

const restock = between('const restockGroceriesToPantry = useCallback(', 'const toggleGroceryItem = useCallback(');
assert.match(restock, /diffPantryForServer\(pantrySnapshot, nextPantry\)/, 'tick: the rows on screen are the rows saved');
assert.doesNotMatch(restock, /groceryItemsToPantryItems\(/, 'tick: no second, separately built set of rows');
assert.doesNotMatch(restock, /setPantry\(reconciled\)/, 'tick: saving new rows does not put owned rows back to their old quantity');

assert.match(restock, /catch \(error: unknown\) \{[\s\S]{0,500}syncPantryToSnapshot\(supabase, userId, nextPantry, pantrySnapshot\)\.catch\(\(\) => undefined\);\s*return;/, 'tick: a failed save also puts the server back');
const toggles = between('const toggleGroceryItem = useCallback(', 'const markGroceryItemsBought = useCallback(');
assert.equal((toggles.match(/syncPantryToSnapshot\(supabase, userId, pantry, reversed\)/g) ?? []).length, 2, 'untick (one item, and several) sends the reversal to the server');
assert.doesNotMatch(toggles, /syncPantryToSnapshot\(supabase, userId, pantry, pantrySnapshot\)/, 'untick no longer compares the pantry with a copy of itself');

const clear = between('const clearCheckedGroceryItems = useCallback(', 'const removeGroceryItem = useCallback(');
assert.doesNotMatch(clear, /setPantry\(|applyGroceryCheckRestockBatch|insertPantryItems/, 'clearing ticked items never adds to the pantry a second time');

const scanSave = between('const savePantryScanReview = useCallback(', 'const addPantryStaples = useCallback(');
assert.match(scanSave, /catch \(error: unknown\) \{[\s\S]{0,400}setPantry\(pantrySnapshot\);[\s\S]{0,900}throw error;/, 'scan save: a failed save puts the screen back');
assert.match(scanSave, /syncPantryToSnapshot\(supabase, userId, savedPantry, pantrySnapshot\)/, 'scan save: Undo compares against the ids the server gave');
assert.match(scanSave, /if \(savedInserts\.length > 0 \|\| updated\.length > 0\) \{/, 'scan save: quantity updates saved before a failure are undone too');
assert.ok(scanSave.indexOf('await insertPantryItems(') < scanSave.indexOf('await updatePantryItem('), 'scan save: new rows first, in one request');

const clearAll = between('const clearAllPantry = useCallback(', 'const savePantryScanReview = useCallback(');
assert.match(clearAll, /writeAccountPantryCache\(userId, \[\], \{ profile \}\)/, 'clear all also empties the copy kept on the device');

const update = between('const updatePantryItemEntry = useCallback(', 'const deletePantryItemEntry = useCallback(');
assert.match(update, /if \(!isPersistedRowUuid\(item\.id\)\) \{/, 'editing a row the server does not have yet stays on the device instead of failing with a database error');

const made = between('const confirmMealMade = useCallback(', 'const logCookEngagement = useCallback(');
assert.match(made, /setPantry\(pantrySnapshot\);[\s\S]{0,700}await updatePantryItem\(supabase, userId, line\.previous\);[\s\S]{0,200}await insertPantryItem\(supabase, userId, line\.previous\);/, 'made it: a failed save puts the server back, including rows the cook used up');

console.log('pantry-data-integrity-check: ok');
