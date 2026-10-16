/**
 * Unit bridges for single ingredients (garlic heads to cloves, dry rice pounds to cups, butter
 * sticks, onions to chopped cups, egg and carrot sizes). Copied from the old app
 * (mobile/lib/units/ingredientUnitBridge.ts); same numbers and rules. Pure.
 */
import { filingWords, textHasPhrase } from './filingWords';
import { normalizeIngredientName } from './ingredientNormalize';
import { convertQuantity, normalizeUnit, unitKind, unitsAreConvertible } from './unitConversion';

const CLOVES_PER_GARLIC_HEAD = 10;
const CUPS_CHOPPED_PER_MEDIUM_ONION = 1;
const DRY_RICE_CUPS_PER_LB = 2.5;
const TBSP_PER_STICK = 8;
const STICKS_PER_LB_BUTTER = 4;

const EGG_SIZE_UNITS = new Set(['large', 'medium', 'small', 'extra large', 'extra-large', 'xl']);
const CARROT_SIZE_UNITS = new Set(['large', 'medium', 'small']);
const GARLIC_UNITS = new Set(['head', 'heads', 'clove', 'cloves', 'each']);
const BUTTER_UNITS = new Set([
  'lb', 'lbs', 'pound', 'pounds', 'oz', 'ounce', 'ounces', 'tbsp', 'tablespoon', 'tablespoons', 'cup', 'cups', 'stick', 'sticks',
]);

/** "... butter" names that are not butter (no stick / pound bridge). */
const NOT_DAIRY_BUTTER = ['peanut', 'almond', 'cashew', 'sunflower', 'nut', 'apple', 'cookie', 'cocoa', 'shea', 'butter bean', 'butter lettuce'];

const key = (name: string) => normalizeIngredientName(name);
const isCup = (u: string) => u === 'cup' || u === 'cups';
const isClove = (u: string) => u === 'clove' || u === 'cloves';
const isHead = (u: string) => u === 'head' || u === 'heads';

function isEggIngredient(name: string): boolean {
  const k = key(name);
  // The name ends in the word egg(s): "large eggs" yes, "roasted eggplant" and "egg noodles" no.
  const words = filingWords(k);
  return words[words.length - 1] === 'egg';
}

function isOnionIngredient(name: string): boolean {
  const k = key(name);
  return filingWords(k).includes('onion') && !textHasPhrase(k, 'green onion') && !k.includes('scallion');
}

function isGarlicIngredient(name: string): boolean {
  const k = key(name);
  return k === 'garlic' || k.startsWith('garlic ');
}

function isButterIngredient(name: string): boolean {
  const k = key(name);
  // The word "butter", not "buttermilk" or "butternut squash", and not a nut or fruit butter.
  if (!filingWords(k).includes('butter')) return false;
  return !NOT_DAIRY_BUTTER.some((phrase) => textHasPhrase(k, phrase));
}

function isRiceIngredient(name: string): boolean {
  const k = key(name);
  return k === 'rice' || k.endsWith(' rice') || k.includes('jasmine') || k.includes('basmati');
}

function isCarrotIngredient(name: string): boolean {
  const k = key(name);
  return k === 'carrot' || k === 'carrots' || k.startsWith('carrot ');
}

function normalizeCountishUnit(unit: string): string {
  const u = normalizeUnit(unit);
  if (EGG_SIZE_UNITS.has(u) || CARROT_SIZE_UNITS.has(u)) return 'each';
  return u;
}

function butterLbToUnit(quantityLb: number, toUnit: string): number | null {
  const to = normalizeUnit(toUnit);
  if (to === 'lb' || to === 'lbs' || to === 'pound' || to === 'pounds') return quantityLb;
  if (to === 'stick' || to === 'sticks') return quantityLb * STICKS_PER_LB_BUTTER;
  if (to === 'tbsp' || to === 'tablespoon' || to === 'tablespoons') return quantityLb * STICKS_PER_LB_BUTTER * TBSP_PER_STICK;
  if (isCup(to)) return convertQuantity(quantityLb * STICKS_PER_LB_BUTTER * TBSP_PER_STICK, 'tbsp', 'cup');
  if (to === 'oz' || to === 'ounce' || to === 'ounces') return convertQuantity(quantityLb, 'lb', 'oz');
  return null;
}

