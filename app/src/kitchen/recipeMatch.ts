/**
 * Recipe against pantry: which ingredients the person has, which are missing (with the amount
 * still needed), and the ranking. Ported from the old app (mobile/lib/recipeMatch/match.ts and
 * mobile/config/recipeMatching.ts) with the same rules:
 *  - staples (salt, pepper, water, oil) are assumed and not counted;
 *  - a pantry row counts once per recipe;
 *  - a row in a unit that converts but holds too little leaves the shortfall missing
 *    (one egg does not cover six);
 *  - ranked by matched count, then percent, then fewest missing, then name.
 * Pure (tests/kitchen-recipe-match.test.ts).
 */
import {
  fuzzyNameScore,
  FUZZY_MATCH_THRESHOLD,
  ingredientCandidateKeys,
  ingredientMatchScore,
  normalizeIngredientName,
  tokenizeIngredientName,
} from './ingredientNormalize';
import { LruCache } from './lruCache';
import { INGREDIENT_STRIP_TOKENS, PANTRY_STAPLES } from './matchingConfig';
import {
  findPantryItemsForIngredient,
  isEggComponentIngredient,
  isEggsPantryRow,
  roundQty,
  totalPantryQuantityInUnit,
  type RecipeIngredientLine,
  type StockRow,
} from './recipeStock';

export type { RecipeIngredientLine, StockRow } from './recipeStock';

/** What the matcher needs from a recipe. */
export type MatchRecipe = {
  id: string;
  name: string;
  ingredients: readonly RecipeIngredientLine[];
};

export type MatchedIngredient<P extends StockRow = StockRow> = {
  ingredient: RecipeIngredientLine;
  matchedPantryItem: P;
  matchReason: 'ingredient_id' | 'fuzzy_name';
  score: number;
};

export type RecipePantryMatch<P extends StockRow = StockRow> = {
  recipeId: string;
  recipeName: string;
  /** Ingredients that count (staples left out). */
  totalIngredients: number;
  matchedCount: number;
  missingCount: number;
  percentMatch: number;
  /** Matched ingredients whose pantry row is use-by today or within EXPIRING_SOON_DAYS (never already past). */
  expiringSoonCount?: number;
  /** percentMatch plus the use-it-up bonus; what the feed sorts on. Absent means percentMatch alone. */
  rankScore?: number;
  matched: MatchedIngredient<P>[];
  /** Missing lines; quantity is what is still needed, in the recipe's unit. */
  missing: RecipeIngredientLine[];
  /** Staple lines that were not counted (salt, water, oil...). */
  staples: RecipeIngredientLine[];
  /** Every line in recipe order with its status, for the detail screen. */
  lines: IngredientStatusLine<P>[];
};

export type IngredientStatusLine<P extends StockRow = StockRow> =
  | { status: 'have'; ingredient: RecipeIngredientLine; pantryItem: P }
  /** `need` is the amount still to buy, in the recipe's unit (all of it, or the shortfall). */
  | { status: 'missing'; ingredient: RecipeIngredientLine; need: number; short: boolean }
  /** Salt, water, oil: assumed, not counted. */
  | { status: 'staple'; ingredient: RecipeIngredientLine };

/** Old app defaults (mobile/config/recipeMatching.ts). */
export const DEFAULT_MIN_MATCHED_INGREDIENTS = 2;
export const PARTIAL_MIN_MATCHED_COUNT = 1;
export const PARTIAL_MATCH_LIMIT = 12;

/** Use-it-up bonus: a pantry item due within this many days counts as expiring soon. */
export const EXPIRING_SOON_DAYS = 3;
/** Points added to percentMatch for each expiring-soon ingredient a recipe uses... */
export const EXPIRING_BONUS_POINTS = 10;
/** ...counting at most this many, so the bonus (20 points) never outweighs a clearly better match. */
export const EXPIRING_BONUS_MAX_ITEMS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from today (the device's calendar day) to a 'YYYY-MM-DD' date; null when it is not a date. */
function daysUntil(dateOnly: string | null | undefined, now: Date): number | null {
  const m = typeof dateOnly === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly) : null;
  if (!m) return null;
  const due = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / DAY_MS);
}

