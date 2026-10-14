import { cleanVideoTitle, imageAddress, watchLink } from '../creators/videoText';
import type { CreatorVideo } from './creatorRows';
import { DataError } from './errors';
import type { ListChange } from './listOps';
import { LEGACY_LIBRARY_PREFIX, asUuid, isUuid, parseRecipeRouteId, type SearchableRecipe } from './recipeSearchRows';

/**
 * Saved recipes (user_saved_recipes in db/supabase/migrations/20261013000000_live_baseline.sql),
 * their mapping, and the pure helpers the hooks use. No network here, so tests can run it.
 *
 * The old app writes the same table until switch-over, so keys and previews follow its format
 * (mobile/lib/savedRecipes/keys.ts, payloads.ts, preview.ts):
 *   kitchen:<old recipe id>   recipes row: slug, else uuid; library row: "library-<slug>"
 *   creator:<video id>        a creator video
 *   mealdb:<id>               an old app recipe from another site (read only here)
 * New saves also put `appRoute` ("r_<uuid>" / "l_<uuid>") in the preview so the new app links
 * without a lookup. The old app ignores extra preview fields.
 */

export type SavedSourceType = 'kitchen' | 'creator_video' | 'mealdb'; // user_saved_recipes_source_type_check

export type SavedRecipeRow = {
  id: string; // uuid
  user_id: string;
  ref_key: string; // unique with user_id
  source_type: string;
  kitchen_recipe_id: string | null; // uuid, references recipes(id) on delete set null
  creator_video_id: string | null;
  creator_watch_url: string | null;
  mealdb_id: string | null;
  title: string;
  image_url: string | null;
  preview: unknown; // jsonb, default '{}'
  created_at: string;
};

export const SAVED_RECIPE_COLUMNS =
  'id, user_id, ref_key, source_type, kitchen_recipe_id, creator_video_id, creator_watch_url, mealdb_id, title, image_url, preview, created_at';

/** Where a saved item goes when tapped. */
export type SavedLink =
  | { kind: 'recipe'; routeId: string }
  | { kind: 'video'; url: string; label: string }
  | { kind: 'none' };

export type SavedRecipe = {
  id: string;
  refKey: string;
  sourceType: SavedSourceType;
  title: string;
  imageUrl: string | null;
  savedAt: string;
  kitchenRecipeId: string | null;
  link: SavedLink;
};

// ------------------------------------------------------------------------ keys

export function savedRefKeyKitchen(legacyId: string): string {
  return `kitchen:${legacyId}`;
}

export function savedRefKeyCreator(videoId: string): string {
  return `creator:${videoId.trim()}`;
}

/** Ported unchanged from mobile/lib/savedRecipes/keys.ts. */
export function parseSavedRefKey(refKey: string): { type: 'kitchen' | 'creator' | 'mealdb'; id: string } | null {
  const [prefix, ...rest] = refKey.split(':');
  const id = rest.join(':');
  if (!id) return null;
  if (prefix === 'kitchen') return { type: 'kitchen', id };
  if (prefix === 'creator') return { type: 'creator', id };
  if (prefix === 'mealdb') return { type: 'mealdb', id };
  return null;
}

// ---------------------------------------------------------------- save target

/** Everything needed to save one thing. Build it with saveTargetForRecipe / saveTargetForCreatorVideo. */
export type SaveTarget = {
  refKey: string;
  sourceType: Exclude<SavedSourceType, 'mealdb'>;
  title: string;
  imageUrl: string | null;
  kitchenRecipeId: string | null;
  creatorVideoId: string | null;
  creatorWatchUrl: string | null;
  preview: Record<string, unknown>;
  link: SavedLink;
};

/** The recipe fields saveTargetForRecipe needs (SearchableRecipe has them all; so can a detail page). */
export type SaveableRecipe = Pick<SearchableRecipe, 'routeId' | 'table' | 'uuid' | 'legacyId' | 'title' | 'imageUrl'> &
  Partial<Pick<SearchableRecipe, 'subtitle' | 'description' | 'servings' | 'minutes' | 'ingredients'>> & {
    steps?: readonly string[];
  };

/**
 * For a recipes or library_recipes row. `legacyId` is the old app's id (see SearchableRecipe).
 * A detail page without it can pass the slug: recipes `slug ?? uuid`, library `"library-" + slug`.
 */
