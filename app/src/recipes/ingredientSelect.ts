/**
 * Ticking ingredients on the recipe detail, then "Add to pantry" / "Add to cart" for all ticked rows
 * at once. Pure (tests/recipe-ingredient-select.test.ts): which rows can be ticked, the selection
 * state, what each batch saves, and the result lines. Selection is keyed by line position.
 * The saves themselves are the app's own: useAddPantryItem for the pantry, add_missing_to_grocery
 * (useAddMissingToGrocery) for the cart, so rows flip through the existing recipeCart rules.
 */
import { groceryLinesForMissing, type MissingGroceryLine } from '../kitchen/recipeFeed';
import type { CartStatusLine } from '../kitchen/recipeCart';
import type { RecipePantryMatch } from '../kitchen/recipeMatch';
import type { RecipeIngredientLine, StockRow } from '../kitchen/recipeStock';
import { canAddToPantry, pantryAddForIngredient, type RecipePantryAdd } from './pantryAdd';
import { addMissingMessage, DETAIL_COPY } from './recipeLogic';

export type Selection = ReadonlySet<number>;

/**
 * Positions of the rows that get a checkbox: the pantry holds none of it (Missing, In cart with
 * nothing in the pantry, or a staple with no pantry row; never water; never In pantry).
 * `baseLines` is RecipeCartMatch.pantry.lines.
 */
export function selectableIndexes(
  lines: readonly CartStatusLine[],
  baseLines: readonly RecipePantryMatch['lines'][number][],
  pantry: readonly StockRow[],
): number[] {
  const out: number[] = [];
  lines.forEach((line, index) => {
    if (canAddToPantry(line, baseLines[index], pantry) && pantryAddForIngredient(line.ingredient)) out.push(index);
  });
  return out;
}

export function toggleSelection(selection: Selection, index: number): Selection {
  const next = new Set(selection);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}

/** Keeps ticks only on rows that can still be ticked (a row that turned In pantry loses its tick). */
export function pruneSelection(selection: Selection, selectable: readonly number[]): Selection {
  const allowed = new Set(selectable);
  const kept = [...selection].filter((i) => allowed.has(i));
  return kept.length === selection.size ? selection : new Set(kept);
}

export function allSelected(selection: Selection, selectable: readonly number[]): boolean {
  return selectable.length > 0 && selectable.every((i) => selection.has(i));
}

/** "Select all missing" ticks every tickable row; when all are ticked it clears them. */
export function toggleSelectAll(selection: Selection, selectable: readonly number[]): Selection {
  return allSelected(selection, selectable) ? new Set() : new Set(selectable);
}

export function withoutIndexes(selection: Selection, done: readonly number[]): Selection {
  const next = new Set(selection);
  for (const i of done) next.delete(i);
  return next;
}

/** Ticked positions in list order. */
export function tickedIndexes(selection: Selection): number[] {
  return [...selection].sort((a, b) => a - b);
}

export type PantryBatchItem = { index: number; name: string; add: RecipePantryAdd };

/** What "Add to pantry" saves: one pantry row per ticked line (the same mapping the single add had). */
export function pantryBatch(
  indexes: readonly number[],
  lines: readonly CartStatusLine[],
  pantry: readonly { ingredientId: string; name: string; category: string }[],
): PantryBatchItem[] {
  const out: PantryBatchItem[] = [];
  for (const index of indexes) {
    const line = lines[index];
    if (!line) continue;
    const add = pantryAddForIngredient(line.ingredient, pantry);
    if (add) out.push({ index, name: add.fields.name, add });
  }
  return out;
}

/**
 * What "Add to cart" sends: the grocery lines for ticked rows that are not already In cart
 * (those are counted in `alreadyInCart`). A Missing row asks for what is still needed.
 */
export function cartBatch(
  indexes: readonly number[],
  lines: readonly CartStatusLine[],
  pantry: readonly { ingredientId: string; name: string; category: string }[],
): { lines: MissingGroceryLine[]; alreadyInCart: number } {
  const missing: RecipeIngredientLine[] = [];
  let alreadyInCart = 0;
  for (const index of indexes) {
    const line = lines[index];
    if (!line) continue;
    if (line.status === 'cart') {
      alreadyInCart += 1;
      continue;
    }
    missing.push(line.status === 'missing' ? { ...line.ingredient, quantity: line.need } : line.ingredient);
  }
  return { lines: groceryLinesForMissing({ missing }, pantry), alreadyInCart };
}

/** Result line after the pantry batch: how many went in, and which did not (they stay ticked). */
export function pantryBatchMessage(addedCount: number, failed: readonly { name: string; message: string }[]): string {
  if (failed.length === 0) return DETAIL_COPY.addedBatchToPantry(addedCount);
  const names = failed.map((f) => f.name).join(', ');
  const reason = failed[0]?.message ?? '';
  const head = addedCount > 0 ? DETAIL_COPY.addedBatchToPantry(addedCount) : DETAIL_COPY.nothingAddedToPantry;
  return `${head} ${DETAIL_COPY.notAddedList(names)}${reason ? ` ${reason}` : ''}`;
}

/** Result line after the cart batch. `result` is null when every ticked row was already In cart. */
export function cartBatchMessage(
  result: { added: number; merged: number; unchanged: number } | null,
  alreadyInCart: number,
): string {
  const base = result ?? { added: 0, merged: 0, unchanged: 0 };
  return addMissingMessage({ ...base, unchanged: base.unchanged + alreadyInCart });
}
