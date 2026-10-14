/**
 * The review step: the imported recipe as an editable draft, the source credit, and the
 * `recipes` row it becomes. The row is built field for field as the old app's
 * upsertLinkImportedRecipe (mobile/lib/supabaseData.ts) with mapExtractedImportToRecipe
 * (mobile/lib/recipeImport/mapToAppRecipe.ts): the person's own private copy
 * (is_master false, created_by = them), with the creator credit in the source_* columns.
 * Pure functions only (tests/recipe-import-draft.test.ts).
 */
import type { PantryCategory } from '../../kitchen/categories';
import { inferGroceryCategoryFromName } from '../../kitchen/categorize';
import { normalizeIngredientName } from '../../kitchen/ingredientNormalize';
import type { ImportedRecipe, ImportSourceType } from './request';
import { safeHttpUrl } from './urlInput';

export type DraftIngredient = { key: string; name: string; quantity: string; unit: string; note?: string };
export type DraftStep = { key: string; text: string };

export type RecipeDraft = {
  title: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  /** The function's answer, kept for the credit and source columns (not edited). */
  source: ImportedRecipe;
};

const numberText = (n: number | null): string => (n === null ? '' : String(n));

export function draftFromImport(recipe: ImportedRecipe): RecipeDraft {
  return {
    title: recipe.title,
    servings: String(recipe.servings),
    prepMinutes: numberText(recipe.prepMinutes),
    cookMinutes: numberText(recipe.cookMinutes),
    ingredients: recipe.ingredients.map((ing, i) => ({
      key: `i${i}`,
      name: ing.name,
      quantity: String(ing.quantity),
      unit: ing.unit,
      ...(ing.note ? { note: ing.note } : {}),
    })),
    steps: recipe.steps.map((text, i) => ({ key: `s${i}`, text })),
    source: recipe,
  };
}

export type DraftField = 'title' | 'servings' | 'prepMinutes' | 'cookMinutes';

export function editDraftField(draft: RecipeDraft, field: DraftField, value: string): RecipeDraft {
  return { ...draft, [field]: value };
}

export function editIngredient(draft: RecipeDraft, key: string, change: Partial<Pick<DraftIngredient, 'name' | 'quantity' | 'unit'>>): RecipeDraft {
  return { ...draft, ingredients: draft.ingredients.map((ing) => (ing.key === key ? { ...ing, ...change } : ing)) };
}

export function removeIngredient(draft: RecipeDraft, key: string): RecipeDraft {
  return { ...draft, ingredients: draft.ingredients.filter((ing) => ing.key !== key) };
}

export function editStep(draft: RecipeDraft, key: string, text: string): RecipeDraft {
  return { ...draft, steps: draft.steps.map((s) => (s.key === key ? { ...s, text } : s)) };
}

export function removeStep(draft: RecipeDraft, key: string): RecipeDraft {
  return { ...draft, steps: draft.steps.filter((s) => s.key !== key) };
}

// ------------------------------------------------------------------- checking

/** A whole number from the field, or null for blank. NaN means "not a number". */
function wholeFrom(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  return /^\d{1,4}$/.test(t) ? Number(t) : Number.NaN;
}

function quantityFrom(text: string): number {
  const t = text.trim().replace(',', '.');
  if (!t) return Number.NaN;
  if (/^\d+\s*\/\s*\d+$/.test(t)) {
    const [a, b] = t.split('/').map((p) => Number(p.trim()));
    return b ? a! / b : Number.NaN;
  }
  if (/^\d+\s+\d+\s*\/\s*\d+$/.test(t)) {
    const [whole, frac] = t.split(/\s+(?=\d+\s*\/)/);
    const [a, b] = frac!.split('/').map((p) => Number(p.trim()));
    return b ? Number(whole) + a! / b : Number.NaN;
  }
  return /^\d*\.?\d+$/.test(t) ? Number(t) : Number.NaN;
}

export type DraftProblems = Record<string, string>;

