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
  /** How many more matches were left out of `cookable` by the cap. */
  cookableHidden: number;
  /** True when nothing reached two pantry ingredients and these are partial overlaps. */
  usedPartialFallback: boolean;
  /** The rest, fewest missing first (capped at `moreLimit`). */
  more: FeedEntry<R, P>[];
  /** How many recipes were left out of `more` by the cap. */
  moreHidden: number;
};

export const FEED_MORE_LIMIT = 24;

/** With a big library and a full pantry, hundreds of recipes can match; show the best few. */
export const FEED_COOKABLE_LIMIT = 30;

/**
 * The Recipes tab hides library recipes (ids l_...) with fewer ingredient lines than this from
 * "More recipes": an imported recipe parsed down to one or two lines always reads "1 missing" and
 * would top the list. Master and the person's own recipes are never hidden.
 */
export const FEED_MIN_INGREDIENT_LINES = 3;

export const hideThinLibraryRecipe = (recipe: { id: string; ingredients: readonly unknown[] }): boolean =>
  recipe.id.startsWith('l_') && recipe.ingredients.length < FEED_MIN_INGREDIENT_LINES;

/** From this many missing ingredients a recipe is "far": there are endless such options, so they rotate daily. */
export const FEED_ROTATE_FROM_MISSING = 4;

/** Today's date on the device (YYYY-MM-DD): the default rotation seed, so the far recipes change each day. */
export function todaySeed(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function seededHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Feed order: close recipes (0 to 3 missing) are ranked on merit: nothing missing first, then fewest
 * missing, highest percent, most matched, name. Far recipes (4+ missing) come after them in a
 * rotation that is fixed for the day (same seed, same order) and changes the next day.
 */
export function compareFeedMatches(seed: string) {
  return (a: RecipePantryMatch, b: RecipePantryMatch): number => {
    const aFar = a.missingCount >= FEED_ROTATE_FROM_MISSING;
    const bFar = b.missingCount >= FEED_ROTATE_FROM_MISSING;
    if (aFar !== bFar) return aFar ? 1 : -1;
    if (aFar) return seededHash(`${seed}|${a.recipeId}`) - seededHash(`${seed}|${b.recipeId}`) || a.recipeId.localeCompare(b.recipeId);
    return (
      a.missingCount - b.missingCount ||
      b.percentMatch - a.percentMatch ||
      b.matchedCount - a.matchedCount ||
      a.recipeName.localeCompare(b.recipeName)
    );
  };
}

export function rankRecipeFeed<R extends MatchRecipe, P extends StockRow>(
  recipes: readonly R[],
  pantry: readonly P[],
  options?: { moreLimit?: number; cookableLimit?: number; seed?: string; scoredById?: ReadonlyMap<string, RecipePantryMatch<P>>; hideFromMore?: (recipe: R) => boolean },
): RecipeFeed<R, P> {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const index = buildPantryMatchIndex(recipes, pantry, options?.scoredById);
  const { matches, usedPartialFallback } = filterRankedMatchesWithPartialFallback(index.ranked, 'all', 0, {
    minMatchedCount: DEFAULT_MIN_MATCHED_INGREDIENTS,
    pantryItemCount: pantry.length,
  });
  const entry = (match: RecipePantryMatch<P>): FeedEntry<R, P> | null => {
    const recipe = byId.get(match.recipeId);
    return recipe ? { recipe, match } : null;
  };
  const order = compareFeedMatches(options?.seed ?? todaySeed());
  const allCookable = [...matches].sort(order).map(entry).filter((e): e is FeedEntry<R, P> => e !== null);
  const cookableLimit = options?.cookableLimit ?? FEED_COOKABLE_LIMIT;
  const cookable = allCookable.slice(0, cookableLimit);
  const shown = new Set(allCookable.map((e) => e.recipe.id));
  const rest = [...index.byRecipeId.values()]
    .filter((m) => !shown.has(m.recipeId))
    .filter((m) => {
      const recipe = byId.get(m.recipeId);
      return !(recipe && options?.hideFromMore?.(recipe));
    })
    .sort(order)
    .map(entry)
    .filter((e): e is FeedEntry<R, P> => e !== null);
  const limit = options?.moreLimit ?? FEED_MORE_LIMIT;
  return { cookable, cookableHidden: Math.max(0, allCookable.length - cookableLimit), usedPartialFallback, more: rest.slice(0, limit), moreHidden: Math.max(0, rest.length - limit) };
}

/**
 * How many recipes can be cooked now with what is in the pantry: the same scoring as the feed and
 * its "Ready to cook" sticker (nothing missing), and at least one ingredient really from the pantry
 * (a recipe of only staples such as salt and water does not count). An empty pantry counts 0.
 * Home's "Ready to cook" counter (src/home/). Pure (tests/home-counts.test.ts).
 */
export function readyToCookCount(
  recipes: readonly MatchRecipe[],
  pantry: readonly StockRow[],
  scoredById?: ReadonlyMap<string, RecipePantryMatch>,
  /** Recipes the list never shows (hideThinLibraryRecipe) must not be counted either. */
  exclude?: (recipe: MatchRecipe) => boolean,
): number {
  if (pantry.length === 0) return 0;
  let ready = 0;
  for (const recipe of recipes) {
    if (exclude?.(recipe)) continue;
    const match = scoredById?.get(recipe.id) ?? scoreRecipeAgainstPantry(recipe, pantry);
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
