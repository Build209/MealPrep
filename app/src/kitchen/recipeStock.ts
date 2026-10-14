/**
 * How much of a recipe ingredient the pantry holds. Ported from the old app
 * (mobile/lib/recipeMatch/pantryStock.ts): the same name and id rules as recipe matching, and
 * quantities summed in the recipe's unit through the unit bridges. Pure.
 */
import { convertIngredientQuantity, ingredientUnitsConvertible } from './ingredientUnits';
import { expandSynonymKeys, fuzzyNameScore, FUZZY_MATCH_THRESHOLD, normalizeIngredientName } from './ingredientNormalize';
import { convertQuantity } from './unitConversion';

/** One ingredient line of a recipe, as the matcher reads it. */
export type RecipeIngredientLine = {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
};

/** The fields of a pantry row the matcher reads (data-layer PantryItem fits). */
export type StockRow = {
  id: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
};

const idAsName = (id: string) => id.replace(/-/g, ' ');

function pantryLookupKeys(item: StockRow): string[] {
  const keys = new Set<string>();
  keys.add(item.ingredientId);
  keys.add(normalizeIngredientName(idAsName(item.ingredientId)));
  for (const k of expandSynonymKeys(item.name)) keys.add(k);
  for (const k of expandSynonymKeys(idAsName(item.ingredientId))) keys.add(k);
  return [...keys];
}

function ingredientLookupKeys(ing: RecipeIngredientLine): string[] {
  const keys = new Set<string>();
  keys.add(ing.ingredientId);
  keys.add(normalizeIngredientName(idAsName(ing.ingredientId)));
  for (const k of expandSynonymKeys(ing.name)) keys.add(k);
  return [...keys];
}

function keysOverlap(ingKeys: string[], pantryKeys: string[]): boolean {
  const pantrySet = new Set(pantryKeys.filter(Boolean));
  return ingKeys.some((k) => !!k && pantrySet.has(k));
}

/** Egg, eggs, egg yolk(s), egg white(s): all come out of whole eggs. */
export function isEggComponentIngredient(name: string): boolean {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return false;
  if (normalized === 'egg' || normalized === 'eggs') return true;
  return /\begg\s+(yolk|yolks|white|whites)\b/.test(normalized);
}

export function isEggsPantryRow(item: Pick<StockRow, 'ingredientId' | 'name'>): boolean {
  if (item.ingredientId.startsWith('staple-eggs')) return true;
  const name = normalizeIngredientName(item.name);
  return name === 'eggs' || name === 'egg';
}

function pantryItemMatchesIngredient(item: StockRow, ingredient: RecipeIngredientLine): boolean {
  if (isEggComponentIngredient(ingredient.name) && isEggsPantryRow(item)) return true;
  if (item.ingredientId === ingredient.ingredientId) return true;
  if (keysOverlap(ingredientLookupKeys(ingredient), pantryLookupKeys(item))) return true;
  const fuzzy = Math.max(
    fuzzyNameScore(ingredient.name, item.name),
    fuzzyNameScore(ingredient.name, idAsName(item.ingredientId)),
    fuzzyNameScore(idAsName(ingredient.ingredientId), item.name),
  );
  return fuzzy >= FUZZY_MATCH_THRESHOLD;
}

/** Every pantry row that counts toward this ingredient. */
export function findPantryItemsForIngredient<T extends StockRow>(ingredient: RecipeIngredientLine, pantry: readonly T[]): T[] {
  return pantry.filter((item) => pantryItemMatchesIngredient(item, ingredient));
}

export function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Matching stock summed in `targetUnit`, or null when a row's unit can't be converted. */
export function totalPantryQuantityInUnit(items: readonly StockRow[], targetUnit: string, ingredientName?: string): number | null {
  if (items.length === 0) return 0;
  const name = ingredientName ?? items[0]?.name ?? '';
  let total = 0;
  for (const item of items) {
    const convertible = ingredientName
      ? ingredientUnitsConvertible(name, item.unit, targetUnit)
      : ingredientUnitsConvertible(item.name, item.unit, targetUnit);
    if (!convertible) return null;
    const converted = convertIngredientQuantity(item.quantity, item.unit, targetUnit, name || item.name);
    if (converted === null) {
      const fallback = convertQuantity(item.quantity, item.unit, targetUnit);
      if (fallback === null) return null;
      total += fallback;
    } else {
      total += converted;
    }
  }
  return roundQty(total);
}
