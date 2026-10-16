/**
 * Decides which ingredient names to look up for a recipe. Pure (tests/nutrition-math.test.ts).
 */
import { canonicalIngredientSearchLabel } from '../kitchen/ingredientNormalize';
import { gramsForIngredient } from './toGrams';

export const MAX_LOOKUPS_PER_RECIPE = 25;

export type NutritionIngredientInput = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  raw?: string;
};

export type PlannedLine = {
  /** Normalised name used as the USDA search text and the cache key; '' when the name is unusable. */
  label: string;
  /** Null when the amount cannot be turned into grams; such a line is never looked up. */
  grams: number | null;
  /** True when this line's label is within the lookup cap. */
  lookup: boolean;
};

export function planIngredients(
  ingredients: ReadonlyArray<NutritionIngredientInput>,
  maxLookups: number = MAX_LOOKUPS_PER_RECIPE,
): { lines: PlannedLine[]; labels: string[] } {
  const labels: string[] = [];
  const lines = ingredients.map((ing): PlannedLine => {
    const label = canonicalIngredientSearchLabel(ing.name ?? '').trim();
    const grams = label ? gramsForIngredient(ing.name, ing.quantity, ing.unit) : null;
    if (!label || grams === null) return { label, grams: null, lookup: false };
    if (!labels.includes(label)) {
      if (labels.length >= maxLookups) return { label, grams, lookup: false };
      labels.push(label);
    }
    return { label, grams, lookup: true };
  });
  return { lines, labels };
}
