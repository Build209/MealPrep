// Copied from the old app (mobile/lib/formatQuantity.ts). Display only.
const WHOLE_TOLERANCE = 0.04;
const PINCH_THRESHOLD = 1 / 16;

/** Common recipe fractions (nearest-distance snapping for display). */
const COOKING_FRACTIONS: ReadonlyArray<{ value: number; char: string }> = [
  { value: 1 / 8, char: '⅛' },
  { value: 1 / 4, char: '¼' },
  { value: 1 / 3, char: '⅓' },
  { value: 1 / 2, char: '½' },
  { value: 2 / 3, char: '⅔' },
  { value: 3 / 4, char: '¾' },
];

const CURRENCY_SYMBOLS = '$£€¥₹¢';

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.$/, '');
}

function isMetricWholeUnit(unit: string): boolean {
  const u = normalizeUnit(unit);
  return /^(g|gram|grams|mg|milligram|milligrams|ml|milliliter|milliliters|l|liter|liters)$/.test(u);
}

function isMetricKgUnit(unit: string): boolean {
  const u = normalizeUnit(unit);
  return /^(kg|kilogram|kilograms)$/.test(u);
}

function formatMetricKg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const nearestWhole = Math.round(rounded);
  if (Math.abs(rounded - nearestWhole) <= WHOLE_TOLERANCE) {
    return String(nearestWhole);
  }
  return String(rounded);
}

function shouldUseWholeNumberDisplay(value: number, unit?: string): boolean {
  const trimmed = unit?.trim();
  if (!trimmed) {
    return Math.abs(value) >= 10;
  }
  return isMetricWholeUnit(trimmed);
}

function nearestFractionChar(remainder: number): string | null {
  let bestChar: string | null = null;
  let bestDist = Infinity;
  for (const frac of COOKING_FRACTIONS) {
    const dist = Math.abs(remainder - frac.value);
    if (dist < bestDist) {
      bestDist = dist;
      bestChar = frac.char;
    }
  }
  return bestChar;
}

function formatQuantityAsFraction(value: number): string {
  if (value === 0) return '0';

  if (value > 0 && value < PINCH_THRESHOLD) return 'pinch';

  const nearestWhole = Math.round(value);
  if (Math.abs(value - nearestWhole) <= WHOLE_TOLERANCE) {
    return String(nearestWhole);
  }

  let whole = Math.floor(value);
  let remainder = value - whole;

  if (remainder >= 1 - WHOLE_TOLERANCE) {
    return String(whole + 1);
  }

  if (remainder <= WHOLE_TOLERANCE) {
    return String(whole);
  }

  const fracChar = nearestFractionChar(remainder);
  if (!fracChar) return String(Math.round(value));

  if (whole === 0) return fracChar;
  return `${whole}${fracChar}`;
}

/** Format a numeric amount as a kitchen-friendly fraction (display only). */
export function formatQuantity(value: number, options?: { unit?: string }): string {
  if (!Number.isFinite(value)) return String(value);

  const unit = options?.unit?.trim();
  if (unit && isMetricKgUnit(unit)) {
    return formatMetricKg(value);
  }

  if (shouldUseWholeNumberDisplay(value, unit)) {
    return String(Math.round(value));
  }

  if (value < 0) {
    return `-${formatQuantity(-value, options)}`;
  }

  return formatQuantityAsFraction(value);
}

/** Quantity plus unit, e.g. `¾ cup` or `250 g`. */
export function formatQuantityWithUnit(quantity: number, unit: string): string {
  const trimmedUnit = unit.trim();
  if (!trimmedUnit) return formatQuantity(quantity);
  const amount = formatQuantity(quantity, { unit: trimmedUnit });
  return `${amount} ${trimmedUnit}`;
}

