/**
 * Home's three counters, worked out from the same query data the tabs show (no second copy).
 * `null` means "not loaded yet" (or the read failed): the tile then shows no number. Pure
 * (tests/home-counts.test.ts).
 */
import { readyToCookCount } from '../kitchen/recipeFeed';
import type { MatchRecipe, StockRow } from '../kitchen/recipeMatch';

export type HomeCounts = {
  /** Recipes with nothing missing (the "Ready to cook" sticker), from the pantry match. */
  ready: number | null;
  /** Rows in the pantry. */
  pantry: number | null;
  /** Grocery list rows not ticked yet. */
  grocery: number | null;
};

export function homeCounts(input: {
  recipes: readonly MatchRecipe[] | undefined;
  pantry: readonly StockRow[] | undefined;
  grocery: readonly { checked: boolean }[] | undefined;
}): HomeCounts {
  const { recipes, pantry, grocery } = input;
  return {
    ready: recipes && pantry ? readyToCookCount(recipes, pantry) : null,
    pantry: pantry ? pantry.length : null,
    grocery: grocery ? grocery.filter((item) => !item.checked).length : null,
  };
}
