import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useIsOnline } from '../data/online';
import { computeRecipeNutrition } from './nutritionMath';
import { planIngredients, type NutritionIngredientInput } from './plan';
import type { RecipeNutrition } from './types';
import { fetchPer100g } from './usdaClient';
import type { Per100g } from './usdaParse';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type NutritionRecipeInput = {
  id: string;
  servings: number | null;
  ingredients: ReadonlyArray<NutritionIngredientInput>;
};

/**
 * Per-serving nutrition for a recipe from USDA FoodData Central. Pass enabled=false for people
 * without Plus: no network call is made. One cached lookup per normalised ingredient name
 * (30 days), so repeated ingredients across recipes cost nothing. data stays undefined until
 * every lookup has settled (or while offline with lookups still missing).
 */
export function useRecipeNutrition(
  recipe: NutritionRecipeInput | undefined,
  enabled: boolean,
): { data: RecipeNutrition | undefined; isLoading: boolean; isError: boolean; isOffline: boolean } {
  const online = useIsOnline();
  const active = enabled && recipe !== undefined;
  const plan = useMemo(() => planIngredients(recipe?.ingredients ?? []), [recipe?.ingredients]);

  const results = useQueries({
    queries: plan.labels.map((label) => ({
      queryKey: ['usda-per100g', label],
      queryFn: () => fetchPer100g(label),
      enabled: active,
      staleTime: THIRTY_DAYS_MS,
      gcTime: THIRTY_DAYS_MS,
      retry: 1,
    })),
  });

  const pending = results.some((r) => r.isPending);
  const anyError = results.some((r) => r.isError);

  const data = useMemo((): RecipeNutrition | undefined => {
    if (!active || !recipe || pending) return undefined;
    const byLabel = new Map<string, Per100g | null>();
    plan.labels.forEach((label, i) => byLabel.set(label, results[i]?.data ?? null));
    const lines = plan.lines.map((line) => ({
      grams: line.grams,
      per100g: line.lookup ? (byLabel.get(line.label) ?? null) : null,
    }));
    return computeRecipeNutrition(lines, recipe.servings, plan.lines.length);
    // results is a new array each render; its data/status drive the dependencies below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, recipe?.servings, plan, pending, results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join('|')]);

  return {
    data,
    isLoading: active && online && pending,
    isError: active && anyError && (data === undefined || data.status === 'not-enough-data'),
    isOffline: !online,
  };
}
