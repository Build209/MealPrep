/**
 * Filing a scanned item: which category and which storage place it gets on the review list.
 *
 * The pantry-vision function picks a category from a fixed list that includes "cookware" and
 * has no drinks or leftovers category, and the app used to save whatever it said. A phone test
 * found leftover stew filed as cookware and juice filed as dry goods. These rules correct the
 * model's answer where it is clearly wrong and otherwise leave it alone. No new category is
 * written: the live database is shared with the old app, which only knows the eight categories.
 *
 * - Cookware: kept only when the name really is cookware ("stock pot", "cast iron skillet");
 *   never for a dish ("pot roast", "leftover stew"). Scans list food only, so anything else the
 *   model calls cookware is re-guessed from its name.
 * - Leftovers and cooked dishes (stew, chili, soup, casserole...): the fridge, filed by their
 *   main ingredient (meats unless the name says vegetables). Canned or boxed soup stays in the
 *   pantry as dry goods.
 * - Juice and other drinks: never dry goods, cookware or spices; fruit juice is produce.
 *   Chilled juices (orange, "not from concentrate", fresh) and juice found in the fridge go to
 *   the fridge. Lemon and lime juice are condiments.
 *
 * Pure functions only (tests/kitchen-scan-filing.test.ts).
 */
import type { PantryCategory } from './categories';
import { inferGroceryCategoryFromName, isCookwareName } from './categorize';
import type { PantryStorageLocation } from './storage';

