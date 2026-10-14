import type { RecipeImportSourceType } from './urlClassification.ts';

export interface RecipeImportIngredient {
  name: string;
  quantity: number;
  unit: string;
  note?: string;
}

export interface RecipeImportExtracted {
  title: string;
  servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: RecipeImportIngredient[];
  steps: string[];
  is_recipe: boolean;
  confidence: number;
  source_url: string;
  source_type: RecipeImportSourceType;
  /** Web pages only — never persist YouTube video titles long-term. */
  source_title?: string;
  youtube_channel_name?: string | null;
  youtube_channel_url?: string | null;
  metadata_refreshed_at?: string;
  social_author_name?: string | null;
  social_author_url?: string | null;
  /** Optional credited link to author's public recipe (never copied). */
  author_public_recipe_url?: string | null;
  /** HTTPS cover image (YouTube thumbnail, og:image, oEmbed thumbnail). */
  image_url?: string | null;
}

export const GEMINI_RECIPE_IMPORT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    servings: { type: 'integer' },
    prep_minutes: { type: ['integer', 'null'] },
    cook_minutes: { type: ['integer', 'null'] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          note: { type: ['string', 'null'] },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    is_recipe: { type: 'boolean' },
    confidence: { type: 'number' },
    youtube_channel_name: { type: ['string', 'null'] },
    cookbook_author_name: { type: ['string', 'null'] },
    cookbook_title_guess: { type: ['string', 'null'] },
  },
  required: ['title', 'servings', 'ingredients', 'steps', 'is_recipe', 'confidence'],
};

export function validateGeminiRecipeImportPayload(raw: unknown): RecipeImportExtracted | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) return null;

  const servings =
    typeof obj.servings === 'number' && Number.isFinite(obj.servings)
      ? Math.max(1, Math.round(obj.servings))
      : 4;

  const prep_minutes =
    typeof obj.prep_minutes === 'number' && Number.isFinite(obj.prep_minutes)
      ? Math.max(0, Math.round(obj.prep_minutes))
      : null;
  const cook_minutes =
    typeof obj.cook_minutes === 'number' && Number.isFinite(obj.cook_minutes)
      ? Math.max(0, Math.round(obj.cook_minutes))
      : null;

  const ingredients: RecipeImportIngredient[] = [];
  if (Array.isArray(obj.ingredients)) {
    for (const entry of obj.ingredients) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) continue;
      const quantity =
        typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : 1;
      const unit = typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : 'each';
      const note =
        typeof row.note === 'string' && row.note.trim() ? row.note.trim() : undefined;
      ingredients.push({ name, quantity, unit, note });
    }
  }

  const steps: string[] = [];
  if (Array.isArray(obj.steps)) {
    for (const step of obj.steps) {
      if (typeof step === 'string' && step.trim()) steps.push(step.trim());
    }
  }

  const is_recipe = obj.is_recipe === true;
  const confidence =
    typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
      ? Math.min(1, Math.max(0, obj.confidence))
      : 0.5;

  const youtube_channel_name =
    typeof obj.youtube_channel_name === 'string' && obj.youtube_channel_name.trim()
      ? obj.youtube_channel_name.trim()
      : null;

  return {
    title,
    servings,
    prep_minutes,
    cook_minutes,
    ingredients,
    steps,
    is_recipe,
    confidence,
    source_url: '',
    source_type: 'web',
    youtube_channel_name,
  };
}

export function attachImportMetadata(
  recipe: RecipeImportExtracted,
  sourceUrl: string,
  sourceType: RecipeImportSourceType,
  extras?: {
    socialAuthorName?: string | null;
    socialAuthorUrl?: string | null;
    authorPublicRecipeUrl?: string | null;
  },
): RecipeImportExtracted {
  const now = new Date().toISOString();
  const base: RecipeImportExtracted = {
    ...recipe,
    source_url: sourceUrl,
    source_type: sourceType,
    social_author_name: extras?.socialAuthorName ?? null,
    social_author_url: extras?.socialAuthorUrl ?? null,
    author_public_recipe_url: extras?.authorPublicRecipeUrl ?? null,
  };
  if (sourceType === 'youtube') {
    return {
      ...base,
      source_title: undefined,
      metadata_refreshed_at: now,
    };
  }
  if (
    sourceType === 'tiktok' ||
    sourceType === 'instagram' ||
    sourceType === 'facebook' ||
    sourceType === 'reddit'
  ) {
    return {
      ...base,
      source_title: undefined,
      youtube_channel_name: null,
    };
  }
  if (sourceType === 'photo' || sourceType === 'video') {
    return {
      ...base,
      source_title: undefined,
      youtube_channel_name: null,
      source_url: sourceUrl || 'photo-scan',
    };
  }
  return base;
}

export function readCookbookAuthorHints(raw: unknown): {
  authorName: string | null;
  titleGuess: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { authorName: null, titleGuess: null };
  }
  const obj = raw as Record<string, unknown>;
  const authorName =
    typeof obj.cookbook_author_name === 'string' && obj.cookbook_author_name.trim()
      ? obj.cookbook_author_name.trim()
      : null;
  const titleGuess =
    typeof obj.cookbook_title_guess === 'string' && obj.cookbook_title_guess.trim()
      ? obj.cookbook_title_guess.trim()
      : null;
  return { authorName, titleGuess };
}
