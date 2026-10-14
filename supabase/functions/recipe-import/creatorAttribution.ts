import type { RecipeImportExtracted } from './recipeImportSchema.ts';
import type { RecipeImportSourceType } from './urlClassification.ts';
import { extractPageAuthorFromHtml } from './pageAuthorMeta.ts';
import { sanitizeHttpUrl } from './safeHttpUrl.ts';
import { resolveYouTubeCreatorMeta } from './youtubeCreatorMeta.ts';

export function recipeMissingCreatorFields(
  recipe: RecipeImportExtracted,
  sourceType: RecipeImportSourceType,
): boolean {
  if (sourceType === 'youtube') {
    return !recipe.youtube_channel_name?.trim() || !recipe.youtube_channel_url?.trim();
  }
  if (
    sourceType === 'tiktok' ||
    sourceType === 'instagram' ||
    sourceType === 'facebook' ||
    sourceType === 'reddit' ||
    sourceType === 'web'
  ) {
    return !recipe.social_author_name?.trim();
  }
  return false;
}

export function applyYouTubeCreatorMeta(
  recipe: RecipeImportExtracted,
  meta: { channelName: string; channelUrl: string },
): RecipeImportExtracted {
  const now = new Date().toISOString();
  const channelUrl = sanitizeHttpUrl(meta.channelUrl);
  return {
    ...recipe,
    youtube_channel_name: meta.channelName,
    youtube_channel_url: channelUrl,
    metadata_refreshed_at: now,
    social_author_name: meta.channelName,
    social_author_url: channelUrl,
  };
}

export function applySocialAuthorMeta(
  recipe: RecipeImportExtracted,
  meta: { authorName: string; authorUrl: string | null },
): RecipeImportExtracted {
  const authorUrl =
    sanitizeHttpUrl(meta.authorUrl) ?? sanitizeHttpUrl(recipe.source_url);
  return {
    ...recipe,
    social_author_name: meta.authorName,
    social_author_url: authorUrl,
  };
}

export async function enrichYouTubeRecipeCreator(
  recipe: RecipeImportExtracted,
  normalizedUrl: string,
  watchUrl: string,
): Promise<RecipeImportExtracted> {
  if (!recipeMissingCreatorFields(recipe, 'youtube')) return recipe;
  const meta = await resolveYouTubeCreatorMeta(normalizedUrl, watchUrl);
  if (!meta) return recipe;
  return applyYouTubeCreatorMeta(recipe, meta);
}

export async function enrichWebRecipeCreator(
  recipe: RecipeImportExtracted,
  html: string,
): Promise<RecipeImportExtracted> {
  if (!recipeMissingCreatorFields(recipe, 'web')) return recipe;
  const pageUrl = recipe.source_url?.trim();
  if (!pageUrl) return recipe;
  const meta = extractPageAuthorFromHtml(html, pageUrl);
  if (!meta) return recipe;
  return applySocialAuthorMeta(recipe, meta);
}
