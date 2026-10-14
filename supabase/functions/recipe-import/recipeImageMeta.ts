/** Cover image URLs for imported recipes (YouTube, web og:image, social oEmbed). */

import type { RecipeImportExtracted } from './recipeImportSchema.ts';
import type { RecipeImportSourceType } from './urlClassification.ts';
import { resolveAndSanitizeHttpUrl, sanitizeHttpUrl } from './safeHttpUrl.ts';
import { youtubeVideoIdFromImportUrl } from './youtubeCreatorMeta.ts';

export function youtubeHqDefaultThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId.trim()}/hqdefault.jpg`;
}

function readMetaContent(html: string, attr: 'property' | 'name', key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = html.match(pattern)?.[0];
  if (!tag) return null;
  const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
  return content?.trim() ? content.trim() : null;
}

export function extractOgImageFromHtml(html: string, pageUrl: string): string | null {
  const raw =
    readMetaContent(html, 'property', 'og:image') ??
    readMetaContent(html, 'property', 'og:image:url') ??
    readMetaContent(html, 'name', 'twitter:image');
  if (!raw) return null;
  return resolveAndSanitizeHttpUrl(raw, pageUrl);
}

export function parseYouTubeOembedThumbnailUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const thumb =
    typeof obj.thumbnail_url === 'string' && obj.thumbnail_url.trim()
      ? obj.thumbnail_url.trim()
      : null;
  return sanitizeHttpUrl(thumb);
}

export function resolveYouTubeImportImageUrl(
  normalizedUrl: string,
  watchUrl: string,
  oembedThumbnail?: string | null,
): string | null {
  const fromOembed = sanitizeImportImageUrl(oembedThumbnail, watchUrl);
  if (fromOembed) return fromOembed;
  const videoId = youtubeVideoIdFromImportUrl(normalizedUrl) ?? youtubeVideoIdFromImportUrl(watchUrl);
  if (videoId) return youtubeHqDefaultThumbnailUrl(videoId);
  return null;
}

export function sanitizeImportImageUrl(
  url: string | null | undefined,
  pageUrl?: string | null,
): string | null {
  if (url == null || !url.trim()) return null;
  if (pageUrl?.trim()) {
    const resolved = resolveAndSanitizeHttpUrl(url, pageUrl);
    if (resolved) return resolved;
  }
  return sanitizeHttpUrl(url);
}

export function withImportImageUrl(
  recipe: RecipeImportExtracted,
  imageUrl: string | null | undefined,
  pageUrl?: string | null,
): RecipeImportExtracted {
  const safe = sanitizeImportImageUrl(imageUrl, pageUrl);
  if (!safe) return recipe;
  return { ...recipe, image_url: safe };
}

export function imageUrlForCachedImport(
  recipe: RecipeImportExtracted,
  sourceType: RecipeImportSourceType,
  normalizedUrl: string,
): string | null {
  const stored = sanitizeHttpUrl(recipe.image_url);
  if (stored) return stored;
  if (sourceType === 'youtube') {
    return resolveYouTubeImportImageUrl(normalizedUrl, normalizedUrl, null);
  }
  return null;
}
