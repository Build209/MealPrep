import type { RecipesTabRow } from '../../config/recipesTabFilters';

/** How many recipe circles Home shows under "From your pantry" before the See all circle. */
export const PANTRY_CIRCLES_LIMIT = 8;
/** Recipes missing more than this many ingredients are not "cook tonight" picks. */
export const PANTRY_CIRCLES_MAX_MISSING = 2;

/**
 * Picks the recipes for the "From your pantry" circles on Home (owner chose option B, 2026-10-11):
 * your own and curated recipes the pantry can make now, or nearly. Ready ones first, then Need 1,
 * then Need 2; inside each group the better pantry match leads. Empty when nothing qualifies,
 * so Home falls back to the category chips.
 */
export function pickPantryCircleRows(
  rows: readonly RecipesTabRow[],
  limit: number = PANTRY_CIRCLES_LIMIT,
): RecipesTabRow[] {
  const seen = new Set<string>();
  const picks = rows.filter((row) => {
    if (row.kind !== 'kitchen') return false;
    if (row.pantryMatchPending || row.pantryMatchFailed) return false;
    const { match } = row;
    if (match.totalIngredients <= 0 || match.matchedCount <= 0) return false;
    if (match.missingCount > PANTRY_CIRCLES_MAX_MISSING) return false;
    const id = String(row.recipe.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  picks.sort((a, b) => {
    if (a.match.missingCount !== b.match.missingCount) {
      return a.match.missingCount - b.match.missingCount;
    }
    if (b.match.percentMatch !== a.match.percentMatch) {
      return b.match.percentMatch - a.match.percentMatch;
    }
    return a.match.recipeName.localeCompare(b.match.recipeName);
  });
  return picks.slice(0, Math.max(0, limit));
}

/** The sticker on a circle: "Ready" when nothing is missing, otherwise "Need N". */
export function pantryCircleSticker(missingCount: number): { label: string; ready: boolean } {
  if (missingCount <= 0) return { label: 'Ready', ready: true };
  return { label: `Need ${missingCount}`, ready: false };
}