export function saveTargetForRecipe(recipe: SaveableRecipe): SaveTarget {
  const legacyId = recipe.legacyId.trim();
  if (!legacyId) throw new DataError('invalid', "This recipe can't be saved.");
  return {
    refKey: savedRefKeyKitchen(legacyId),
    sourceType: 'kitchen',
    title: recipe.title,
    imageUrl: recipe.imageUrl,
    kitchenRecipeId: recipe.table === 'recipes' && isUuid(recipe.uuid) ? recipe.uuid : null,
    creatorVideoId: null,
    creatorWatchUrl: null,
    // The old app's preview shape (NormalizedRecipeShape), so its My Recipes can show it too.
    preview: {
      kind: 'mealdb',
      shape: {
        id: legacyId,
        name: recipe.title,
        tag: recipe.subtitle ?? '',
        description: recipe.description ?? '',
        servings: recipe.servings ?? 4,
        minutes: recipe.minutes ?? 0,
        ingredients: (recipe.ingredients ?? []).map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
        steps: [...(recipe.steps ?? [])],
        isMaster: recipe.table === 'library_recipes',
        imageUrl: recipe.imageUrl,
      },
      appRoute: recipe.routeId,
    },
    link: { kind: 'recipe', routeId: recipe.routeId },
  };
}

/** For a creator video. The preview matches the old app's creator item (ViralRecipeLinkItem). */
export function saveTargetForCreatorVideo(video: Pick<CreatorVideo, 'videoId' | 'channelId' | 'title' | 'thumbnailUrl' | 'watch' | 'creatorName' | 'viewCount' | 'publishedAt'>): SaveTarget {
  return {
    refKey: savedRefKeyCreator(video.videoId),
    sourceType: 'creator_video',
    title: video.title,
    imageUrl: video.thumbnailUrl,
    kitchenRecipeId: null,
    creatorVideoId: video.videoId,
    creatorWatchUrl: video.watch.url,
    preview: {
      kind: 'creator',
      item: {
        videoId: video.videoId,
        category: 'quick',
        title: video.title,
        thumbnailUrl: video.thumbnailUrl ?? '',
        channelId: video.channelId,
        channelTitle: video.creatorName,
        channelUrl: '',
        watchUrl: video.watch.url,
        viewCount: video.viewCount,
        publishedAt: video.publishedAt,
      },
    },
    link: { kind: 'video', url: video.watch.url, label: video.watch.label },
  };
}

/** A target for an item already on the saved list (used to remove it from that list). */
export function saveTargetFromSaved(saved: SavedRecipe): SaveTarget {
  return {
    refKey: saved.refKey,
    sourceType: saved.sourceType === 'creator_video' ? 'creator_video' : 'kitchen',
    title: saved.title,
    imageUrl: saved.imageUrl,
    kitchenRecipeId: saved.kitchenRecipeId,
    creatorVideoId: null,
    creatorWatchUrl: saved.link.kind === 'video' ? saved.link.url : null,
    preview: {},
    link: saved.link,
  };
}

/** The columns sent when saving (upsert on user_id + ref_key). */
export function savedInsertColumns(userId: string, target: SaveTarget) {
  return {
    user_id: userId,
    ref_key: target.refKey,
    source_type: target.sourceType,
    kitchen_recipe_id: target.kitchenRecipeId,
    creator_video_id: target.creatorVideoId,
    creator_watch_url: target.creatorWatchUrl,
    mealdb_id: null,
    title: target.title.slice(0, 500),
    image_url: target.imageUrl,
    preview: target.preview,
  };
}

/** What shows while the save is on its way. Replaced by the server's row. */
export function placeholderSaved(id: string, target: SaveTarget, now: string = new Date().toISOString()): SavedRecipe {
  return {
    id,
    refKey: target.refKey,
    sourceType: target.sourceType,
    title: target.title,
    imageUrl: target.imageUrl,
    savedAt: now,
    kitchenRecipeId: target.kitchenRecipeId,
    link: target.link,
  };
}

/** Is this saved row the same thing as the target? Same key, or the same recipes row by uuid. */
export function savedMatchesTarget(saved: Pick<SavedRecipe, 'refKey' | 'kitchenRecipeId'>, target: Pick<SaveTarget, 'refKey' | 'kitchenRecipeId'>): boolean {
  if (saved.refKey === target.refKey) return true;
  return target.kitchenRecipeId !== null && saved.kitchenRecipeId === target.kitchenRecipeId;
}

export function isTargetSaved(list: readonly SavedRecipe[] | undefined, target: SaveTarget): boolean {
  return !!list && list.some((saved) => savedMatchesTarget(saved, target));
}

/** The keys to delete when unsaving: the target's, plus any older row for the same recipe. */
export function refKeysToRemove(list: readonly SavedRecipe[] | undefined, target: SaveTarget): string[] {
  const keys = new Set<string>([target.refKey]);
  for (const saved of list ?? []) if (savedMatchesTarget(saved, target)) keys.add(saved.refKey);
  return [...keys];
}