/** Due today through EXPIRING_SOON_DAYS from now. Already past is not "use it up": it is not suggested as food. */
function isExpiringSoon(item: StockRow, now: Date): boolean {
  const days = daysUntil((item as { expiresOn?: string | null }).expiresOn, now);
  return days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS;
}

const STRIP = new Set<string>(INGREDIENT_STRIP_TOKENS);
const WATER_MODIFIERS = new Set(['hot', 'cold', 'warm', 'boiling', 'ice', 'iced', 'room', 'temperature']);
const idAsName = (id: string) => id.replace(/-/g, ' ');

function isWaterIngredient(name: string, ingredientId: string): boolean {
  const tokens = tokenizeIngredientName(name);
  const idTokens = tokenizeIngredientName(idAsName(ingredientId));
  const iceOnly = (tokens.length === 1 && tokens[0] === 'ice') || (idTokens.length === 1 && idTokens[0] === 'ice');
  if (iceOnly) return true;
  if (!tokens.includes('water') && !idTokens.includes('water')) return false;
  return tokens.filter((t) => t !== 'water' && !STRIP.has(t) && !WATER_MODIFIERS.has(t)).length === 0;
}

const STAPLE_CACHE = new LruCache<string, boolean>(20_000);

/** Salt, pepper, water, oil and the like: assumed in every kitchen, never counted. */
export function isPantryStaple(name: string, ingredientId: string): boolean {
  // Library ids ("lib-<slug>-3") name nothing, so those answers depend on the name alone.
  const key = ingredientId.startsWith('lib-') ? name : `${name}\u0000${ingredientId}`;
  const cached = STAPLE_CACHE.get(key);
  if (cached !== undefined) return cached;
  const result = isPantryStapleCore(name, ingredientId);
  STAPLE_CACHE.set(key, result);
  return result;
}

function isPantryStapleCore(name: string, ingredientId: string): boolean {
  if (isWaterIngredient(name, ingredientId)) return true;
  const normalized = normalizeIngredientName(name);
  const idNorm = normalizeIngredientName(idAsName(ingredientId));
  const nameTokens = tokenizeIngredientName(name);
  for (const staple of PANTRY_STAPLES) {
    const sNorm = normalizeIngredientName(staple);
    if (normalized === sNorm || idNorm === sNorm) return true;
    const stapleTokens = tokenizeIngredientName(staple);
    if (stapleTokens.length === 1 && nameTokens.length > 1 && nameTokens[nameTokens.length - 1] === stapleTokens[0]) {
      if (nameTokens.slice(0, -1).every((t) => STRIP.has(t))) return true;
    }
  }
  return false;
}

function keysOverlap(ingredient: RecipeIngredientLine, item: StockRow): boolean {
  return (
    ingredientMatchScore(ingredient.name, item.name) >= FUZZY_MATCH_THRESHOLD ||
    ingredientMatchScore(ingredient.name, idAsName(item.ingredientId)) >= FUZZY_MATCH_THRESHOLD
  );
}

function fuzzyAgainstRow(label: string, item: StockRow): number {
  return Math.max(
    fuzzyNameScore(label, item.name),
    fuzzyNameScore(label, idAsName(item.ingredientId)),
    fuzzyNameScore(label.replace(/-/g, ' '), item.name),
  );
}

/**
 * Pantry rows by the words, synonym groups and families they could match on, built once per pantry
 * array. With thousands of recipes, comparing every ingredient with every pantry row took over a
 * minute; this narrows each ingredient to the few rows that share something with it. Rows left out
 * could not have matched (see ingredientCandidateKeys), so the answer is the same.
 */
const PANTRY_KEY_INDEX = new WeakMap<readonly StockRow[], Map<string, number[]>>();

function pantryKeyIndex(pantry: readonly StockRow[]): Map<string, number[]> {
  const cached = PANTRY_KEY_INDEX.get(pantry);
  if (cached) return cached;
  const index = new Map<string, number[]>();
  pantry.forEach((item, i) => {
    const keys = new Set<string>([
      ...ingredientCandidateKeys(item.name, 'pantry'),
      ...ingredientCandidateKeys(idAsName(item.ingredientId), 'pantry'),
      `i:${item.ingredientId}`,
    ]);
    for (const key of keys) {
      const list = index.get(key);
      if (list) list.push(i);
      else index.set(key, [i]);
    }
  });
  PANTRY_KEY_INDEX.set(pantry, index);
  return index;
}