/** Problems keyed by field ('title', 'servings', ..., or an ingredient/step key). Empty: ready to save. */
export function draftProblems(draft: RecipeDraft): DraftProblems {
  const problems: DraftProblems = {};
  if (!draft.title.trim()) problems.title = 'Give the recipe a name.';
  const servings = wholeFrom(draft.servings);
  if (servings === null || Number.isNaN(servings) || servings < 1 || servings > 99) problems.servings = 'Servings is a whole number from 1 to 99.';
  for (const field of ['prepMinutes', 'cookMinutes'] as const) {
    const n = wholeFrom(draft[field]);
    if (n !== null && (Number.isNaN(n) || n > 2880)) problems[field] = 'Minutes is a whole number, or leave it blank.';
  }
  for (const ing of draft.ingredients) {
    if (!ing.name.trim()) problems[ing.key] = 'Name this ingredient or remove it.';
    else {
      const q = quantityFrom(ing.quantity);
      if (Number.isNaN(q) || q < 0 || q > 9999) problems[ing.key] = 'Amount is a number like 2, 0.5 or 1/2.';
    }
  }
  for (const step of draft.steps) if (!step.text.trim()) problems[step.key] = 'Write this step or remove it.';
  if (draft.ingredients.length === 0 && draft.steps.length === 0) problems.content = 'Keep at least one ingredient or step.';
  return problems;
}

// ------------------------------------------------------------------- credit

export type SourceCredit = { creatorLine: string | null; creatorUrl: string | null; originalUrl: string | null };

/** "Recipe video by X", "Recipe from @x" or "By X", plus the links, as the old review sheet shows them. */
export function sourceCredit(recipe: ImportedRecipe): SourceCredit {
  const originalUrl = safeHttpUrl(recipe.sourceUrl);
  if (recipe.sourceType === 'youtube') {
    const name = recipe.youtubeChannelName ?? recipe.socialAuthorName;
    return {
      creatorLine: name ? `Recipe video by ${name}` : originalUrl ? 'Recipe video on YouTube' : null,
      creatorUrl: safeHttpUrl(recipe.youtubeChannelUrl) ?? safeHttpUrl(recipe.socialAuthorUrl),
      originalUrl,
    };
  }
  const name = recipe.socialAuthorName ?? recipe.sourceTitle;
  const social = recipe.sourceType === 'tiktok' || recipe.sourceType === 'instagram' || recipe.sourceType === 'facebook';
  return {
    creatorLine: name ? (social ? `Recipe from ${name}` : `By ${name}`) : null,
    creatorUrl: safeHttpUrl(recipe.socialAuthorUrl),
    originalUrl,
  };
}

// ------------------------------------------------------------------- the row

const TAG_BY_SOURCE: Record<ImportSourceType, string> = {
  youtube: 'Imported · YouTube',
  web: 'Imported · Web',
  tiktok: 'Imported · TikTok',
  instagram: 'Imported · Instagram',
  facebook: 'Imported · Facebook',
  reddit: 'Imported · Reddit',
  photo: 'Imported · Photo',
  video: 'Imported · Video',
};

const DESCRIPTION_BY_SOURCE: Record<ImportSourceType, string> = {
  youtube: 'Imported from a YouTube cooking video and saved in your own words.',
  web: 'Imported from a recipe page and saved in your own words.',
  tiktok: 'Imported from a TikTok post and saved in your own words.',
  instagram: 'Imported from an Instagram caption and saved in your own words.',
  facebook: 'Imported from a Facebook post and saved in your own words.',
  reddit: 'Imported from a Reddit post and saved in your own words.',
  photo: 'Imported from your recipe photos and saved in your own words.',
  video: 'Imported from your saved cooking video and saved in your own words.',
};

/** `recipes.source_type` check: these, or null. */
const ROW_SOURCE_TYPES: readonly string[] = ['youtube', 'web', 'tiktok', 'instagram', 'facebook', 'photo', 'video'];

function hash36(text: string): string {
  return text
    .split('')
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0)
    .toString(36);
}

/**
 * The row's slug (unique). A link import keeps the old app's slug (link-import-<user>-<hash of the
 * link>), so importing the same link again refreshes the person's earlier copy instead of making a
 * second one. Everything without a real link (pasted text, photos, a video) gets a fresh slug each
 * time; the old app gave every pasted text the same slug, so a second text import overwrote the first.
 */
export function importSlug(userId: string, recipe: Pick<ImportedRecipe, 'sourceUrl' | 'sourceType' | 'title'>, now: number): string {
  const userPart = userId.slice(0, 8);
  if (recipe.sourceType !== 'photo' && recipe.sourceType !== 'video' && safeHttpUrl(recipe.sourceUrl)) {
    return `link-import-${userPart}-${hash36(recipe.sourceUrl.trim().toLowerCase())}`;
  }
  return `photo-import-${userPart}-${hash36(`${recipe.title.trim().toLowerCase()}-${now}`)}`;
}

