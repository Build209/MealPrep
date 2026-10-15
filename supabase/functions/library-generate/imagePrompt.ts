// Copied from the old app's lib/libraryRecipes/imagePrompt.ts (removed at switch-over) so this function bundles on its own.
export interface ImagePromptIngredient {
  name: string;
  quantity: number;
  unit: string;
  note?: string | null;
}

export interface ImagePromptRecipe {
  title: string;
  ingredients: ImagePromptIngredient[];
  steps: string[];
}

const PANTRY_SKIP = new Set([
  'salt',
  'pepper',
  'black pepper',
  'water',
  'oil',
  'olive oil',
  'vegetable oil',
  'cooking oil',
  'butter',
  'garlic',
  'onion powder',
  'paprika',
]);

const PASTA_TERMS = [
  'pasta',
  'spaghetti',
  'linguine',
  'fettuccine',
  'penne',
  'noodle',
  'noodles',
  'macaroni',
  'orzo',
  'rigatoni',
];

const BREADING_TERMS = [
  'breadcrumb',
  'breadcrumbs',
  'panko',
  'flour',
  'cornstarch',
  'corn starch',
  'batter',
  'tempura',
];

function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase();
}

function ingredientBlob(ingredients: ImagePromptIngredient[]): string {
  return ingredients
    .map((i) => `${i.name} ${i.note ?? ''}`.trim().toLowerCase())
    .join(' ');
}

function stepsBlob(steps: string[]): string {
  return steps.join(' ').toLowerCase();
}

function hasAnyTerm(haystack: string, terms: string[]): boolean {
  return terms.some((term) => haystack.includes(term));
}

export function inferCookingMethod(recipe: ImagePromptRecipe): string | null {
  const blob = `${recipe.title} ${stepsBlob(recipe.steps)}`.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\bair fryer\b/, 'air-fried'],
    [/\bslow cooker\b|\bcrock ?pot\b/, 'slow-cooked'],
    [/\binstant pot\b|\bpressure cook/, 'pressure-cooked'],
    [/\bgrill(ed)?\b|\bbroil(ed)?\b/, 'grilled'],
    [/\bbak(e|ed|ing)\b/, 'oven-baked'],
    [/\broast(ed|ing)?\b/, 'roasted'],
    [/\bsaut[eé](ed|ing)?\b|\bpan-?sear/, 'pan-seared'],
    [/\bsteam(ed|ing)?\b/, 'steamed'],
    [/\bsimmer(ed|ing)?\b|\bbraise(d|ing)?\b|\bstew(ed|ing)?\b/, 'simmered'],
    [/\bdeep.?fried\b|\bfry(ing)?\b/, 'fried'],
  ];
  for (const [pattern, label] of rules) {
    if (pattern.test(blob)) return label;
  }
  return null;
}

export function pickKeyVisibleIngredients(
  ingredients: ImagePromptIngredient[],
  max = 6,
): string[] {
  const picked: string[] = [];
  for (const ing of ingredients) {
    const name = ing.name.trim();
    if (!name) continue;
    const key = normalizeIngredientName(name);
    if (PANTRY_SKIP.has(key)) continue;
    if (picked.some((p) => normalizeIngredientName(p) === key)) continue;
    picked.push(name);
    if (picked.length >= max) break;
  }
  if (picked.length < 4) {
    for (const ing of ingredients) {
      const name = ing.name.trim();
      if (!name || picked.includes(name)) continue;
      picked.push(name);
      if (picked.length >= Math.min(max, 4)) break;
    }
  }
  return picked.slice(0, max);
}

export function inferPlatingFromLastStep(steps: string[]): string | null {
  if (steps.length === 0) return null;
  const last = steps[steps.length - 1]?.trim();
  if (!last) return null;
  const trimmed = last.length > 220 ? `${last.slice(0, 217)}…` : last;
  return trimmed;
}

export function buildImageNegatives(recipe: ImagePromptRecipe): string[] {
  const ing = ingredientBlob(recipe.ingredients);
  const steps = stepsBlob(recipe.steps);
  const title = recipe.title.toLowerCase();
  const negatives: string[] = [];

  const hasPasta = hasAnyTerm(ing, PASTA_TERMS) || hasAnyTerm(title, PASTA_TERMS);
  if (!hasPasta) {
    negatives.push('no pasta or noodles on the plate');
  }

  const breadingInRecipe =
    hasAnyTerm(ing, BREADING_TERMS) ||
    /\bbread(ed|ing)\b|\bcoat(ed|ing)?\b.*\bflour\b/.test(steps);
  if (!breadingInRecipe) {
    negatives.push('not breaded or battered');
  }

  if (/\bmeatball/.test(title) && !hasPasta) {
    negatives.push('meatballs only, not served on spaghetti');
  }

  if (/\bdry rub\b|\brub\b/.test(steps) && !breadingInRecipe) {
    negatives.push('show spice-rubbed surface, not a flour coating');
  }

  if (/\bsoup\b|\bstew\b|\bchili\b/.test(title) && !/\bbowl\b/.test(steps)) {
    negatives.push('serve in a bowl if this is a soup or stew');
  }

  return negatives;
}

export function buildRecipeImagePrompt(recipe: ImagePromptRecipe): string {
  const title = recipe.title.trim();
  const method = inferCookingMethod(recipe);
  const ingredients = pickKeyVisibleIngredients(recipe.ingredients, 6);
  const plating = inferPlatingFromLastStep(recipe.steps);
  const negatives = buildImageNegatives(recipe);

  const parts = [
    `Realistic appetizing food photograph of "${title}".`,
    method ? `Cooking method: ${method}.` : null,
    ingredients.length > 0
      ? `Show these key visible ingredients: ${ingredients.join(', ')}.`
      : null,
    plating ? `Final plating (from recipe): ${plating}` : null,
    'Overhead or 45-degree home-style food photography, soft natural light, shallow depth of field.',
    negatives.length > 0 ? `Avoid: ${negatives.join('; ')}.` : null,
    'No people, no hands, no text, no logos, no brands.',
  ];

  return parts.filter((p): p is string => Boolean(p)).join(' ');
}
