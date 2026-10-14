/**
 * Wording and small pure helpers for the Home feed and the recipe detail screen.
 * Tested in tests/recipe-feed-logic.test.ts.
 */
import { formatIngredientText, formatQuantityWithUnit } from '../kitchen/formatQuantity';
import type { IngredientStatusLine } from '../kitchen/recipeMatch';

export const FEED_COPY = {
  title: 'Home',
  cookTitle: 'Cook from your pantry',
  cookIntro: 'Recipes that use what you already have, best match first.',
  partialIntro: 'Nothing uses two of your pantry items yet. These use at least one.',
  emptyPantryTitle: 'Your pantry is empty',
  emptyPantryBody: 'Add food to your pantry (or scan a shelf) and the recipes you can cook show up here.',
  goToPantry: 'Go to Pantry',
  noMatches: 'No recipe uses what is in your pantry yet. The recipes below show what to buy.',
  moreTitle: 'More recipes',
  moreHidden: (n: number) => (n === 1 ? '1 more recipe. Search to find it.' : `${n} more recipes. Search to find them.`),
  noRecipes: 'No recipes yet.',
  loading: 'Loading recipes',
  loadError: "Couldn't load recipes.",
  retry: 'Try again',
  searchLink: 'Search recipes',
  savedLink: 'Saved',
  importLink: 'Import a recipe',
} as const;

export const DETAIL_COPY = {
  back: 'Back',
  loading: 'Loading recipe',
  loadError: "Couldn't load this recipe.",
  notFoundTitle: 'Recipe not found',
  goHome: 'Go to Home',
  ingredients: 'Ingredients',
  steps: 'Steps',
  noIngredients: 'No ingredients listed.',
  noSteps: 'No steps listed.',
  mealPlanaticRecipe: 'MealPlanatic recipe',
  by: (name: string) => `By ${name}`,
  viewOriginal: 'View original',
  have: 'You have it',
  missing: 'Missing',
  short: (need: string) => `Need ${need} more`,
  staple: 'Pantry staple',
  addMissing: (n: number) => (n === 1 ? 'Add 1 missing to grocery list' : `Add ${n} missing to grocery list`),
  adding: 'Adding...',
  onList: 'Missing items are on your grocery list',
  added: (n: number) => (n === 1 ? 'Added 1 item to your grocery list.' : `Added ${n} items to your grocery list.`),
  alreadyOnList: 'Already on your grocery list.',
  addFailed: (message: string) => `Not added. ${message}`,
  seeList: 'See grocery list',
  allHave: 'You have everything for this recipe.',
  /** Compliance rule 9 wording; the old detail sheet showed "Check labels — estimate only" with diet notes. */
  checkLabels: 'Check labels for allergens. Ingredient matches are an estimate: verify before you cook.',
} as const;

/** "2 lb" style amount, or '' when the line has no amount. */
export function amountText(quantity: number, unit: string): string {
  return quantity > 0 ? formatQuantityWithUnit(quantity, unit) : '';
}

/** One ingredient row on the detail screen: name, amount and its status words. */
export function ingredientRowText(line: IngredientStatusLine): { name: string; amount: string; status: string } {
  const name = formatIngredientText(line.ingredient.name);
  const amount = amountText(line.ingredient.quantity, line.ingredient.unit);
  if (line.status === 'have') return { name, amount, status: DETAIL_COPY.have };
  if (line.status === 'staple') return { name, amount, status: DETAIL_COPY.staple };
  if (line.short) return { name, amount, status: DETAIL_COPY.short(amountText(line.need, line.ingredient.unit) || String(line.need)) };
  return { name, amount, status: DETAIL_COPY.missing };
}

/** What adding missing items did, in words. */
export function addMissingMessage(result: { added: number; merged: number; unchanged: number }): string {
  const changed = result.added + result.merged;
  return changed > 0 ? DETAIL_COPY.added(changed) : DETAIL_COPY.alreadyOnList;
}
