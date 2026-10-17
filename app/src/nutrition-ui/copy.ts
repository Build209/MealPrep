/**
 * Words on the recipe nutrition card. Estimates only: no health claims, no diet advice, no
 * savings claims. The USDA line is the plain data credit and nothing more. NEW copy, not yet
 * through compliance.
 */
export const NUTRITION_COPY = {
  title: 'Nutrition per serving',
  lockedLine: 'See estimated calories, protein, carbs and fat for each serving with a paid plan.',
  upgrade: 'See plans',
  upgradeHint: 'Opens the plans screen.',
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  caloriesUnit: 'kcal',
  estimate: (used: number, total: number) => `Estimate based on ${used} of ${total} ingredients`,
  source: 'Source: USDA FoodData Central',
  checkLabel: 'Estimate only. Check the label and verify before you cook.',
  loading: 'Working out the estimate',
  offline: "You're offline. Nutrition shows up when you're back online.",
  error: "Couldn't get the estimate right now. Please try again later.",
  notEnoughData: 'Not enough data for this recipe',
  readyLabel: (calories: string, protein: string, carbs: string, fat: string) =>
    `Per serving, about ${calories} kilocalories, ${protein} protein, ${carbs} carbs, ${fat} fat`,
} as const;