/** The old app's mapIngredientCategory (recipeDiscovery/mapToAppRecipe.ts) with the note as the hint. */
export function ingredientCategory(name: string, note?: string): PantryCategory {
  const fromName = inferGroceryCategoryFromName(name);
  const c = [note, name].filter(Boolean).join(' ').toLowerCase();
  if (c.includes('spice') || c.includes('herb')) return 'spices';
  if (c.includes('meat') || c.includes('fish') || c.includes('seafood') || c.includes('poultry')) return 'meats';
  if (fromName === 'dry_goods') return 'dry_goods';
  if (
    c.includes('vegetable') ||
    c.includes('fruit') ||
    c.includes('produce') ||
    /\b(broccoli|asparagus|kale|spinach|lettuce|tomato|onion|pepper|carrot|celery|squash|zucchini)\b/.test(c)
  ) {
    return 'produce';
  }
  if (c.includes('dairy') || c.includes('cheese') || c.includes('milk')) return 'dairy';
  if (c.includes('frozen')) return 'frozen';
  if (c.includes('condiment') || c.includes('sauce')) return 'condiments';
  return fromName;
}

/** One `recipes.ingredients` entry, in the shape the old app stores ({ ingredientId, name, quantity, unit, notes }). */
export type RecipeIngredientJson = { ingredientId: string; name: string; quantity: number; unit: string; notes: PantryCategory };

export type RecipeInsert = {
  slug: string;
  name: string;
  description: string;
  tag: string;
  servings: number;
  minutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: RecipeIngredientJson[];
  steps: string[];
  is_master: false;
  created_by: string;
  source_url: string | null;
  source_type: string | null;
  source_title: string | null;
  source_channel_name: string | null;
  source_channel_url: string | null;
  source_author_url: string | null;
  source_metadata_refreshed_at: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  image_url: string | null;
  nutrition_source: string;
  nutrition_citation: string;
  nutrition_sourced_at: string | null;
};

/** The row to save. Call only when draftProblems(draft) is empty. */
export function recipeInsertFromDraft(draft: RecipeDraft, userId: string, now: number = Date.now()): RecipeInsert {
  const src = draft.source;
  const title = draft.title.trim().slice(0, 200);
  const prep = wholeFrom(draft.prepMinutes);
  const cook = wholeFrom(draft.cookMinutes);
  const prepMinutes = prep === null || Number.isNaN(prep) ? null : prep;
  const cookMinutes = cook === null || Number.isNaN(cook) ? null : cook;
  const total = (prepMinutes ?? 0) + (cookMinutes ?? 0);
  const servings = wholeFrom(draft.servings);
  const slug = importSlug(userId, { sourceUrl: src.sourceUrl, sourceType: src.sourceType, title }, now);
  const idPrefix = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'recipe';
  const youtube = src.sourceType === 'youtube';

  return {
    slug,
    name: title,
    description: DESCRIPTION_BY_SOURCE[src.sourceType],
    tag: TAG_BY_SOURCE[src.sourceType],
    servings: servings && !Number.isNaN(servings) ? Math.max(1, servings) : 1,
    minutes: Math.max(1, total > 0 ? total : 30),
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    ingredients: draft.ingredients.map((ing) => {
      const name = ing.name.trim();
      const note = ing.note?.trim();
      const slugPart = normalizeIngredientName(name).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return {
        ingredientId: `${idPrefix}-${slugPart || 'item'}`,
        name: note ? `${name} (${note})` : name,
        quantity: quantityFrom(ing.quantity),
        unit: ing.unit.trim() || 'each',
        notes: ingredientCategory(name, note),
      };
    }),
    steps: draft.steps.map((s) => s.text.trim()),
    is_master: false,
    created_by: userId,
    source_url: src.sourceUrl || null,
    source_type: ROW_SOURCE_TYPES.includes(src.sourceType) ? src.sourceType : null,
    source_title: youtube ? null : src.socialAuthorName ?? src.sourceTitle,
    source_channel_name: youtube ? src.youtubeChannelName : null,
    source_channel_url: youtube ? src.youtubeChannelUrl ?? src.socialAuthorUrl : null,
    source_author_url: youtube ? null : src.socialAuthorUrl,
    source_metadata_refreshed_at: null,
    prep_minutes: prepMinutes,
    cook_minutes: cookMinutes,
    image_url: safeHttpUrl(src.imageUrl),
    nutrition_source: 'Link import',
    nutrition_citation: '',
    nutrition_sourced_at: null,
  };
}

/** The detail route's id for a `recipes` row. */
export const recipeRoute = (rowId: string) => `/recipe/r_${rowId}` as const;
