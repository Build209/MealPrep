import type { RecipeImportExtracted, RecipeImportIngredient } from './recipeImportSchema.ts';

const INGREDIENT_HEADINGS =
  /^(#{1,3}\s*)?(ingredients?|what you(?:'ll| will) need|shopping list)\s*:?\s*$/i;
const STEP_HEADINGS =
  /^(#{1,3}\s*)?(instructions?|directions?|method|steps?|how to make|preparation)\s*:?\s*$/i;

const BULLET_LINE = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
const QUANTITY_INGREDIENT =
  /^([\d¼½¾⅓⅔⅛⅜⅝⅞./\s]+)?\s*([a-zA-Z]+(?:\.|\/[a-zA-Z]+)?)?\s+(.+)$/;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeRecipeText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function parseIngredientLine(line: string): RecipeImportIngredient | null {
  const cleaned = line.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  if (!cleaned || cleaned.length < 2) return null;
  const qtyMatch = cleaned.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞./\s-]+)\s+(\S+)\s+(.+)$/);
  if (qtyMatch) {
    const qtyRaw = qtyMatch[1]!.trim();
    const unit = qtyMatch[2]!.trim();
    const name = qtyMatch[3]!.trim();
    const quantity = parseQuantityToken(qtyRaw);
    if (name.length > 0) {
      return { name, quantity, unit };
    }
  }
  const loose = cleaned.match(QUANTITY_INGREDIENT);
  if (loose && loose[3]) {
    const quantity = parseQuantityToken((loose[1] ?? '1').trim());
    const unit = (loose[2] ?? 'each').trim();
    const name = loose[3].trim();
    if (name.length > 1) {
      return { name, quantity, unit: unit || 'each' };
    }
  }
  return { name: cleaned, quantity: 1, unit: 'each' };
}

function parseQuantityToken(raw: string): number {
  const map: Record<string, number> = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '⅓': 1 / 3,
    '⅔': 2 / 3,
    '⅛': 0.125,
  };
  let text = raw.trim();
  for (const [sym, val] of Object.entries(map)) {
    text = text.replace(sym, ` ${val} `);
  }
  if (text.includes('/')) {
    const parts = text.split(/\s+/).filter(Boolean);
    let sum = 0;
    for (const part of parts) {
      if (part.includes('/')) {
        const [a, b] = part.split('/').map((x) => Number.parseFloat(x));
        if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) sum += a / b;
      } else {
        const n = Number.parseFloat(part);
        if (Number.isFinite(n)) sum += n;
      }
    }
    if (sum > 0) return sum;
  }
  const n = Number.parseFloat(text);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function splitSections(lines: string[]): {
  ingredients: string[];
  steps: string[];
} {
  const ingredients: string[] = [];
  const steps: string[] = [];
  let mode: 'none' | 'ingredients' | 'steps' = 'none';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (INGREDIENT_HEADINGS.test(trimmed)) {
      mode = 'ingredients';
      continue;
    }
    if (STEP_HEADINGS.test(trimmed)) {
      mode = 'steps';
      continue;
    }
    const bullet = BULLET_LINE.exec(trimmed);
    const content = bullet ? bullet[1]!.trim() : trimmed;

    if (mode === 'ingredients') {
      ingredients.push(content);
    } else if (mode === 'steps') {
      steps.push(content);
    } else if (bullet) {
      if (steps.length > 0 || ingredients.length >= 3) {
        steps.push(content);
      } else {
        ingredients.push(content);
      }
    } else if (/^\d+[.)]\s/.test(trimmed)) {
      steps.push(content);
    }
  }

  return { ingredients, steps };
}

export function recipeSignalsInText(text: string): boolean {
  const normalized = normalizeRecipeText(text);
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (INGREDIENT_HEADINGS.test(lower.split('\n')[0] ?? '')) return true;
  if (STEP_HEADINGS.test(lower)) return true;
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  const { ingredients, steps } = splitSections(lines);
  return ingredients.length >= 2 && steps.length >= 1;
}

export function parseRuleBasedRecipeFromText(
  title: string,
  body: string,
): Pick<
  RecipeImportExtracted,
  'title' | 'servings' | 'ingredients' | 'steps' | 'is_recipe' | 'confidence'
> | null {
  const recipeTitle = title.trim();
  const normalizedBody = normalizeRecipeText(body);
  if (!recipeTitle || !normalizedBody) return null;

  const lines = normalizedBody.split('\n');
  const { ingredients: ingLines, steps: stepLines } = splitSections(lines);

  const ingredients: RecipeImportIngredient[] = [];
  for (const line of ingLines) {
    const parsed = parseIngredientLine(line);
    if (parsed) ingredients.push(parsed);
  }

  const steps = stepLines
    .map((s) => s.replace(/^\d+[.)]\s*/, '').trim())
    .filter((s) => s.length > 2);

  if (ingredients.length < 2 || steps.length < 1) {
    return null;
  }

  const servingsMatch = normalizedBody.match(/(?:servings?|serves?)\s*:?\s*(\d+)/i);
  const servings = servingsMatch ? Math.max(1, Number.parseInt(servingsMatch[1]!, 10)) : 4;

  return {
    title: recipeTitle,
    servings,
    ingredients,
    steps,
    is_recipe: true,
    confidence: 0.72,
  };
}