function butterFromUnitToLb(quantity: number, fromUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  if (from === 'lb' || from === 'lbs' || from === 'pound' || from === 'pounds') return quantity;
  if (from === 'stick' || from === 'sticks') return quantity / STICKS_PER_LB_BUTTER;
  if (from === 'tbsp' || from === 'tablespoon' || from === 'tablespoons') return quantity / TBSP_PER_STICK / STICKS_PER_LB_BUTTER;
  if (isCup(from)) {
    const tbsp = convertQuantity(quantity, 'cup', 'tbsp');
    return tbsp === null ? null : butterFromUnitToLb(tbsp, 'tbsp');
  }
  if (from === 'oz' || from === 'ounce' || from === 'ounces') return convertQuantity(quantity, 'oz', 'lb');
  return null;
}

export function ingredientUnitsConvertible(ingredientName: string, unitA: string, unitB: string): boolean {
  const a = normalizeCountishUnit(unitA);
  const b = normalizeCountishUnit(unitB);
  if (unitsAreConvertible(a, b)) return true;

  const name = ingredientName;
  if (isEggIngredient(name) && (EGG_SIZE_UNITS.has(normalizeUnit(unitA)) || EGG_SIZE_UNITS.has(normalizeUnit(unitB)))) {
    return true;
  }
  if (isCarrotIngredient(name) && (CARROT_SIZE_UNITS.has(normalizeUnit(unitA)) || CARROT_SIZE_UNITS.has(normalizeUnit(unitB)))) {
    return true;
  }
  if (isOnionIngredient(name) && isCup(a) !== isCup(b)) {
    if (a === 'each' || b === 'each' || isCup(a) || isCup(b)) return true;
  }
  if (isGarlicIngredient(name) && GARLIC_UNITS.has(a) && GARLIC_UNITS.has(b)) return true;
  if (isButterIngredient(name) && BUTTER_UNITS.has(a) && BUTTER_UNITS.has(b)) return true;
  if (isRiceIngredient(name)) {
    const mass = unitKind(a) === 'mass' || unitKind(b) === 'mass';
    const volume = unitKind(a) === 'volume' || unitKind(b) === 'volume';
    if (mass && volume) return true;
  }
  return false;
}

export function convertIngredientQuantity(quantity: number, fromUnit: string, toUnit: string, ingredientName: string): number | null {
  const from = normalizeCountishUnit(fromUnit);
  const to = normalizeCountishUnit(toUnit);

  const direct = convertQuantity(quantity, from, to);
  if (direct !== null) return direct;

  const name = ingredientName;
  if (isEggIngredient(name)) return convertQuantity(quantity, from, to);
  if (isCarrotIngredient(name) && (CARROT_SIZE_UNITS.has(normalizeUnit(fromUnit)) || CARROT_SIZE_UNITS.has(normalizeUnit(toUnit)))) {
    return convertQuantity(quantity, from, to);
  }

  if (isOnionIngredient(name)) {
    if (isCup(from) && to === 'each') return quantity / CUPS_CHOPPED_PER_MEDIUM_ONION;
    if (from === 'each' && isCup(to)) return quantity * CUPS_CHOPPED_PER_MEDIUM_ONION;
  }

  if (isGarlicIngredient(name)) {
    if (isClove(from) && isHead(to)) return quantity / CLOVES_PER_GARLIC_HEAD;
    if (isHead(from) && isClove(to)) return quantity * CLOVES_PER_GARLIC_HEAD;
    if (isClove(from) && to === 'each') return quantity;
    if (from === 'each' && isClove(to)) return quantity;
  }

  if (isButterIngredient(name)) {
    const lb = butterFromUnitToLb(quantity, from);
    return lb === null ? null : butterLbToUnit(lb, to);
  }

  if (isRiceIngredient(name)) {
    if (unitKind(from) === 'mass' && unitKind(to) === 'volume') {
      const lb = convertQuantity(quantity, from, 'lb');
      return lb === null ? null : lb * DRY_RICE_CUPS_PER_LB;
    }
    if (unitKind(from) === 'volume' && unitKind(to) === 'mass') {
      const cups = convertQuantity(quantity, from, 'cup');
      return cups === null ? null : convertQuantity(cups / DRY_RICE_CUPS_PER_LB, 'lb', to);
    }
  }

  return null;
}