/** Optimistic unsave: drops every row for the target; undo puts back only those rows, in place. */
export function removeMatching(target: Pick<SaveTarget, 'refKey' | 'kitchenRecipeId'>): ListChange<SavedRecipe> {
  return {
    apply: (list) => list.filter((saved) => !savedMatchesTarget(saved, target)),
    revert: (current, snapshot) => {
      const present = new Set(current.map((s) => s.id));
      const next = [...current];
      snapshot.forEach((saved, index) => {
        if (!savedMatchesTarget(saved, target) || present.has(saved.id)) return;
        next.splice(Math.min(index, next.length), 0, saved);
      });
      return next;
    },
  };
}

// --------------------------------------------------------------------- reading

/** Slugs to look up for rows saved by the old app without a uuid (library and slugged recipes). */
export type SlugLookup = {
  recipes: ReadonlyMap<string, string>; // slug -> uuid
  library: ReadonlyMap<string, string>; // slug -> uuid
};

const EMPTY_LOOKUP: SlugLookup = { recipes: new Map(), library: new Map() };

function previewObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function sourceType(raw: string, refKey: string): SavedSourceType {
  if (raw === 'kitchen' || raw === 'creator_video' || raw === 'mealdb') return raw;
  const parsed = parseSavedRefKey(refKey);
  if (parsed?.type === 'creator') return 'creator_video';
  if (parsed?.type === 'mealdb') return 'mealdb';
  return 'kitchen';
}

/** The slugs this row needs looked up before it can link (empty when it links without one). */
export function slugsToResolve(row: Pick<SavedRecipeRow, 'ref_key' | 'source_type' | 'kitchen_recipe_id' | 'preview'>): {
  recipes: string[];
  library: string[];
} {
  const none = { recipes: [], library: [] };
  if (sourceType(row.source_type, row.ref_key) !== 'kitchen') return none;
  if (isUuid(row.kitchen_recipe_id)) return none;
  const route = previewObject(row.preview).appRoute;
  if (typeof route === 'string' && parseRecipeRouteId(route)) return none;
  const id = parseSavedRefKey(row.ref_key)?.id ?? '';
  if (!id || isUuid(id)) return none;
  if (id.startsWith(LEGACY_LIBRARY_PREFIX)) {
    const slug = id.slice(LEGACY_LIBRARY_PREFIX.length);
    return slug ? { recipes: [], library: [slug] } : none;
  }
  return { recipes: [id], library: [] };
}

/** Where a saved row leads. Rows from the old app with no match in the new app lead nowhere. */
export function savedLinkFromRow(row: SavedRecipeRow, lookup: SlugLookup = EMPTY_LOOKUP): SavedLink {
  const type = sourceType(row.source_type, row.ref_key);
  if (type === 'creator_video') {
    const preview = previewObject(row.preview);
    const item = previewObject(preview.item);
    const watch = watchLink(row.creator_watch_url) ?? watchLink(typeof item.watchUrl === 'string' ? item.watchUrl : null);
    return watch ? { kind: 'video', url: watch.url, label: watch.label } : { kind: 'none' };
  }
  if (type === 'mealdb') return { kind: 'none' };

  const route = previewObject(row.preview).appRoute;
  if (typeof route === 'string') {
    const parsed = parseRecipeRouteId(route);
    if (parsed) return { kind: 'recipe', routeId: `${parsed.table === 'recipes' ? 'r' : 'l'}_${parsed.uuid}` };
  }
  const kitchenId = asUuid(row.kitchen_recipe_id);
  if (kitchenId) return { kind: 'recipe', routeId: `r_${kitchenId}` };
  const id = parseSavedRefKey(row.ref_key)?.id ?? '';
  if (isUuid(id)) return { kind: 'recipe', routeId: `r_${id.toLowerCase()}` };
  if (id.startsWith(LEGACY_LIBRARY_PREFIX)) {
    const uuid = lookup.library.get(id.slice(LEGACY_LIBRARY_PREFIX.length));
    return uuid ? { kind: 'recipe', routeId: `l_${uuid}` } : { kind: 'none' };
  }
  const uuid = id ? lookup.recipes.get(id) : undefined;
  return uuid ? { kind: 'recipe', routeId: `r_${uuid}` } : { kind: 'none' };
}

export function savedRecipeFromRow(row: SavedRecipeRow, lookup: SlugLookup = EMPTY_LOOKUP): SavedRecipe {
  return {
    id: row.id,
    refKey: row.ref_key,
    sourceType: sourceType(row.source_type, row.ref_key),
    title: cleanVideoTitle(row.title),
    imageUrl: imageAddress(row.image_url),
    savedAt: row.created_at,
    kitchenRecipeId: asUuid(row.kitchen_recipe_id),
    link: savedLinkFromRow(row, lookup),
  };
}