/** The pantry rows that could match this ingredient, in pantry order. */
function candidateRows<P extends StockRow>(ingredient: RecipeIngredientLine, pantry: readonly P[]): P[] {
  if (pantry.length < 8 || isEggComponentIngredient(ingredient.name)) return [...pantry];
  const index = pantryKeyIndex(pantry);
  const wanted = new Set<number>();
  const keys = [
    ...ingredientCandidateKeys(ingredient.name, 'recipe'),
    ...ingredientCandidateKeys(ingredient.name.replace(/-/g, ' '), 'recipe'),
    `i:${ingredient.ingredientId}`,
  ];
  for (const key of keys) for (const i of index.get(key) ?? []) wanted.add(i);
  return [...wanted].sort((a, b) => a - b).map((i) => pantry[i]!);
}

function findPantryMatch<P extends StockRow>(
  ingredient: RecipeIngredientLine,
  pantry: readonly P[],
  candidates: readonly P[],
  used: ReadonlySet<string>,
): { item: P; reason: MatchedIngredient['matchReason']; score: number } | null {
  if (pantry.length === 0) return null;

  // Egg yolks and whites come out of whole eggs.
  if (isEggComponentIngredient(ingredient.name)) {
    const eggs = pantry.find((item) => !used.has(item.id) && isEggsPantryRow(item));
    if (eggs) return { item: eggs, reason: 'ingredient_id', score: 1 };
  }

  for (const item of candidates) {
    if (used.has(item.id)) continue;
    if (item.ingredientId === ingredient.ingredientId) return { item, reason: 'ingredient_id', score: 1 };
    if (keysOverlap(ingredient, item)) {
      const score = Math.max(
        ingredientMatchScore(ingredient.name, item.name),
        ingredientMatchScore(ingredient.name, idAsName(item.ingredientId)),
        0.98,
      );
      return { item, reason: 'ingredient_id', score };
    }
  }

  let best: P | null = null;
  let bestScore = 0;
  for (const item of candidates) {
    if (used.has(item.id)) continue;
    const score = fuzzyAgainstRow(ingredient.name, item);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best && bestScore >= FUZZY_MATCH_THRESHOLD ? { item: best, reason: 'fuzzy_name', score: bestScore } : null;
}

/** One recipe against the pantry. */
export function scoreRecipeAgainstPantry<P extends StockRow>(
  recipe: MatchRecipe,
  pantry: readonly P[],
  now: Date = new Date(),
): RecipePantryMatch<P> {
  const used = new Set<string>();
  const matched: MatchedIngredient<P>[] = [];
  const missing: RecipeIngredientLine[] = [];
  const staples: RecipeIngredientLine[] = [];
  const lines: IngredientStatusLine<P>[] = [];
  let scorable = 0;

  for (const ingredient of recipe.ingredients) {
    if (isPantryStaple(ingredient.name, ingredient.ingredientId)) {
      staples.push(ingredient);
      lines.push({ status: 'staple', ingredient });
      continue;
    }
    scorable += 1;
    const candidates = candidateRows(ingredient, pantry);
    const result = findPantryMatch(ingredient, pantry, candidates, used);
    if (!result) {
      missing.push(ingredient);
      lines.push({ status: 'missing', ingredient, need: ingredient.quantity, short: false });
      continue;
    }
    const have = totalPantryQuantityInUnit(findPantryItemsForIngredient(ingredient, candidates), ingredient.unit);
    if (have !== null && have < ingredient.quantity) {
      const need = roundQty(ingredient.quantity - have);
      missing.push({ ...ingredient, quantity: need });
      lines.push({ status: 'missing', ingredient, need, short: true });
    } else {
      used.add(result.item.id);
      matched.push({ ingredient, matchedPantryItem: result.item, matchReason: result.reason, score: result.score });
      lines.push({ status: 'have', ingredient, pantryItem: result.item });
    }
  }

  const percentMatch = scorable > 0 && pantry.length > 0 ? Math.round((matched.length / scorable) * 100) : 0;
  const expiringSoonCount = matched.filter((m) => isExpiringSoon(m.matchedPantryItem, now)).length;
  // The bonus only reorders recipes that already match; a recipe with no match gets none.
  const bonus = matched.length > 0 ? Math.min(expiringSoonCount, EXPIRING_BONUS_MAX_ITEMS) * EXPIRING_BONUS_POINTS : 0;

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    totalIngredients: scorable,
    matchedCount: matched.length,
    missingCount: missing.length,
    percentMatch,
    expiringSoonCount,
    rankScore: percentMatch + bonus,
    matched,
    missing,
    staples,
    lines,
  };
}

