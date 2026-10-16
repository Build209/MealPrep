export type NutritionTotals = { calories: number; proteinG: number; carbsG: number; fatG: number };

export type RecipeNutrition =
  | { status: 'ready'; perServing: NutritionTotals; usedIngredients: number; totalIngredients: number }
  | { status: 'not-enough-data'; usedIngredients: number; totalIngredients: number };
