/**
 * Recipe against pantry AND the grocery list ("cart"). Pantry first (scoreRecipeAgainstPantry,
 * unchanged), then the open grocery rows cover whatever the pantry does not. Cart rows are matched
 * with the SAME rules as pantry rows (findPantryItemsForIngredient: id, name and synonym keys, fuzzy
 * score, egg parts; amounts summed in the recipe's unit through the unit bridges), so there is one
 * matcher, not two. Pure (tests/kitchen-recipe-cart.test.ts).
 *
 * The rule, per counted ingredient line:
 *   1. pantry holds enough                                   -> 'have'    (In pantry)
 *   2. else the open grocery rows cover what the pantry lacks -> 'cart'    (In cart)
 *   3. else                                                  -> 'missing', only the remainder
 *                                                               after pantry AND cart is needed
 * Staples stay 'staple'. Ticked grocery rows are NOT cart: ticking moves the stock into the pantry
 * on the server (tick_grocery_item), so counting them again would double count.
 * "Ready to cook" and the feed stay pantry-only: they read the pantry-only result in `pantry`,
 * which this leaves exactly as scoreRecipeAgainstPantry gave it.
 */
import { scoreRecipeAgainstPantry, type MatchRecipe, type RecipePantryMatch } from './recipeMatch';
import { findPantryItemsForIngredient, roundQty, totalPantryQuantityInUnit, type RecipeIngredientLine, type StockRow } from './recipeStock';

/** The fields of a grocery row the matcher reads (data-layer GroceryItem fits). */
export type CartRow = StockRow & { checked?: boolean };

export type CartStatusLine<P extends StockRow = StockRow, C extends CartRow = CartRow> =
  | { status: 'have'; ingredient: RecipeIngredientLine; pantryItem: P }
  /** Pantry holds none or too little and the grocery list covers the rest. `fromPantry`: the pantry holds part. */
  | { status: 'cart'; ingredient: RecipeIngredientLine; cartItems: C[]; fromPantry: boolean }
  /** `need` is what is still to buy after pantry and cart, in the recipe's unit. */
  | { status: 'missing'; ingredient: RecipeIngredientLine; need: number; short: boolean; someInCart?: boolean }
  | { status: 'staple'; ingredient: RecipeIngredientLine };

export type RecipeCartMatch<P extends StockRow = StockRow, C extends CartRow = CartRow> = {
  /** The pantry-only result, untouched (feed, "Ready to cook"). */
  pantry: RecipePantryMatch<P>;
  lines: CartStatusLine<P, C>[];
  inPantryCount: number;
  inCartCount: number;
  /** Lines still to buy after pantry and cart: the number shown as "N items needed". */
  neededCount: number;
  /** Those lines with quantity = the remainder, ready for groceryLinesForMissing. */
  stillMissing: RecipeIngredientLine[];
};

/** Does this cart stock cover `need` (in the ingredient's unit)? Unconvertible units count as covered, as for the pantry. */
function coverage(candidates: readonly CartRow[], ingredient: RecipeIngredientLine, need: number): { covers: boolean; have: number } {
  if (candidates.length === 0) return { covers: false, have: 0 };
  const have = totalPantryQuantityInUnit(candidates, ingredient.unit, ingredient.name);
  if (have === null) return { covers: true, have: need };
  return { covers: have >= need, have };
}

export function scoreRecipeWithCart<P extends StockRow, C extends CartRow>(
  recipe: MatchRecipe,
  pantry: readonly P[],
  grocery: readonly C[],
): RecipeCartMatch<P, C> {
  const base = scoreRecipeAgainstPantry(recipe, pantry);
  const open = grocery.filter((row) => !row.checked);
  const usedCart = new Set<string>(); // a grocery row counts once per recipe, like a pantry row
  const lines: CartStatusLine<P, C>[] = [];
  const stillMissing: RecipeIngredientLine[] = [];
  let inPantryCount = 0;
  let inCartCount = 0;

  for (const line of base.lines) {
    if (line.status === 'staple') {
      lines.push(line);
      continue;
    }
    if (line.status === 'have') {
      inPantryCount += 1;
      lines.push(line);
      continue;
    }
    const { ingredient, need } = line;
    const candidates = findPantryItemsForIngredient(
      ingredient,
      open.filter((row) => !usedCart.has(row.id)),
    );
    const found = coverage(candidates, ingredient, need);
    for (const row of candidates) usedCart.add(row.id);
    if (found.covers) {
      inCartCount += 1;
      lines.push({ status: 'cart', ingredient, cartItems: candidates, fromPantry: line.short });
      continue;
    }
    const left = found.have > 0 ? roundQty(need - found.have) : need;
    stillMissing.push({ ...ingredient, quantity: left });
    lines.push({ status: 'missing', ingredient, need: left, short: line.short || found.have > 0, someInCart: found.have > 0 });
  }

  return { pantry: base, lines, inPantryCount, inCartCount, neededCount: stillMissing.length, stillMissing };
}
