import { parseIso8601DurationToMinutes, parseRecipeYieldToServings } from './durationParse.ts';
import type { RecipeImportExtracted } from './recipeImportSchema.ts';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function collectJsonLdNodes(doc: unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  if (!isObject(doc)) return nodes;
  const graph = doc['@graph'];
  if (Array.isArray(graph)) {
    for (const entry of graph) {
      if (isObject(entry)) nodes.push(entry);
    }
  }
  nodes.push(doc);
  return nodes;
}

function recipeTypeMatches(typeField: unknown): boolean {
  if (typeof typeField === 'string') {
    return typeField.toLowerCase().includes('recipe');
  }
  if (Array.isArray(typeField)) {
    return typeField.some((t) => typeof t === 'string' && t.toLowerCase().includes('recipe'));
  }
  return false;
}

function parseIngredientLine(text: string): { name: string; quantity: number; unit: string; note?: string } {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^([\d./\s]+)?\s*([a-zA-Z]+(?:\.[a-zA-Z]+)?)?\s+(.+)$/,
  );
  if (!match) {
    return { name: trimmed, quantity: 1, unit: 'each' };
  }
  const qtyRaw = (match[1] ?? '').trim();
  const unitRaw = (match[2] ?? '').trim();
  const name = (match[3] ?? trimmed).trim();
  let quantity = 1;
  if (qtyRaw) {
    if (qtyRaw.includes('/')) {
      const [a, b] = qtyRaw.split('/').map((p) => Number.parseFloat(p.trim()));
      if (a && b) quantity = a / b;
    } else {
      const n = Number.parseFloat(qtyRaw.replace(/\s+/g, ''));
      if (!Number.isNaN(n)) quantity = n;
    }
  }
  const unit = unitRaw || 'each';
  return { name, quantity, unit };
}

function parseIngredientObject(ing: Record<string, unknown>): {
  name: string;
  quantity: number;
  unit: string;
  note?: string;
} {
  const name = asString(ing.name) || asString(ing.item) || asString(ing.ingredient);
  const amount = ing.amount;
  if (isObject(amount)) {
    const qty = Number(amount.value ?? amount.amount ?? 1);
    const unit = asString(amount.unitText) || asString(amount.unit) || 'each';
    return { name, quantity: Number.isFinite(qty) ? qty : 1, unit };
  }
  if (typeof amount === 'string' && amount.trim()) {
    const parsed = parseIngredientLine(amount);
    return { ...parsed, name: name || parsed.name };
  }
  return parseIngredientLine(name);
}

function extractSteps(instructions: unknown): string[] {
  if (!instructions) return [];
  if (typeof instructions === 'string') {
    return instructions
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
  if (!Array.isArray(instructions)) {
    if (isObject(instructions)) {
      return extractSteps([instructions]);
    }
    return [];
  }
  const steps: string[] = [];
  for (const entry of instructions) {
    if (typeof entry === 'string') {
      const t = entry.trim();
      if (t) steps.push(t);
      continue;
    }
    if (!isObject(entry)) continue;
    const type = asString(entry['@type']).toLowerCase();
    if (type.includes('howtosection')) {
      steps.push(...extractSteps(entry.itemListElement ?? entry.hasPart));
      continue;
    }
    if (type.includes('howtostep') || entry.text) {
      const text = asString(entry.text) || asString(entry.name);
      if (text) steps.push(text);
      continue;
    }
    if (entry.itemListElement) {
      steps.push(...extractSteps(entry.itemListElement));
    }
  }
  return steps;
}

export function findRecipeJsonLdInHtml(html: string): Record<string, unknown> | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(parsed)
        ? parsed.flatMap((entry) => (isObject(entry) ? collectJsonLdNodes(entry) : []))
        : isObject(parsed)
          ? collectJsonLdNodes(parsed)
          : [];
      for (const node of candidates) {
        if (recipeTypeMatches(node['@type'])) return node;
      }
    } catch {
      /* try next script block */
    }
  }
  return null;
}

export function recipeJsonLdToExtracted(
  node: Record<string, unknown>,
  sourceUrl: string,
): RecipeImportExtracted | null {
  const title = asString(node.name) || asString(node.headline);
  if (!title) return null;

  const ingredientsRaw = node.recipeIngredient ?? node.ingredients;
  const ingredients: RecipeImportExtracted['ingredients'] = [];
  if (Array.isArray(ingredientsRaw)) {
    for (const entry of ingredientsRaw) {
      if (typeof entry === 'string') {
        const parsed = parseIngredientLine(entry);
        if (parsed.name) ingredients.push({ ...parsed, note: undefined });
      } else if (isObject(entry)) {
        const parsed = parseIngredientObject(entry);
        if (parsed.name) ingredients.push(parsed);
      }
    }
  }

  const steps = extractSteps(node.recipeInstructions ?? node.step);
  const prep =
    parseIso8601DurationToMinutes(node.prepTime) ??
    parseIso8601DurationToMinutes(node.preparationTime);
  const cook = parseIso8601DurationToMinutes(node.cookTime);
  const total = parseIso8601DurationToMinutes(node.totalTime);
  const resolvedPrep = prep ?? (total != null && cook != null ? Math.max(0, total - cook) : prep);
  const resolvedCook = cook ?? (total != null && prep != null ? Math.max(0, total - prep) : total);
  const servings = parseRecipeYieldToServings(node.recipeYield) ?? 4;

  const hasRecipeSignal = ingredients.length > 0 || steps.length > 0;
  return {
    title,
    servings,
    prep_minutes: resolvedPrep,
    cook_minutes: resolvedCook,
    ingredients,
    steps,
    is_recipe: hasRecipeSignal,
    confidence: hasRecipeSignal ? 0.92 : 0.4,
    source_url: sourceUrl,
    source_type: 'web',
    source_title: title,
  };
}

export function stripHtmlToText(html: string, maxChars: number): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = withoutScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…`;
}
