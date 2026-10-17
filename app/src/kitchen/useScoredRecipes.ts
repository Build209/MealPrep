import { useEffect, useState } from 'react';
import { scoreAllCached, type ScoredById } from './scoreAll';
import type { MatchRecipe, StockRow } from './recipeMatch';

/** The pantry match of every recipe, worked out in the background. `null` until it is ready. */
export function useScoredRecipes<P extends StockRow>(
  recipes: readonly MatchRecipe[] | undefined,
  pantry: readonly P[] | undefined,
): ScoredById<P> | null {
  const [state, setState] = useState<{ recipes: unknown; pantry: unknown; scored: ScoredById<P> } | null>(null);
  useEffect(() => {
    if (!recipes || !pantry) return;
    let live = true;
    scoreAllCached(recipes, pantry).then(
      (scored) => {
        if (live) setState({ recipes, pantry, scored });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [recipes, pantry]);
  // Never show results for an older pantry or recipe list.
  return state && state.recipes === recipes && state.pantry === pantry ? state.scored : null;
}
