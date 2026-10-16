/**
 * "Add to pantry" on a recipe's ingredient row: which rows get the control, and what one tap saves.
 * Pure (tests/recipe-pantry-add.test.ts). The save itself is the pantry's own add (useAddPantryItem),
 * so the row, the counts and the grocery "In cart" rules all come from the same matcher as before:
 * once the pantry row exists the line reads 'have' (recipeCart.ts), and an open grocery row for the
 * same thing is not counted a second time.
 */
import type { PantryItemFields } from '../data/pantryFields';
import { inferGroceryCategoryFromName } from '../kitchen/categorize';
import type { CartStatusLine } from '../kitchen/recipeCart';
import { groceryIngredientIdFor, groceryNameFor } from '../kitchen/recipeFeed';
import type { RecipePantryMatch } from '../kitchen/recipeMatch';
import { findPantryItemsForIngredient, type RecipeIngredientLine, type StockRow } from '../kitchen/recipeStock';
import { suggestStorageLocationForPantryItem } from '../kitchen/storage';

/** What one tap adds, ready for newPantryItemVars. */
export type RecipePantryAdd = { ingredientId: string; fields: PantryItemFields };

/**
 * Name without the recipe's note ("onion (diced)" -> "onion", as the grocery list does), the
 * recipe's amount and unit (1 each when the line has none), category and place from the name.
 * Null when there is no usable name.
 */
export function pantryAddForIngredient(
  ingredient: RecipeIngredientLine,
  pantry: readonly { ingredientId: string; name: string; category: string }[] = [],
): RecipePantryAdd | null {
  const name = groceryNameFor(ingredient.name);
  if (!name) return null;
  const ingredientId = groceryIngredientIdFor(ingredient);
  const quantity = Number.isFinite(ingredient.quantity) && ingredient.quantity > 0 ? ingredient.quantity : 1;
  const inferred = inferGroceryCategoryFromName(name);
  const sameThing = pantry.find((row) => row.ingredientId === ingredientId);
  return {
    ingredientId,
    fields: {
      name,
      category: sameThing ? sameThing.category : inferred,
      quantity,
      unit: ingredient.unit.trim() || 'each',
      location: suggestStorageLocationForPantryItem(name, inferred),
      expiresOn: null,
    },
  };
}

/** Staple lines (salt, oil...) are assumed in every kitchen, but a pantry row for one is still welcome. Water is not. */
function isAddableStaple(ingredient: RecipeIngredientLine): boolean {
  return !/\bwater\b/i.test(ingredient.name);
}

/** A staple the pantry holds a row for: shown as In pantry, like any other ingredient. */
export function stapleHeldInPantry(line: CartStatusLine, pantry: readonly StockRow[]): boolean {
  return line.status === 'staple' && findPantryItemsForIngredient(line.ingredient, pantry).length > 0;
}

/**
 * Does this row get the control? Yes when the pantry holds none of it: Missing, In cart with
 * nothing in the pantry, or a staple (olive oil) with no pantry row. Not when it is In pantry, or
 * the pantry already holds some (a "Need 1/2 lb more" row: a second pantry row would be a
 * duplicate, not an add). `base` is the pantry-only line at the same position
 * (RecipeCartMatch.pantry.lines).
 */
export function canAddToPantry(
  line: CartStatusLine,
  base: RecipePantryMatch['lines'][number] | undefined,
  pantry: readonly StockRow[],
): boolean {
  if (line.status === 'have') return false;
  if (line.status === 'staple') return isAddableStaple(line.ingredient) && !stapleHeldInPantry(line, pantry);
  if (base && base.status === 'have') return false;
  if (base && base.status === 'missing' && base.short) return false;
  return true;
}
