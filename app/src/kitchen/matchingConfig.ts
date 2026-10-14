/**
 * Central config for pantry ↔ recipe ingredient matching (typed, plain-language defaults).
 */

/** Pantry staples treated as always available — excluded from match counts. */
export const PANTRY_STAPLES = [
  'salt',
  'pepper',
  'black pepper',
  'white pepper',
  'water',
  'oil',
  'olive oil',
  'vegetable oil',
  'cooking oil',
] as const;

export type PantryStaple = (typeof PANTRY_STAPLES)[number];

/**
 * Equivalent names at the same specificity (not generic ↔ specific).
 * Keys are canonical phrases after normalization.
 */
export const INGREDIENT_SYNONYMS: Record<string, readonly string[]> = {
  'green onion': ['scallion', 'scallions', 'spring onion', 'spring onions'],
  'peanut butter': ['skippy peanut butter', 'jif peanut butter', 'creamy peanut butter'],
  'ranch dressing': ['kraft ranch', 'ranch', 'ranch drizzle'],
  broccoli: ['broccoli florets', 'broccoli crowns', 'broccoli crown'],
  'jasmine rice': ['jasmine rice bag'],
  rice: ['white rice', 'steamed rice'],
  'chicken breast': ['boneless chicken breast', 'chicken breasts', 'skinless chicken breast'],
  'chicken thigh': ['chicken thighs', 'boneless chicken thigh'],
  'ground beef': ['hamburger', 'hamburger meat', 'lean ground beef', 'ground chuck'],
  'cheddar cheese': ['cheddar', 'shredded cheddar', 'shredded cheddar cheese'],
  lime: ['limes'],
  lemon: ['lemons', 'lemons bag'],
  'green beans': ['string beans', 'snap beans'],
  'sweet potato': ['sweet potatoes', 'yams'],
  onion: ['yellow onion', 'sweet onion'],
  garlic: ['garlic bulb'],
  'bell pepper': ['bell peppers', 'bell peppers tri-color', 'red bell pepper', 'green bell pepper'],
  penne: ['penne pasta', 'pasta penne'],
  pasta: ['dried pasta'],
  'marinara sauce': ['marinara', 'tomato sauce jar'],
  'black beans': ['black beans canned', 'canned black beans', 'canned beans'],
  'tomato sauce': ['marinara sauce', 'marinara', 'tomato sauce jar'],
  tortilla: ['tortillas', 'flour tortillas', 'corn tortillas'],
  egg: ['eggs', 'large eggs'],
  milk: ['whole milk', '2% milk', 'skim milk'],
  yogurt: ['greek yogurt', 'plain greek yogurt'],
  lettuce: ['romaine', 'romaine lettuce'],
  cilantro: ['cilantro bunch', 'coriander', 'coriander leaves', 'fresh coriander'],
  broth: ['chicken broth', 'beef broth', 'vegetable broth'],
};

export type IngredientCanonical = keyof typeof INGREDIENT_SYNONYMS;

/**
 * Generic family heads — only used when a recipe asks for the family alone (e.g. "cheese").
 * Specific types (cheddar, mozzarella) do not match each other through this map.
 */
export const INGREDIENT_CATEGORY_GROUPS: Record<string, readonly string[]> = {
  cheese: [
    'cheese',
    'cheddar',
    'mozzarella',
    'parmesan',
    'feta',
    'gouda',
    'provolone',
    'swiss',
    'colby',
    'jack',
    'queso',
  ],
  pasta: ['pasta', 'penne', 'spaghetti', 'rigatoni', 'fettuccine', 'macaroni', 'noodles'],
  tomato: ['tomato', 'marinara', 'salsa'],
};

export type IngredientCategory = keyof typeof INGREDIENT_CATEGORY_GROUPS;

/** Cuts and forms — a recipe that specifies these cannot be satisfied by a generic pantry item. */
export const INGREDIENT_CUT_OR_FORM_MODIFIERS = [
  'breast',
  'thigh',
  'drumstick',
  'wing',
  'ground',
  'sirloin',
  'steak',
  'chuck',
  'ribeye',
  'tenderloin',
  'brisket',
  'shank',
  'stew',
  'carnitas',
  'strip',
] as const;

/** Prep/packaging words removed — never remove cut, form, or variety (breast, ground, cheddar, penne). */
export const INGREDIENT_STRIP_TOKENS = [
  'skippy',
  'jif',
  'kraft',
  'heinz',
  'great',
  'value',
  'organic',
  'fresh',
  'frozen',
  'raw',
  'cooked',
  'shredded',
  'large',
  'small',
  'medium',
  'extra',
  'virgin',
  'smoked',
  'lean',
  'boneless',
  'skinless',
  'creamy',
  'crunchy',
  'unsalted',
  'salted',
  'each',
  'oz',
  'lb',
  'lbs',
  'g',
  'kg',
  'ml',
  'l',
  'cup',
  'cups',
  'tbsp',
  'tsp',
  'can',
  'canned',
  'jar',
  'pack',
  'bag',
  'bottle',
  'bunch',
  'head',
  'bulb',
  'crowns',
  'crown',
  'tri',
  'color',
  'ct',
  'count',
  'dozen',
  'gallon',
  'plain',
  'percent',
  'grinder',
  'tablespoon',
  'tablespoons',
  'teaspoon',
  'teaspoons',
  'divided',
  'taste',
  'optional',
  'garnish',
  'room',
  'temperature',
] as const;

/** Prep words stripped only when leading a phrase (recipe lines), not pantry product names. */
export const INGREDIENT_LEADING_PREP_WORDS = [
  'diced',
  'minced',
  'chopped',
  'sliced',
  'softened',
  'melted',
  'finely',
  'roughly',
  'thinly',
  'peeled',
  'seeded',
  'cored',
  'trimmed',
  'halved',
  'quartered',
  'crushed',
  'grated',
  'zested',
  'juiced',
  'warm',
  'cold',
  'hot',
  'boiling',
] as const;

/** Score for same protein family but wrong cut/form — below FUZZY_MATCH_THRESHOLD. */
export const INGREDIENT_SUBSTITUTE_MATCH_SCORE = 0.68;

/** Minimum fuzzy score (0–1) to count as a full pantry ingredient match. */
export const FUZZY_MATCH_THRESHOLD = 0.72;

