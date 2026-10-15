// Copied from the old app (mobile/lib/grocery/categorize.ts).
import type { PantryCategory } from './categories';
import {
  CONDIMENT_PHRASES,
  DAIRY_PHRASES,
  DRY_GOODS_PHRASES,
  FILING_EXCEPTIONS,
  FROZEN_PHRASES,
  MEAT_PHRASES,
  PRODUCE_PHRASES,
  SPICE_PHRASES,
} from './categorizeWords';
import { filingWords, wordsIncludePhrase } from './filingWords';
import { normalizeIngredientName } from './ingredientNormalize';

// Word lists live in categorizeWords.ts. Every phrase matches whole words (filingWords.ts):
// "pepper" matches "peppers" but not "peppermint", "egg" matches "eggs" but not "eggplant".

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

/** A phrase list split into matching words once (phrases are normalised like names are). */
function compile(phrases: readonly string[]): string[][] {
  return phrases.map((phrase) => filingWords(normalizeIngredientName(phrase))).filter((w) => w.length > 0);
}

const DRY_GOODS = compile(DRY_GOODS_PHRASES);
const PRODUCE = compile(PRODUCE_PHRASES);
const MEATS = compile(MEAT_PHRASES);
const DAIRY = compile(DAIRY_PHRASES);
const FROZEN = compile(FROZEN_PHRASES);
const CONDIMENTS = compile(CONDIMENT_PHRASES);
const SPICES = compile(SPICE_PHRASES);
const EXCEPTIONS = FILING_EXCEPTIONS.map(
  ([phrase, category]) => [filingWords(normalizeIngredientName(phrase)), category] as const,
);

function matchesAnyPhrase(words: readonly string[], phrases: readonly string[][]): boolean {
  return phrases.some((phrase) => wordsIncludePhrase(words, phrase));
}

/** The category an exceptions-list phrase gives the name, or null. */
function exceptionCategory(words: readonly string[]): PantryCategory | null {
  for (const [phrase, category] of EXCEPTIONS) {
    if (wordsIncludePhrase(words, phrase)) return category;
  }
  return null;
}

// Peppers: "pepper" is on the spice list (the black pepper you grind), and spices are checked
// before produce, so every fresh pepper used to land in spices. These rules run first.

/** Dried or ground forms: stay spices ("black pepper", "red pepper flakes", "peppercorns"). */
const SPICE_PEPPER =
  /\b(black|white|pink|lemon|cayenne|sichuan|szechuan|ground|cracked|crushed|dried|powder(ed)?|flakes?|seasoning|salt|peppercorns?)\b/;

/** Words that make "... pepper(s)" a fresh pepper from the produce aisle. */
const FRESH_PEPPER_WORDS =
  /\b(bell|sweet|mini|baby|red|green|yellow|orange|purple|hot|chil(e|i|li)|jalape(n|ñ)os?|serranos?|poblanos?|habaneros?|anaheim|banana|shishito|padron|fresno|cubanelle|hatch|scotch|bonnet|thai|roasted|stuffed|fresh)\b/;

/** Fresh chiles often written without the word "pepper". */
const FRESH_CHILE_NAMES = /\b(jalape(n|ñ)os?|poblanos?|habaneros?|serranos?|shishitos?|anaheims?)\b/;

/**
 * Where a pepper-ish name goes, or null to let the normal lists decide.
 * "bell pepper", "jalapeño", "red peppers" → produce; "pepper jack" → dairy; "pepperoni" → meats;
 * "black pepper", "cayenne pepper", "red pepper flakes", plain "pepper" → spices.
 */
function pepperCategory(normalized: string, words: readonly string[]): PantryCategory | null {
  if (/\bpepper ?jack\b/.test(normalized)) return 'dairy';
  if (/\bpepperoni\b/.test(normalized)) return 'meats';
  const hasPepperWord = /\bpeppers?\b/.test(normalized);
  if (hasPepperWord) {
    if (SPICE_PEPPER.test(normalized)) return 'spices';
    if (FRESH_PEPPER_WORDS.test(normalized)) return 'produce';
    return null; // plain "pepper": the spice list files it
  }
  // "jalapeños", "poblano" — but not "serrano ham" or "jalapeño cheddar" (meat / dairy lists).
  if (FRESH_CHILE_NAMES.test(normalized) && !SPICE_PEPPER.test(normalized)) {
    if (matchesAnyPhrase(words, MEATS) || matchesAnyPhrase(words, DAIRY)) return null;
    return 'produce';
  }
  return null;
}

/**
 * Guess grocery aisle from item name (manual adds, imports, recipe gaps).
 * Prefer dry-goods phrases before produce so “rice” is not treated as produce. A short
 * exceptions list (categorizeWords.ts) settles names two lists would fight over.
 */
export function inferGroceryCategoryFromName(name: string): PantryCategory {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return 'dry_goods';
  if (isCookwareName(name)) return 'cookware';

  const words = filingWords(normalized);
  const exception = exceptionCategory(words);
  if (exception) return exception;

  if (matchesAnyPhrase(words, DRY_GOODS)) return 'dry_goods';
  const pepper = pepperCategory(normalized, words);
  if (pepper) return pepper;
  if (matchesAnyPhrase(words, SPICES)) return 'spices';
  if (matchesAnyPhrase(words, MEATS)) return 'meats';
  if (matchesAnyPhrase(words, DAIRY)) return 'dairy';
  if (matchesAnyPhrase(words, FROZEN)) return 'frozen';
  if (matchesAnyPhrase(words, CONDIMENTS)) return 'condiments';
  if (matchesAnyPhrase(words, PRODUCE)) return 'produce';

  return 'dry_goods';
}
