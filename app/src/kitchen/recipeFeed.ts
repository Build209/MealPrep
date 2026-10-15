/**
 * The Home feed ("Cook from your pantry") and the detail screen's grocery lines, as plain data.
 * Ranking is the old app's (recipeMatch.ts): recipes that use at least two pantry ingredients,
 * best first; when none do, the best partial overlaps (old Recipes tab fallback). Everything
 * else follows under "More recipes", fewest missing first. Pure (tests/kitchen-recipe-feed.test.ts).
 */
import { inferGroceryCategoryFromName } from './categorize';
import { slugIngredientId } from './pantryMatch';
import {
  buildPantryMatchIndex,
  DEFAULT_MIN_MATCHED_INGREDIENTS,
  filterRankedMatchesWithPartialFallback,
  scoreRecipeAgainstPantry,
  type MatchRecipe,
  type RecipePantryMatch,
  type StockRow,
} from './recipeMatch';
import { normalizeIngredientName } from './ingredientNormalize';
import { roundQty } from './recipeStock';

export type FeedEntry<R extends MatchRecipe, P extends StockRow = StockRow> = {
  recipe: R;
  match: RecipePantryMatch<P>;
};

export type RecipeFeed<R extends MatchRecipe, P extends StockRow = StockRow> = {
  /** Recipes the pantry covers best ("Cook from your pantry"). */
  cookable: FeedEntry<R, P>[];
  /** True when nothing reached two pantry ingredients and these are partial overlaps. */
  usedPartialFallback: boolean;
  /** The rest, fewest missing first (capped at `moreLimit`). */
  more: FeedEntry<R, P>[];
  /** How many recipes were left out of `more` by the cap. */
  moreHidden: number;
};

export const FEED_MORE_LIMIT = 24;

export function rankRecipeFeed<R extends MatchRecipe, P extends StockRow>(
  recipes: readonly R[],
  pantry: readonly P[],
  options?: { moreLimit?: number },
): RecipeFeed<R, P> {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const index = buildPantryMatchIndex(recipes, pantry);
  const { matches, usedPartialFallback } = filterRankedMatchesWithPartialFallback(index.ranked, 'all', 0, {
    minMatchedCount: DEFAULT_MIN_MATCHED_INGREDIENTS,
    pantryItemCount: pantry.length,
  });
  const entry = (match: RecipePantryMatch<P>): FeedEntry<R, P> | null => {
    const recipe = byId.get(match.recipeId);
    return recipe ? { recipe, match } : null;
  };
  const cookable = matches.map(entry).filter((e): e is FeedEntry<R, P> => e !== null);
  const shown = new Set(cookable.map((e) => e.recipe.id));
  const rest = [...index.byRecipeId.values()]
    .filter((m) => !shown.has(m.recipeId))
    .sort((a, b) => a.missingCount - b.missingCount || b.matchedCount - a.matchedCount || a.recipeName.localeCompare(b.recipeName))
    .map(entry)
    .filter((e): e is FeedEntry<R, P> => e !== null);
  const limit = options?.moreLimit ?? FEED_MORE_LIMIT;
  return { cookable, usedPartialFallback, more: rest.slice(0, limit), moreHidden: Math.max(0, rest.length - limit) };
}

/**
 * How many recipes can be cooked now with what is in the pantry: the same scoring as the feed and
 * its "Ready to cook" sticker (nothing missing), and at least one ingredient really from the pantry
 * (a recipe of only staples such as salt and water does not count). An empty pantry counts 0.
 * Home's "Ready to cook" counter (src/home/). Pure (tests/home-counts.test.ts).
 */
export function readyToCookCount(recipes: readonly MatchRecipe[], pantry: readonly StockRow[]): number {
  if (pantry.length === 0) return 0;
  let ready = 0;
  for (const recipe of recipes) {
    const match = scoreRecipeAgainstPantry(recipe, pantry);
    if (match.missingCount === 0 && match.matchedCount >= 1) ready += 1;
  }
  return ready;
}

/** The status sticker: leaf "Ready to cook" or banana "N missing" (DESIGN rules). */
export type RecipeStatus = { kind: 'ready' } | { kind: 'missing'; count: number };

export function recipeStatus(match: Pick<RecipePantryMatch, 'missingCount'>): RecipeStatus {
  return match.missingCount === 0 ? { kind: 'ready' } : { kind: 'missing', count: match.missingCount };
}

export function recipeStatusLabel(status: RecipeStatus): string {
  return status.kind === 'ready' ? 'Ready to cook' : `${status.count} missing`;
}

/** Score one recipe (the detail screen). */
export function matchRecipe<P extends StockRow>(recipe: MatchRecipe, pantry: readonly P[]): RecipePantryMatch<P> {
  return scoreRecipeAgainstPantry(recipe, pantry);
}

// ------------------------------------------------------------ add missing to grocery

/** One grocery row to add for a missing ingredient (the server merges it with an open row). */
export type MissingGroceryLine = {
  ingredientId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
};

/** "onion (diced)" -> "onion": the note belongs to the recipe, not the shopping list. */
export function groceryNameFor(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return stripped || trimmed;
}

/**
 * Library recipes number their lines ("lib-<slug>-0"), which means nothing outside that recipe,
 * so those (and empty ids) get the name's slug instead (old app: slugIngredientId).
 */
export function groceryIngredientIdFor(line: { ingredientId: string; name: string }): string {
  const id = line.ingredientId.trim();
  if (!id || id.startsWith('lib-')) return slugIngredientId(groceryNameFor(line.name));
  return id;
}

/**
 * The grocery rows for a recipe's missing lines (old app: mergeGroceryWithMissing, minus the
 * merge, which the server does). Quantity is what is still needed; a line with no amount
 * ("salt to taste") asks for 1. Category comes from a pantry row of the same thing, else the
 * name. Two lines of the same thing in the same unit become one row.
 */
export function groceryLinesForMissing(
  match: Pick<RecipePantryMatch, 'missing'>,
  pantry: readonly { ingredientId: string; name: string; category: string }[],
): MissingGroceryLine[] {
  const out: MissingGroceryLine[] = [];
  for (const line of match.missing) {
    const name = groceryNameFor(line.name);
    if (!name) continue;
    const ingredientId = groceryIngredientIdFor(line);
    const unit = line.unit.trim() || 'each';
    const quantity = Number.isFinite(line.quantity) && line.quantity > 0 ? roundQty(line.quantity) : 1;
    const same = out.find((row) => row.ingredientId === ingredientId && row.unit.toLowerCase() === unit.toLowerCase());
    if (same) {
      same.quantity = roundQty(same.quantity + quantity);
      continue;
    }
    const pantryRow = pantry.find(
      (row) => row.ingredientId === ingredientId || normalizeIngredientName(row.name) === normalizeIngredientName(name),
    );
    out.push({ ingredientId, name, category: pantryRow ? pantryRow.category : inferGroceryCategoryFromName(name), quantity, unit });
  }
  return out;
}