function clean(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------ leftovers

const PREPARED_DISH =
  /\b(leftovers?|stews?|chili|chilli|soups?|casseroles?|curry|curries|lasagna|lasagne|pot roast|meatloaf|stir[- ]?fry|fried rice|pot pie|gumbo|chowder|bisque|goulash|jambalaya|risotto|ragu|pasta bake|cooked)\b/;

/** Pantry products whose name contains a dish word: chili powder, soup mix, curry paste. */
const DISH_WORD_PRODUCT =
  /\b(chil(i|li) (powder|flakes?|sauce|oil|paste|peppers?|beans|seasoning|crisp)|(soup|stew|chili|curry|casserole|gumbo) (mix|base|seasoning|starter|paste|powder|cubes?)|curry (leaves|leaf)|soup bones?|ramen|bouillon)\b/;

/** Units and words that mean a shelf-stable package, not a container of leftovers. */
const SHELF_STABLE_UNITS = new Set(['can', 'cans', 'tin', 'tins', 'box', 'boxes', 'packet', 'packets', 'pouch', 'pouches', 'carton', 'cartons', 'envelope']);
const SHELF_STABLE_WORDS = /\b(canned|can of|tin of|condensed|instant|dry|dried|boxed|cup of noodles|shelf[- ]stable)\b/;

const MEAT_WORDS =
  /\b(beef|chicken|pork|turkey|lamb|sausage|ham|bacon|meat|meatballs?|steak|brisket|fish|salmon|shrimp|seafood|clam|crab|tuna|roast|meatloaf|chili|chilli|gumbo|jambalaya|goulash)\b/;
const VEGETABLE_WORDS = /\b(vegetables?|veggie|veg|vegan|vegetarian|minestrone|lentils?|tomato|beans?|squash|pumpkin|potato|mushroom|broccoli|carrot|pea)\b/;
const DAIRY_WORDS = /\b(cheese|cheesy|cream|creamy|alfredo|mac and cheese|macaroni and cheese)\b/;

/** Whether a name is a cooked dish or leftovers (not a dry product named after one). */
export function isPreparedDishName(name: string): boolean {
  const text = clean(name);
  if (!text) return false;
  if (/\bleftovers?\b/.test(text)) return true;
  if (DISH_WORD_PRODUCT.test(text)) return false;
  return PREPARED_DISH.test(text);
}

/** The category a cooked dish is filed under: its main ingredient, meats when unsure. */
export function categoryForPreparedDish(name: string): PantryCategory {
  const text = clean(name);
  if (MEAT_WORDS.test(text)) return 'meats';
  if (DAIRY_WORDS.test(text) && !VEGETABLE_WORDS.test(text)) return 'dairy';
  if (VEGETABLE_WORDS.test(text)) return 'produce';
  return 'meats';
}

function looksShelfStable(name: string, unit: string): boolean {
  return SHELF_STABLE_UNITS.has(unit.trim().toLowerCase()) || SHELF_STABLE_WORDS.test(clean(name));
}

// ---------------------------------------------------------------------- drinks

const JUICE = /\b(juices?|lemonade|limeade|orangeade|smoothies?|cider)\b/;
/** Bottled lemon and lime juice are cooking condiments, not drinks. */
const CONDIMENT_JUICE = /\b(lemon|lime|pickle|clam)\s+juice\b|\bvinegar\b/;
/** Juices that are sold and kept cold. */
const CHILLED_JUICE = /\b(orange|grapefruit|tangerine|fresh|freshly|squeezed|not from concentrate|cold[- ]pressed|refrigerated|green juice|smoothies?|cider)\b/;
const SHELF_STABLE_JUICE = /\b(juice box(es)?|shelf[- ]stable|concentrate|powder(ed)?|mix)\b/;
const OTHER_DRINKS = /\b(soda|cola|kombucha|iced tea|sweet tea|sparkling water|seltzer|sports drink|energy drink|cold brew|coconut water|beer|wine|hard seltzer)\b/;

/** Whether a name is fruit or vegetable juice (or lemonade, cider, smoothie) to drink. */
export function isJuiceName(name: string): boolean {
  const text = clean(name);
  return JUICE.test(text) && !CONDIMENT_JUICE.test(text);
}

/** Whether a name is a drink of any kind (juice, soda, kombucha...). */
export function isDrinkName(name: string): boolean {
  const text = clean(name);
  return isJuiceName(text) || OTHER_DRINKS.test(text);
}

// ---------------------------------------------------------------------- filing

export type ScanFilingInput = {
  name: string;
  unit: string;
  /** What the model said. */
  category: PantryCategory;
  /** What the model said, or null when it said nothing usable. */
  storage: PantryStorageLocation | null;
};

export type ScanFiling = { category: PantryCategory; storage: PantryStorageLocation };

/**
 * The category and place for a scanned item. `fallbackPlace` is where it goes when nothing else
 * decides: the place the photo was taken (shelf scans) or the pantry (receipts).
 * `photoPlace` is where a shelf photo was taken, or null for a receipt.
 */
export function fileScannedItem(
  item: ScanFilingInput,
  fallbackPlace: PantryStorageLocation,
  photoPlace: PantryStorageLocation | null = null,
): ScanFiling {
  const { name, unit } = item;
  const modelStorage = item.storage ?? fallbackPlace;

  // Leftovers and cooked dishes: the fridge, never cookware or a pantry shelf.
  if (
    isPreparedDishName(name) &&
    (/\bleftovers?\b/.test(clean(name)) || !looksShelfStable(name, unit)) &&
    (/\bleftovers?\b/.test(clean(name)) || item.category === 'cookware' || modelStorage === 'fridge' || photoPlace === 'fridge')
  ) {
    const keep = item.category === 'meats' || item.category === 'dairy' || item.category === 'produce' || item.category === 'frozen';
    return { category: keep ? item.category : categoryForPreparedDish(name), storage: 'fridge' };
  }

  // Juice: produce, not dry goods; chilled juice and juice found in the fridge go to the fridge.
  if (isJuiceName(name)) {
    const wrong = item.category === 'dry_goods' || item.category === 'cookware' || item.category === 'spices' || item.category === 'condiments';
    const category = wrong ? 'produce' : item.category;
    const text = clean(name);
    const chilled = (CHILLED_JUICE.test(text) && !SHELF_STABLE_JUICE.test(text)) || photoPlace === 'fridge';
    const storage = chilled ? 'fridge' : modelStorage === 'spice_rack' ? 'pantry' : modelStorage;
    return { category, storage };
  }

  // Cookware only when the name is cookware; otherwise guess the food's category from its name.
  if (item.category === 'cookware' && !isCookwareName(name)) {
    // A canned or boxed dish (beef stew, chicken soup) is a pantry dry good.
    const category = isPreparedDishName(name) ? 'dry_goods' : inferGroceryCategoryFromName(name);
    return { category, storage: modelStorage };
  }

  return { category: item.category, storage: modelStorage };
}