/**
 * Best first: highest rank score (percent matched plus the use-it-up bonus), then percent, then most
 * matched, then fewest missing, then name. Percent comes before count so a recipe the pantry nearly
 * covers outranks a long recipe the pantry only half covers.
 */
export function compareRecipePantryMatches(a: RecipePantryMatch, b: RecipePantryMatch): number {
  const scoreA = a.rankScore ?? a.percentMatch;
  const scoreB = b.rankScore ?? b.percentMatch;
  if (scoreB !== scoreA) return scoreB - scoreA;
  if (b.percentMatch !== a.percentMatch) return b.percentMatch - a.percentMatch;
  if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
  if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
  return a.recipeName.localeCompare(b.recipeName);
}

export type PantryMatchIndex<P extends StockRow = StockRow> = {
  byRecipeId: Map<string, RecipePantryMatch<P>>;
  /** Best first. Empty when the pantry is empty (old app: nothing to rank against). */
  ranked: RecipePantryMatch<P>[];
};

export function buildPantryMatchIndex<P extends StockRow>(
  recipes: readonly MatchRecipe[],
  pantry: readonly P[],
  now: Date = new Date(),
): PantryMatchIndex<P> {
  const all = recipes.map((recipe) => scoreRecipeAgainstPantry(recipe, pantry, now));
  const byRecipeId = new Map(all.map((m) => [m.recipeId, m]));
  if (pantry.length === 0) return { byRecipeId, ranked: [] };
  return { byRecipeId, ranked: [...all].sort(compareRecipePantryMatches) };
}

export type RecipePantryFilterMode = 'all' | 'have_all' | 'missing_1_2' | 'best_match';

export type FilterRankedMatchesOptions = {
  /** Fewest counted ingredients that must be in the pantry (default 2). */
  minMatchedCount?: number;
  /** 0 means an empty pantry: nothing is shown. */
  pantryItemCount?: number;
};

export function filterRankedMatches<M extends RecipePantryMatch>(
  ranked: readonly M[],
  mode: RecipePantryFilterMode,
  minPercent: number,
  options?: FilterRankedMatchesOptions,
): M[] {
  if (options?.pantryItemCount === 0) return [];
  const minMatched = options?.minMatchedCount ?? DEFAULT_MIN_MATCHED_INGREDIENTS;
  const filterMode = mode === 'best_match' ? 'all' : mode;
  return ranked.filter((m) => {
    if (m.matchedCount < minMatched) return false;
    if (m.percentMatch < minPercent) return false;
    if (filterMode === 'have_all') return m.missingCount === 0;
    if (filterMode === 'missing_1_2') return m.missingCount >= 1 && m.missingCount <= 2;
    return true;
  });
}

/** The default thresholds; when nothing passes, the best partial overlaps (at least one ingredient, up to 12). */
export function filterRankedMatchesWithPartialFallback<M extends RecipePantryMatch>(
  ranked: readonly M[],
  mode: RecipePantryFilterMode,
  minPercent: number,
  options?: FilterRankedMatchesOptions & { partialMinMatchedCount?: number; partialMatchMax?: number },
): { matches: M[]; usedPartialFallback: boolean } {
  const strict = filterRankedMatches(ranked, mode, minPercent, options);
  if (strict.length > 0) return { matches: strict, usedPartialFallback: false };
  if (options?.pantryItemCount === 0) return { matches: [], usedPartialFallback: false };
  const partial = filterRankedMatches(ranked, mode, 0, {
    ...options,
    minMatchedCount: options?.partialMinMatchedCount ?? PARTIAL_MIN_MATCHED_COUNT,
  });
  return {
    matches: partial.slice(0, options?.partialMatchMax ?? PARTIAL_MATCH_LIMIT),
    usedPartialFallback: partial.length > 0,
  };
}
