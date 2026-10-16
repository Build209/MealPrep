/**
 * Per-serving totals from per-100 g facts. Pure (tests/nutrition-math.test.ts).
 */
import type { NutritionTotals, RecipeNutrition } from './types';
import type { Per100g } from './usdaParse';

/** One recipe ingredient: grams null when it could not be converted, per100g null when USDA had no usable match. */
export type ResolvedLine = { grams: number | null; per100g: Per100g | null };

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundKcal = (n: number) => Math.round(n / 5) * 5;

/**
 * A line counts as used only when its grams and facts are both known. Fewer than half of
 * totalIngredients used is 'not-enough-data'. servings null, 0 or negative counts as 1.
 */
export function computeRecipeNutrition(
  lines: ReadonlyArray<ResolvedLine>,
  servings: number | null | undefined,
  totalIngredients: number = lines.length,
): RecipeNutrition {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let used = 0;
  for (const line of lines) {
    if (line.grams === null || line.per100g === null || !(line.grams > 0)) continue;
    const f = line.grams / 100;
    kcal += line.per100g.kcal * f;
    protein += line.per100g.proteinG * f;
    carbs += line.per100g.carbsG * f;
    fat += line.per100g.fatG * f;
    used += 1;
  }
  if (used === 0 || used * 2 < totalIngredients) {
    return { status: 'not-enough-data', usedIngredients: used, totalIngredients };
  }
  const s = typeof servings === 'number' && Number.isFinite(servings) && servings > 0 ? servings : 1;
  const perServing: NutritionTotals = {
    calories: roundKcal(kcal / s),
    proteinG: round1(protein / s),
    carbsG: round1(carbs / s),
    fatG: round1(fat / s),
  };
  return { status: 'ready', perServing, usedIngredients: used, totalIngredients };
}
