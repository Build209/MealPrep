/**
 * Allergen-aware ordering for recipe lists. Pure; tests/allergens-rank.test.ts.
 *
 * With no saved allergens nothing changes (same arrays, same order). With allergens, recipes whose
 * ingredient names match one go to the bottom, in their own labelled group; every other recipe keeps
 * the order it already had.
 */
import { rankRecipeFeed, type FeedEntry, type RecipeFeed } from '../kitchen/recipeFeed';
import type { MatchRecipe, StockRow } from '../kitchen/recipeMatch';
import { FEED_MORE_LIMIT } from '../kitchen/recipeFeed';
import { recipeAllergenStatus } from './detect';
import type { AllergenKey } from './types';

/** Stable split: items with no matching allergen first, then flagged ones, each in the given order. */
export function partitionByAllergens<T>(
  items: readonly T[],
  userAllergens: readonly AllergenKey[],
  ingredientsOf: (item: T) => readonly { name: string }[],
): { clear: T[]; flagged: { item: T; allergens: AllergenKey[] }[] } {
  if (userAllergens.length === 0) return { clear: [...items], flagged: [] };
  const clear: T[] = [];
  const flagged: { item: T; allergens: AllergenKey[] }[] = [];
  for (const item of items) {
    const allergens = recipeAllergenStatus({ ingredients: ingredientsOf(item) }, userAllergens);
    if (allergens.length === 0) clear.push(item);
    else flagged.push({ item, allergens });
  }
  return { clear, flagged };
}

export type AllergenFeed<R extends MatchRecipe, P extends StockRow = StockRow> = RecipeFeed<R, P> & {
  /** Recipes with one of the person's allergens, best pantry match first, capped. Empty with no allergens. */
  flagged: (FeedEntry<R, P> & { allergens: AllergenKey[] })[];
  /** How many flagged recipes were left out by the cap. */
  flaggedHidden: number;
};

/**
 * The Recipes feed with allergens applied: recipes with one of the person's allergens are taken out
 * BEFORE ranking (so they cannot use up the "More recipes" cap) and ranked on their own below.
 */
export function rankFeedWithAllergens<R extends MatchRecipe, P extends StockRow>(
  recipes: readonly R[],
  pantry: readonly P[],
  userAllergens: readonly AllergenKey[],
  options?: { moreLimit?: number; cookableLimit?: number; flaggedLimit?: number; hideFromMore?: (recipe: R) => boolean },
): AllergenFeed<R, P> {
  if (userAllergens.length === 0) {
    return { ...rankRecipeFeed(recipes, pantry, options), flagged: [], flaggedHidden: 0 };
  }
  const { clear, flagged } = partitionByAllergens(recipes, userAllergens, (r) => r.ingredients);
  const allergensById = new Map(flagged.map((f) => [f.item.id, f.allergens]));
  const feed = rankRecipeFeed(clear, pantry, options);
  const flaggedFeed = rankRecipeFeed(
    flagged.map((f) => f.item),
    pantry,
    { moreLimit: Number.MAX_SAFE_INTEGER, cookableLimit: Number.MAX_SAFE_INTEGER, hideFromMore: options?.hideFromMore },
  );
  const all = [...flaggedFeed.cookable, ...flaggedFeed.more].map((entry) => ({
    ...entry,
    allergens: allergensById.get(entry.recipe.id) ?? [],
  }));
  const limit = options?.flaggedLimit ?? FEED_MORE_LIMIT;
  return { ...feed, flagged: all.slice(0, limit), flaggedHidden: Math.max(0, all.length - limit) };
}

/**
 * Search results: recipes with one of the person's allergens move after everything else (videos
 * and clear recipes keep their order). Items that are not recipes are never flagged.
 */
export function demoteFlaggedResults<T>(
  items: readonly T[],
  userAllergens: readonly AllergenKey[],
  ingredientsOf: (item: T) => readonly { name: string }[] | null,
): { items: T[]; allergensOf: Map<T, AllergenKey[]> } {
  const allergensOf = new Map<T, AllergenKey[]>();
  if (userAllergens.length === 0) return { items: [...items], allergensOf };
  const clear: T[] = [];
  const flagged: T[] = [];
  for (const item of items) {
    const ingredients = ingredientsOf(item);
    const allergens = ingredients ? recipeAllergenStatus({ ingredients }, userAllergens) : [];
    if (allergens.length > 0) {
      allergensOf.set(item, allergens);
      flagged.push(item);
    } else {
      clear.push(item);
    }
  }
  return { items: [...clear, ...flagged], allergensOf };
}
