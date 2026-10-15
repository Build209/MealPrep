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

// Cookware: added in the rebuild (the old app never guessed it from a name).


/** A word that makes a name a piece of cookware. */
const COOKWARE_HEADS = new Set([
  'pot', 'pots', 'pan', 'pans', 'skillet', 'skillets', 'saucepan', 'saucepans', 'wok', 'woks',
  'oven', 'griddle', 'kettle', 'colander', 'cooker', 'sheet', 'sheets', 'dish', 'dishes',
  'cookware', 'lid', 'lids', 'crockpot', 'tray', 'trays', 'ramekin', 'ramekins', 'stockpot',
  'tin', 'tins', 'mold', 'mould', 'strainer', 'spatula', 'whisk', 'ladle', 'tongs',
]);

/** Words that can sit next to a cookware word without making it food. */
const COOKWARE_WORDS = new Set([
  ...COOKWARE_HEADS,
  'stock', 'sauce', 'frying', 'fry', 'baking', 'bake', 'roasting', 'saute', 'casserole', 'pie',
  'loaf', 'muffin', 'cake', 'sheet', 'cast', 'iron', 'nonstick', 'non-stick', 'non', 'stick',
  'stainless', 'steel', 'copper', 'ceramic', 'enamel', 'enameled', 'glass', 'dutch', 'pressure',
  'slow', 'instant', 'rice', 'large', 'small', 'medium', 'big', 'inch', 'in', 'quart', 'qt',
  'set', 'with', 'and', 'a', 'of', 'deep', 'shallow', 'round', 'square', 'oval', 'grill',
  'soup', 'sheetpan', 'springform', 'bundt', 'tart', 'pizza', 'roaster',
]);

/**
 * Whether a name is a piece of cookware: every word is a cookware word and at least one is a
 * cookware noun. "stock pot" and "9x13 baking dish" are; "pot roast", "pan dulce", "pancake
 * mix", "pizza" and "casserole" are not.
 */
export function isCookwareName(name: string): boolean {
  const words = cleanForCookware(name)
    .split(' ')
    .filter((w) => w && !/^\d+(x\d+)?$/.test(w));
  if (words.length === 0) return false;
  if (!words.some((w) => COOKWARE_HEADS.has(w))) return false;
  // A dish named after its pan ("pot roast", "pot pie", "sheet cake", "pan pizza") is food.
  const joined = words.join(' ');
  if (/\b(pie|cake|pizza|roast|stickers?|dulce|meal|dinner|lasagna|cornbread|fried|seared)$/.test(joined)) {
    return false;
  }
  return words.every((w) => COOKWARE_WORDS.has(w));
}

function cleanForCookware(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  if (isCookwareName(name)) return 'cookware';

  if (matchesAnyPhrase(normalized, DRY_GOODS_PHRASES)) return 'dry_goods';
  if (matchesAnyPhrase(normalized, SPICE_PHRASES)) return 'spices';
  if (matchesAnyPhrase(normalized, MEAT_PHRASES)) return 'meats';
  if (matchesAnyPhrase(normalized, DAIRY_PHRASES)) return 'dairy';
  if (matchesAnyPhrase(normalized, FROZEN_PHRASES)) return 'frozen';
  if (matchesAnyPhrase(normalized, CONDIMENT_PHRASES)) return 'condiments';
  if (matchesAnyPhrase(normalized, PRODUCE_PHRASES)) return 'produce';

  return 'dry_goods';
}
