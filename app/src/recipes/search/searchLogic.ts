/**
 * Recipe search, pure. Ported from the old app:
 *  - mergeRecipeSearchResults (mobile/lib/recipes/mergeSearchResults.ts): the person's own recipes
 *    first, then catalog recipes and creator videos taking turns, duplicates dropped (catalog by
 *    normalised title, videos by id). Checks from scripts/recipes-search-merge-check.ts.
 *  - normalizeRecipeTitleForDedup (mobile/lib/recipes/unifiedFeed.ts), unchanged.
 *  - the 2-character minimum and the haystack (title, description, tag) of the old search box.
 * New here: ingredient matches (the old box matched titles only), and a plain order (title matches
 * first, then by name) in place of the old engagement ranking, which the new app does not log yet.
 * Checks: tests/recipes-search-logic.test.ts.
 */

/** Shortest text that searches (old app: under 2 characters shows nothing). */
export const MIN_SEARCH_LENGTH = 2;
/** Longest text used; longer input is cut, not refused. */
export const MAX_SEARCH_LENGTH = 80;

/** Ported unchanged: lower case, accents off, anything not a letter or digit becomes one space. */
export function normalizeRecipeTitleForDedup(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** The words searched for, normalised; [] when the text is too short. */
export function searchWords(query: string): string[] {
  const trimmed = query.trim().slice(0, MAX_SEARCH_LENGTH);
  if (trimmed.length < MIN_SEARCH_LENGTH) return [];
  const normal = normalizeRecipeTitleForDedup(trimmed);
  return normal ? normal.split(' ') : [];
}

export type SearchableFields = {
  title: string;
  subtitle: string;
  description: string;
  ingredients: readonly { name: string }[];
};

export type MatchKind = 'title' | 'ingredient';

function containsAll(haystack: string, words: readonly string[]): boolean {
  return words.every((word) => haystack.includes(word));
}

/**
 * 'title' when every word is in the title, description or tag (the old haystack); 'ingredient' when
 * the words are only all found once the ingredient names are added; null otherwise.
 */
export function matchRecipe(recipe: SearchableFields, words: readonly string[]): MatchKind | null {
  if (words.length === 0) return null;
  const titleText = normalizeRecipeTitleForDedup(`${recipe.title} ${recipe.description} ${recipe.subtitle}`);
  if (containsAll(` ${titleText} `, words)) return 'title';
  const ingredientText = normalizeRecipeTitleForDedup(recipe.ingredients.map((i) => i.name).join(' '));
  if (containsAll(` ${titleText} ${ingredientText} `, words)) return 'ingredient';
  return null;
}

/** The first ingredient name that holds one of the words (to say why an ingredient match showed up). */
export function matchedIngredient(recipe: Pick<SearchableFields, 'ingredients'>, words: readonly string[]): string | null {
  for (const ingredient of recipe.ingredients) {
    const name = ` ${normalizeRecipeTitleForDedup(ingredient.name)} `;
    if (words.some((word) => name.includes(word))) return ingredient.name;
  }
  return null;
}

/** The small line under a recipe result. */
export function recipeResultNote(
  recipe: Pick<SearchableFields, 'ingredients' | 'subtitle'> & { own: boolean; minutes: number | null },
  match: MatchKind,
  words: readonly string[],
): string {
  const parts: string[] = [];
  if (recipe.own) parts.push('Your recipe');
  if (match === 'ingredient') {
    const name = matchedIngredient(recipe, words);
    if (name) parts.push(`Uses ${name}`);
  } else if (recipe.subtitle) {
    parts.push(recipe.subtitle);
  }
  if (recipe.minutes) parts.push(`${recipe.minutes} min`);
  return parts.join(' · ');
}

export type RecipeHit<T> ={ recipe: T; match: MatchKind };

/**
 * Matching recipes, best first: title matches before ingredient-only matches; among title matches,
 * a title that starts with the first word comes first; then by title (A to Z), then id for a stable order.
 */
export function searchRecipes<T extends SearchableFields & { routeId: string }>(
  recipes: readonly T[],
  query: string,
): RecipeHit<T>[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const first = words[0]!;
  const hits: { hit: RecipeHit<T>; rank: number; key: string }[] = [];
  for (const recipe of recipes) {
    const match = matchRecipe(recipe, words);
    if (!match) continue;
    const title = normalizeRecipeTitleForDedup(recipe.title);
    const rank = match === 'title' ? (title.startsWith(first) ? 0 : 1) : 2;
    hits.push({ hit: { recipe, match }, rank, key: title });
  }
  hits.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key) || a.hit.recipe.routeId.localeCompare(b.hit.recipe.routeId));
  return hits.map((h) => h.hit);
}

// ------------------------------------------------------------------- merging

export type SearchResultItem<R, V> =
  | { kind: 'recipe'; key: string; hit: RecipeHit<R> }
  | { kind: 'video'; key: string; video: V };

/**
 * Ported from mergeRecipeSearchResults: own recipes first (one per id), then catalog recipes and
 * videos taking turns, starting with a recipe. A catalog recipe whose normalised title was already
 * shown is dropped; a video id already shown is dropped.
 */
export function mergeSearchResults<R extends { routeId: string; title: string }, V extends { videoId: string }>(
  ownHits: readonly RecipeHit<R>[],
  catalogHits: readonly RecipeHit<R>[],
  videos: readonly V[],
): SearchResultItem<R, V>[] {
  const merged: SearchResultItem<R, V>[] = [];
  const seen = new Set<string>();

  for (const hit of ownHits) {
    const key = `own:${hit.recipe.routeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ kind: 'recipe', key, hit });
  }

  let ci = 0;
  let vi = 0;
  let preferVideo = false;
  while (ci < catalogHits.length || vi < videos.length) {
    const takeVideo = vi < videos.length && (ci >= catalogHits.length || preferVideo);
    preferVideo = !preferVideo;
    if (takeVideo) {
      const video = videos[vi++]!;
      const key = `video:${video.videoId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ kind: 'video', key, video });
    } else {
      const hit = catalogHits[ci++]!;
      const key = `classic:${normalizeRecipeTitleForDedup(hit.recipe.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ kind: 'recipe', key, hit });
    }
  }
  return merged;
}

/** Splits catalog hits into the person's own and the rest, then merges with the videos. */
export function buildSearchResults<R extends SearchableFields & { routeId: string; own: boolean }, V extends { videoId: string }>(
  catalog: readonly R[],
  videos: readonly V[],
  query: string,
): SearchResultItem<R, V>[] {
  const hits = searchRecipes(catalog, query);
  return mergeSearchResults(
    hits.filter((h) => h.recipe.own),
    hits.filter((h) => !h.recipe.own),
    searchWords(query).length > 0 ? videos : [],
  );
}