/** Ingredient line with structured quantity/unit and optional name. */
export function formatIngredientAmount(quantity: number, unit: string, name?: string): string {
  const trimmedName = name?.trim() ?? '';
  if (quantity > 0 && unit.trim()) {
    const amount = formatQuantityWithUnit(quantity, unit);
    return trimmedName ? `${amount} ${trimmedName}` : amount;
  }
  if (quantity > 0 && !unit.trim()) {
    const amount = formatQuantity(quantity);
    return trimmedName ? `${amount} ${trimmedName}` : amount;
  }
  return trimmedName ? formatIngredientText(trimmedName) : '';
}

/** Unit token immediately after a quantity in free-text ingredient lines. */
const INGREDIENT_UNIT_AFTER_QTY =
  /^\s+(fl\s+oz|fluid\s+ounces?|tablespoons?|teaspoons?|cups?|ounces?|pounds?|grams?|kilograms?|milliliters?|liters?|cloves?|cans?|jars?|bunches?|slices?|sticks?|heads?|packages?|pinch|tbsp|tsp|oz|lb|g|kg|ml|l|cup|can|jar|each)\b/i;

function canonicalIngredientUnit(raw: string): string {
  const u = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (u === 'fl oz' || u === 'fluid ounce' || u === 'fluid ounces') return 'fl oz';
  if (u === 'tablespoon' || u === 'tablespoons') return 'tbsp';
  if (u === 'teaspoon' || u === 'teaspoons') return 'tsp';
  if (u === 'cup' || u === 'cups') return 'cup';
  if (u === 'ounce' || u === 'ounces') return 'oz';
  if (u === 'pound' || u === 'pounds' || u === 'lbs' || u === 'lb.') return 'lb';
  if (u === 'gram' || u === 'grams') return 'g';
  if (u === 'kilogram' || u === 'kilograms') return 'kg';
  if (u === 'milliliter' || u === 'milliliters') return 'ml';
  if (u === 'liter' || u === 'liters') return 'l';
  if (u === 'clove' || u === 'cloves') return 'clove';
  if (u === 'can' || u === 'cans') return 'can';
  if (u === 'jar' || u === 'jars') return 'jar';
  if (u === 'bunch' || u === 'bunches') return 'bunch';
  if (u === 'slice' || u === 'slices') return 'slice';
  if (u === 'stick' || u === 'sticks') return 'stick';
  if (u === 'head' || u === 'heads') return 'head';
  if (u === 'package' || u === 'packages' || u === 'pkg') return 'package';
  return u.replace(/\.$/, '');
}

function ingredientUnitAfterDecimal(after: string): string | undefined {
  const m = after.match(INGREDIENT_UNIT_AFTER_QTY);
  if (!m?.[1]) return undefined;
  return canonicalIngredientUnit(m[1]);
}

function shouldFormatDecimalInIngredientText(match: string, offset: number, full: string): boolean {
  const before = full.slice(0, offset);
  const after = full.slice(offset + match.length);

  const charBefore = before.slice(-1);
  if (charBefore && CURRENCY_SYMBOLS.includes(charBefore)) return false;
  if (/[a-zA-Zv]$/.test(before)) return false;
  if (/[\d.]$/.test(before)) return false;

  if (/^\.\d/.test(after)) return false;

  if (/^\s*(degrees|degree|°\s*[fFcC]?|℉|℃|\b[fFcC]\b)/i.test(after)) return false;

  return true;
}

/**
 * Replace decimal numbers embedded in free-text ingredient lines (imports), e.g.
 * `0.75 cup flour` → `¾ cup flour`. Leaves prices, versions, and temperatures unchanged.
 */
export function formatIngredientText(text: string): string {
  if (!text || !/\d+\.\d+/.test(text)) return text;
  return text.replace(/\d+\.\d+/g, (match, offset, full) => {
    if (!shouldFormatDecimalInIngredientText(match, offset, full)) return match;
    const n = Number.parseFloat(match);
    if (!Number.isFinite(n)) return match;
    const after = full.slice(offset + match.length);
    const unit = ingredientUnitAfterDecimal(after);
    return formatQuantity(n, unit ? { unit } : undefined);
  });
}
