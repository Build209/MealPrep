// Copied from the old app (mobile/lib/grocery/categorize.ts).
import type { PantryCategory } from './categories';
import { normalizeIngredientName } from './ingredientNormalize';

/** Pantry staples / dry goods — checked before produce heuristics. */
const DRY_GOODS_PHRASES = [
  'all purpose flour',
  'all-purpose flour',
  'bread flour',
  'cake flour',
  'whole wheat flour',
  'brown rice',
  'white rice',
  'jasmine rice',
  'basmati rice',
  'wild rice',
  'rice',
  'pasta',
  'spaghetti',
  'penne',
  'macaroni',
  'noodles',
  'ramen',
  'couscous',
  'quinoa',
  'oats',
  'rolled oats',
  'steel cut oats',
  'oatmeal',
  'flour',
  'sugar',
  'brown sugar',
  'powdered sugar',
  'baking soda',
  'baking powder',
  'cornstarch',
  'corn starch',
  'beans',
  'black beans',
  'pinto beans',
  'kidney beans',
  'chickpeas',
  'garbanzo beans',
  'lentils',
  'canned beans',
  'dry beans',
  'bread crumbs',
  'breadcrumbs',
  'crackers',
  'cereal',
  'granola',
  'tortilla chips',
  'chips',
  'popcorn',
  'peanut butter',
  'jam',
  'jelly',
  'honey',
  'maple syrup',
  'canned tomatoes',
  'tomato paste',
  'tomato sauce',
  'coconut milk',
  'broth',
  'stock',
  'bouillon',
];

const PRODUCE_PHRASES = [
  'apple',
  'banana',
  'orange',
  'lemon',
  'lime',
  'lettuce',
  'spinach',
  'kale',
  'broccoli',
  'carrot',
  'celery',
  'onion',
  'garlic',
  'potato',
  'tomato',
  'cucumber',
  'pepper',
  'bell pepper',
  'zucchini',
  'squash',
  'avocado',
  'berries',
  'strawberry',
  'blueberry',
  'grape',
  'mushroom',
  'cilantro',
  'parsley',
  'basil',
  'ginger root',
];

const MEAT_PHRASES = [
  'chicken',
  'beef',
  'pork',
  'turkey',
  'bacon',
  'sausage',
  'ham',
  'steak',
  'ground beef',
  'ground turkey',
  'fish',
  'salmon',
  'shrimp',
];

const DAIRY_PHRASES = [
  'milk',
  'cheese',
  'butter',
  'yogurt',
  'cream',
  'sour cream',
  'cottage cheese',
  'half and half',
];

const FROZEN_PHRASES = ['frozen'];

const CONDIMENT_PHRASES = [
  'ketchup',
  'mustard',
  'mayonnaise',
  'mayo',
  'soy sauce',
  'hot sauce',
  'salsa',
  'vinegar',
  'olive oil',
  'vegetable oil',
  'cooking oil',
  'salad dressing',
];

const SPICE_PHRASES = [
  'salt',
  'pepper',
  'cumin',
  'paprika',
  'oregano',
  'thyme',
  'cinnamon',
  'chili powder',
  'garlic powder',
  'onion powder',
  'seasoning',
];

function nameIncludesPhrase(normalized: string, phrase: string): boolean {
  const p = normalizeIngredientName(phrase);
  if (!p) return false;
  if (normalized === p) return true;
  return normalized.includes(p);
}

function matchesAnyPhrase(normalized: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => nameIncludesPhrase(normalized, phrase));
}

/**
 * Guess grocery aisle from item name (manual adds, imports, recipe gaps).
 * Prefer dry-goods phrases before produce so “rice” is not treated as produce.
 */
export function inferGroceryCategoryFromName(name: string): PantryCategory {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return 'dry_goods';

  if (matchesAnyPhrase(normalized, DRY_GOODS_PHRASES)) return 'dry_goods';
  if (matchesAnyPhrase(normalized, SPICE_PHRASES)) return 'spices';
  if (matchesAnyPhrase(normalized, MEAT_PHRASES)) return 'meats';
  if (matchesAnyPhrase(normalized, DAIRY_PHRASES)) return 'dairy';
  if (matchesAnyPhrase(normalized, FROZEN_PHRASES)) return 'frozen';
  if (matchesAnyPhrase(normalized, CONDIMENT_PHRASES)) return 'condiments';
  if (matchesAnyPhrase(normalized, PRODUCE_PHRASES)) return 'produce';

  return 'dry_goods';
}
