/**
 * Scores every recipe against the pantry in small slices, giving the screen back between slices, so
 * a full pantry against a 3,800-recipe library never freezes the page. Same scoring function, same
 * results as scoring in one go (tests/score-all.test.ts). Results are shared by the Recipes tab and
 * Home through a cache keyed on the two query arrays.
 */
import { scoreRecipeAgainstPantry, type MatchRecipe, type RecipePantryMatch, type StockRow } from './recipeMatch';

export type ScoredById<P extends StockRow = StockRow> = Map<string, RecipePantryMatch<P>>;

const SLICE_MS = 30;

const yieldToScreen = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function scoreRecipesInChunks<P extends StockRow>(
  recipes: readonly MatchRecipe[],
  pantry: readonly P[],
  options?: { sliceMs?: number; isCancelled?: () => boolean },
): Promise<ScoredById<P>> {
  const sliceMs = options?.sliceMs ?? SLICE_MS;
  const out: ScoredById<P> = new Map();
  let sliceStart = Date.now();
  for (const recipe of recipes) {
    out.set(recipe.id, scoreRecipeAgainstPantry(recipe, pantry));
    if (Date.now() - sliceStart >= sliceMs) {
      await yieldToScreen();
      if (options?.isCancelled?.()) throw new Error('superseded');
      sliceStart = Date.now();
    }
  }
  return out;
}

const CACHE = new WeakMap<object, WeakMap<object, Promise<ScoredById<never>>>>();
let latestRun = 0;

/** One run per (recipes, pantry) pair; starting a newer pair cancels the older run. */
export function scoreAllCached<P extends StockRow>(recipes: readonly MatchRecipe[], pantry: readonly P[]): Promise<ScoredById<P>> {
  let byPantry = CACHE.get(recipes);
  if (!byPantry) {
    byPantry = new WeakMap();
    CACHE.set(recipes, byPantry);
  }
  const hit = byPantry.get(pantry);
  if (hit) return hit as unknown as Promise<ScoredById<P>>;
  const run = ++latestRun;
  const promise = scoreRecipesInChunks(recipes, pantry, { isCancelled: () => run !== latestRun });
  const store = byPantry;
  store.set(pantry, promise as unknown as Promise<ScoredById<never>>);
  promise.catch(() => store.delete(pantry));
  return promise;
}
