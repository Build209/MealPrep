/**
 * A list that is still loading keeps its order: first come, first placed, new ones underneath.
 * Run from mobile/: npm run test:stable-row-order
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyStableOrder, stableOrderIds } from '../lib/recipes/stableRowOrder';

// What the live grid did on 2026-10-10: each batch arrived re-sorted, new recipes on top.
let order: string[] = [];
order = stableOrderIds(order, ['congee', 'burger', 'curry']);
assert.deepEqual(order, ['congee', 'burger', 'curry'], 'first batch: as it arrived');
order = stableOrderIds(order, ['casserole', 'congee', 'karaage', 'burger', 'curry']);
assert.deepEqual(order, ['congee', 'burger', 'curry', 'casserole', 'karaage'], 'new recipes go underneath, never above');
order = stableOrderIds(order, ['kfc', 'basquaise', 'casserole', 'karaage', 'congee', 'curry', 'burger']);
assert.deepEqual(order.slice(0, 5), ['congee', 'burger', 'curry', 'casserole', 'karaage'], 'what was on screen has not moved');
assert.deepEqual(order.slice(5), ['kfc', 'basquaise']);
// A recipe that drops out (diet filter, failed lookup) leaves no hole and does not reorder the rest.
order = stableOrderIds(order, ['kfc', 'curry', 'congee', 'karaage']);
assert.deepEqual(order, ['congee', 'curry', 'karaage', 'kfc']);
// The same recipe listed twice appears once.
assert.deepEqual(stableOrderIds([], ['a', 'b', 'a']), ['a', 'b']);
// Starting over (another category, refresh) takes the incoming order.
assert.deepEqual(stableOrderIds([], ['z', 'y', 'x']), ['z', 'y', 'x']);

// The rows themselves follow that order and keep their latest contents.
const rows = [
  { id: 'kfc', have: 3 },
  { id: 'congee', have: 5 },
];
assert.deepEqual(applyStableOrder(rows, ['congee', 'gone', 'kfc'], (row) => row.id), [
  { id: 'congee', have: 5 },
  { id: 'kfc', have: 3 },
]);

// Home's recipe grid uses it, and resets on a new category or the refresh button.
const home = fs.readFileSync(path.join(__dirname, '..', 'app/(tabs)/index.tsx'), 'utf8');
assert.match(home, /useStableRowOrder\(\s*classicRecipeRows,\s*classicRowId,/);
assert.match(home, /\$\{selectedClassicCategory \?\? 'all'\}\|\$\{feedDiversitySeed\}/);
assert.match(home, /\{steadyClassicRecipeRows\.map\(\(row\) => \(/);

console.log('stable-row-order-check: ok');
