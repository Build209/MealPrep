/** Display rounding for the nutrition card. Pure, no imports, unit-tested (tests/nutrition-format.test.ts). */

function clean(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Calories to the nearest 5, never negative: 212 -> "210", 213 -> "215". */
export function formatCalories(kcal: number): string {
  return String(Math.round(clean(kcal) / 5) * 5);
}

/** Grams as a whole number: 12.4 -> "12 g". */
export function formatGrams(grams: number): string {
  return `${Math.round(clean(grams))} g`;
}

/** Whole-number counts, clamped so "used" never reads higher than "total". */
export function ingredientCounts(used: number, total: number): { used: number; total: number } {
  const t = Math.floor(clean(total));
  const u = Math.min(t, Math.floor(clean(used)));
  return { used: u, total: t };
}
