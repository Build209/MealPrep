/**
 * Wording and small pure helpers for the Recipes tab feed and the recipe detail screen.
 * Tested in tests/recipe-feed-logic.test.ts.
 */
import { formatIngredientText, formatQuantityWithUnit } from '../kitchen/formatQuantity';
import type { CartStatusLine } from '../kitchen/recipeCart';

export const FEED_COPY = {
  title: 'Recipes',
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
  creatorsTitle: 'From recipe creators',
  creatorsSeeAll: 'See all creator videos',
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
  /** One status per ingredient row. Pantry and cart are always worded apart. */
  have: 'In pantry',
  inCart: 'In cart',
  missing: 'Missing',
  short: (need: string) => `Need ${need} more`,
  /** The pantry and the grocery list together still fall short. */
  shortWithCart: (need: string) => `Need ${need} more (some in cart)`,
  /** "0 items needed" counts only what neither the pantry nor the cart covers. */
  itemsNeeded: (n: number) => (n === 1 ? '1 item needed' : `${n} items needed`),
  breakdown: (pantry: number, cart: number) => `${pantry} in pantry · ${cart} in cart`,
  staple: 'Pantry staple',
  addMissing: (n: number) => (n === 1 ? 'Add 1 missing to grocery list' : `Add ${n} missing to grocery list`),
  adding: 'Adding...',
  onList: 'Missing items are on your grocery list',
  cartHint: 'In cart means it is on your grocery list. It is not in your pantry until you tick it off.',
  added: (n: number) => (n === 1 ? 'Added 1 item to your grocery list.' : `Added ${n} items to your grocery list.`),
  alreadyOnList: 'Already in your cart. Nothing added.',
  addedSomeInCart: (added: number, inCart: number) =>
    `${added === 1 ? 'Added 1 item to your grocery list.' : `Added ${added} items to your grocery list.`} ${inCart === 1 ? '1 was already in your cart.' : `${inCart} were already in your cart.`}`,
  addFailed: (message: string) => `Not added. ${message}`,
  seeList: 'See grocery list',
  /** The per-row control that saves an ingredient straight to the pantry. */
  addToPantry: 'Add to pantry',
  addingToPantry: 'Adding...',
  addToPantryLabel: (name: string) => `Add ${name} to pantry`,
  addedToPantry: (name: string) => `Added ${name} to your pantry.`,
  addToPantryFailed: (name: string, message: string) => `${name} was not added to your pantry. ${message}`,
  allHave: 'You have everything for this recipe.',
  /** Compliance rule 9 wording; the old detail sheet showed "Check labels — estimate only" with diet notes. */
  checkLabels: 'Check labels for allergens. Ingredient matches are an estimate: verify before you cook.',
} as const;

/** "2 lb" style amount, or '' when the line has no amount. */
export function amountText(quantity: number, unit: string): string {
  return quantity > 0 ? formatQuantityWithUnit(quantity, unit) : '';
}

/** One ingredient row on the detail screen: name, amount and its status words. */
export function ingredientRowText(
  line: CartStatusLine,
  /** A staple the pantry holds a row for reads In pantry (pantryAdd.stapleHeldInPantry). */
  heldInPantry = false,
): { name: string; amount: string; status: string } {
  const name = formatIngredientText(line.ingredient.name);
  const amount = amountText(line.ingredient.quantity, line.ingredient.unit);
  if (line.status === 'staple' && heldInPantry) return { name, amount, status: DETAIL_COPY.have };
  if (line.status === 'have') return { name, amount, status: DETAIL_COPY.have };
  if (line.status === 'cart') return { name, amount, status: DETAIL_COPY.inCart };
  if (line.status === 'staple') return { name, amount, status: DETAIL_COPY.staple };
  if (line.short && line.someInCart) {
    return { name, amount, status: DETAIL_COPY.shortWithCart(amountText(line.need, line.ingredient.unit) || String(line.need)) };
  }
  if (line.short) return { name, amount, status: DETAIL_COPY.short(amountText(line.need, line.ingredient.unit) || String(line.need)) };
  return { name, amount, status: DETAIL_COPY.missing };
}

/** What adding missing items did, in words: what was added, and what was already in the cart. */
export function addMissingMessage(result: { added: number; merged: number; unchanged: number }): string {
  const changed = result.added + result.merged;
  if (changed > 0 && result.unchanged > 0) return DETAIL_COPY.addedSomeInCart(changed, result.unchanged);
  return changed > 0 ? DETAIL_COPY.added(changed) : DETAIL_COPY.alreadyOnList;
}
