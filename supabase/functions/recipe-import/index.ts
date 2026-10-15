// Recipe import — deploy folder recipe-import (Verify JWT ENABLED).
//
// Link (YouTube/web/TikTok oEmbed/IG/FB caption), photo scan, uploaded video, screenshots,
// YouTube search fallback. Secrets: GEMINI_API_KEY, optional YOUTUBE_API_KEY, GEMINI_MODEL,
// optional PLAN_LIMITS_OVERRIDE (see _shared/planTiers.ts).
//
// Every plan has a monthly number of imports (importAllowance.ts). Needs SQL migration
// 20261011180000_plan_tiers.sql; without it imports run uncounted, as before.

import {
  canonicalYouTubeWatchUrl,
  classifyRecipeImportUrl,
  isManualCaptionSourceType,
  normalizeImportUrl,
  type RecipeImportSourceType,
  urlHashKey,
} from './urlClassification.ts';
import { orderImportFallbackSteps, type ImportFallbackStep } from './fallbackChain.ts';
import { claimImport, importCounts, importLimitBody, refundImport } from './importAllowance.ts';
import { fetchTikTokOembed } from './tiktokOembed.ts';
import { searchYoutubeRecipeVideo, type YoutubeSearchSuggestion } from './youtubeSearch.ts';
import {
  extractRecipeFromPageText,
  extractRecipeFromPhotos,
  extractRecipeFromScreenshots,
  extractRecipeFromUploadedVideo,
  extractRecipeFromYouTubeVideo,
} from './geminiRecipeExtract.ts';
import {
  findRecipeJsonLdInHtml,
  recipeJsonLdToExtracted,
  stripHtmlToText,
} from './jsonLdParser.ts';
import type { RecipeImportExtracted } from './recipeImportSchema.ts';
import {
  buildGeminiPartsForVideo,
  cleanupStaleUserImportUploads,
  deleteGeminiFile,
  deleteUserImportObject,
  downloadUserImportImages,
  downloadUserImportObject,
  shouldUseGeminiFileApi,
  uploadVideoToGeminiFiles,
  validatePhotoStoragePaths,
  validateUserImportStoragePath,
  type ImportImagePayload,
} from './importMedia.ts';
import {
  RECIPE_FETCH_MAX_REDIRECTS,
  resolveRedirectLocation,
  validatePublicHttpFetchUrl,
} from './ssrfGuard.ts';
import { tryAutoImportFromYoutubeSearch } from './autoYoutubeFallback.ts';
import {
  enrichWebRecipeCreator,
  enrichYouTubeRecipeCreator,
  recipeMissingCreatorFields,
} from './creatorAttribution.ts';
import {
  extractOgImageFromHtml,
  imageUrlForCachedImport,
  resolveYouTubeImportImageUrl,
  withImportImageUrl,
} from './recipeImageMeta.ts';
import { parseRuleBasedRecipeFromText } from './textRecipeParse.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_WINDOW_MS = 60_000;
const USER_MAX_PER_WINDOW = 10;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WEB_FETCH_TIMEOUT_MS = 12_000;
const WEB_MAX_BYTES = 1_500_000;
const WEB_MAX_TEXT_CHARS = 48_000;
const MAX_IMPORT_IMAGES = 4;
const FETCH_USER_AGENT = 'MealPlanaticRecipeImport/1.0 (+https://mealplanatic.app; recipe-importer)';

const userHits = new Map<string, { count: number; windowStart: number }>();

type ImportRequestAction = 'link' | 'confirm_youtube' | 'photo' | 'video' | 'screenshot' | 'text';

interface ImportRequestBody {
  action?: ImportRequestAction;
  url?: string;
  text?: string;
  captionText?: string;
  youtubeUrl?: string;
  videoStoragePath?: string;
  photoStoragePaths?: string[];
  images?: Array<{ mimeType?: string; data?: string }>;
  /** Skip shared recipe_import_cache (Reddit-sourced / private user imports). */
  private_import?: boolean;
}

interface ImportFallbacksPayload {
  steps: ImportFallbackStep[];
  youtubeSuggestion: YoutubeSearchSuggestion | null;
  message: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function checkUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = userHits.get(userId);
  if (!bucket || now - bucket.windowStart > USER_WINDOW_MS) {
    userHits.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= USER_MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

function userIdFromJwt(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { sub?: string };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readImportCache(urlKey: string): Promise<RecipeImportExtracted | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;

  const hash = await sha256Hex(urlKey);
  const query = `${supabaseUrl}/rest/v1/recipe_import_cache?url_hash=eq.${encodeURIComponent(hash)}&select=payload,expires_at`;
  const response = await fetch(query, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ payload: RecipeImportExtracted; expires_at: string }>;
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.payload;
}

function shouldSkipSharedImportCache(body: ImportRequestBody, normalizedUrl?: string | null): boolean {
  if (body.private_import === true) return true;
  const blob = `${body.text ?? ''}${body.captionText ?? ''}`.toLowerCase();
  if (blob.includes('reddit.com') || blob.includes('redd.it')) return true;
  if (normalizedUrl && classifyRecipeImportUrl(normalizedUrl) === 'reddit') return true;
  return false;
}

async function writeImportCache(urlKey: string, sourceUrl: string, payload: RecipeImportExtracted): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  const cacheBlob = `${urlKey}|${sourceUrl}|${payload.source_url ?? ''}`.toLowerCase();
  if (cacheBlob.includes('reddit.com') || cacheBlob.includes('redd.it')) return;

  const hash = await sha256Hex(urlKey);
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  await fetch(`${supabaseUrl}/rest/v1/recipe_import_cache`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      url_hash: hash,
      source_url: sourceUrl,
      payload,
      expires_at: expiresAt,
    }),
  });
}

async function readResponseBodyLimited(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > WEB_MAX_BYTES) return null;
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

async function fetchRecipePage(url: string): Promise<string | null> {
  let currentUrl = url;

  for (let hop = 0; hop <= RECIPE_FETCH_MAX_REDIRECTS; hop += 1) {
    const validated = validatePublicHttpFetchUrl(currentUrl);
    if (!validated.ok) return null;

    let response: Response;
    try {
      response = await fetch(validated.url.toString(), {
        redirect: 'manual',
        headers: {
          'User-Agent': FETCH_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS),
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      if (hop >= RECIPE_FETCH_MAX_REDIRECTS) return null;
      const location = response.headers.get('location');
      if (!location) return null;
      const next = resolveRedirectLocation(validated.url, location);
      if (!next) return null;
      currentUrl = next;
      continue;
    }

    if (!response.ok) return null;
    return await readResponseBodyLimited(response);
  }

  return null;
}

type ImportSuccess = { recipe: RecipeImportExtracted; cached: boolean; youtubeSuggestion?: YoutubeSearchSuggestion | null };

type ImportFromUrlResult =
  | ImportSuccess
  | {
      notRecipe: true;
      message: string;
      captionForSearch?: string;
      creatorHint?: string | null;
      /** When true, do not offer YouTube search fallback (policy/unavailable content). */
      suppressFallbacks?: boolean;
    }
  | null;

function buildImportCacheKey(
  normalizedUrl: string,
  sourceType: RecipeImportSourceType,
  captionText?: string,
): string {
  const base =
    sourceType === 'youtube' ? canonicalYouTubeWatchUrl(normalizedUrl) : normalizedUrl;
  if (captionText?.trim()) {
    return urlHashKey(`${base}|caption|${captionText.trim()}`);
  }
  return urlHashKey(base);
}

function socialAuthorHandle(authorName: string): string {
  const trimmed = authorName.trim();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

async function buildFallbackPayload(
  sourceType: string,
  hasCaption: boolean,
  captionForSearch: string,
  creatorHint: string | null,
): Promise<ImportFallbacksPayload> {
  const youtubeKey = Deno.env.get('YOUTUBE_API_KEY') ?? '';
  const youtubeSuggestion = await searchYoutubeRecipeVideo(
    youtubeKey,
    creatorHint,
    captionForSearch,
  );
  const steps = orderImportFallbackSteps({
    sourceType,
    hasCaption,
    youtubeSuggestionAvailable: youtubeSuggestion != null,
  });
  return {
    steps,
    youtubeSuggestion,
    message: 'We could not find a complete recipe yet. Try one of these options.',
  };
}

function recipeLooksValid(recipe: RecipeImportExtracted): boolean {
  return recipe.is_recipe && recipe.confidence >= 0.35 &&
    (recipe.ingredients.length > 0 || recipe.steps.length > 0);
}

async function backfillCachedRecipeCreator(
  cacheKey: string,
  normalizedUrl: string,
  sourceType: RecipeImportSourceType,
  cached: RecipeImportExtracted,
  htmlForWeb?: string | null,
): Promise<RecipeImportExtracted> {
  if (!recipeMissingCreatorFields(cached, sourceType)) {
    return cached;
  }
  let enriched = cached;
  if (sourceType === 'youtube') {
    const watchUrl = canonicalYouTubeWatchUrl(normalizedUrl);
    enriched = await enrichYouTubeRecipeCreator(cached, normalizedUrl, watchUrl);
  } else if (sourceType === 'web' && htmlForWeb) {
    enriched = await enrichWebRecipeCreator(cached, htmlForWeb);
  }
  if (enriched !== cached) {
    await writeImportCache(cacheKey, normalizedUrl, enriched);
  }
  return enriched;
}

async function importFromCaption(
  apiKey: string,
  normalizedUrl: string,
  sourceType: 'tiktok' | 'instagram' | 'facebook',
  captionText: string,
  socialMeta?: { authorName?: string; authorUrl?: string | null; thumbnailUrl?: string | null },
): Promise<ImportFromUrlResult> {
  const cacheKey = buildImportCacheKey(normalizedUrl, sourceType, captionText);
  const cached = await readImportCache(cacheKey);
  if (cached) {
    const backfilled = await backfillCachedRecipeCreator(
      cacheKey,
      normalizedUrl,
      sourceType,
      cached,
    );
    return {
      recipe: withImportImageUrl(
        {
          ...backfilled,
          source_url: normalizedUrl,
          social_author_name: socialMeta?.authorName ?? backfilled.social_author_name,
          social_author_url: socialMeta?.authorUrl ?? backfilled.social_author_url,
        },
        socialMeta?.thumbnailUrl ?? backfilled.image_url ?? imageUrlForCachedImport(backfilled, sourceType, normalizedUrl),
        normalizedUrl,
      ),
      cached: true,
    };
  }

  const fromGemini = await extractRecipeFromPageText(apiKey, captionText, normalizedUrl, sourceType);
  if (!fromGemini) return null;
  if (!recipeLooksValid(fromGemini)) {
    return {
      notRecipe: true,
      message: 'We could not find a recipe in that caption.',
      captionForSearch: captionText,
      creatorHint: socialMeta?.authorName ?? null,
    };
  }

  const withSocial = withImportImageUrl(
    {
      ...fromGemini,
      social_author_name: socialMeta?.authorName ?? null,
      social_author_url: socialMeta?.authorUrl ?? normalizedUrl,
    },
    socialMeta?.thumbnailUrl,
    normalizedUrl,
  );
  await writeImportCache(cacheKey, normalizedUrl, withSocial);
  return { recipe: withSocial, cached: false };
}

async function importFromUrl(
  apiKey: string,
  normalizedUrl: string,
  sourceType: 'youtube' | 'web',
): Promise<ImportFromUrlResult> {
  const cacheKey = buildImportCacheKey(normalizedUrl, sourceType);
  const cached = await readImportCache(cacheKey);
  if (cached) {
    const html =
      sourceType === 'web' && recipeMissingCreatorFields(cached, 'web')
        ? await fetchRecipePage(normalizedUrl)
        : null;
    const backfilled = await backfillCachedRecipeCreator(
      cacheKey,
      normalizedUrl,
      sourceType,
      cached,
      html,
    );
    const withImage = withImportImageUrl(
      { ...backfilled, source_url: normalizedUrl },
      backfilled.image_url ?? imageUrlForCachedImport(backfilled, sourceType, normalizedUrl),
      normalizedUrl,
    );
    return { recipe: withImage, cached: true };
  }

  if (sourceType === 'youtube') {
    const watchUrl = canonicalYouTubeWatchUrl(normalizedUrl);
    const extracted = await extractRecipeFromYouTubeVideo(apiKey, watchUrl, 'youtube', normalizedUrl);
    if (!extracted) return null;
    const withCreator = await enrichYouTubeRecipeCreator(extracted, normalizedUrl, watchUrl);
    const imageUrl = resolveYouTubeImportImageUrl(normalizedUrl, watchUrl, null);
    const withImage = withImportImageUrl(withCreator, imageUrl, watchUrl);
    if (!recipeLooksValid(withImage)) {
      const creatorHint =
        withCreator.youtube_channel_name ??
        withCreator.social_author_name ??
        null;
      return {
        notRecipe: true,
        message: 'That video does not look like a recipe.',
        captionForSearch: withCreator.title,
        creatorHint,
      };
    }
    await writeImportCache(cacheKey, normalizedUrl, withImage);
    return { recipe: withImage, cached: false };
  }

  const html = await fetchRecipePage(normalizedUrl);
  if (!html) return null;

  const jsonLd = findRecipeJsonLdInHtml(html);
  if (jsonLd) {
    const fromLd = recipeJsonLdToExtracted(jsonLd, normalizedUrl);
    if (fromLd && recipeLooksValid(fromLd)) {
      const withAuthor = await enrichWebRecipeCreator(fromLd, html);
      const withImage = withImportImageUrl(withAuthor, extractOgImageFromHtml(html, normalizedUrl), normalizedUrl);
      await writeImportCache(cacheKey, normalizedUrl, withImage);
      return { recipe: withImage, cached: false };
    }
  }

  const pageText = stripHtmlToText(html, WEB_MAX_TEXT_CHARS);
  const fromGemini = await extractRecipeFromPageText(apiKey, pageText, normalizedUrl);
  if (!fromGemini) return null;
  const withAuthor = await enrichWebRecipeCreator(fromGemini, html);
  const withImage = withImportImageUrl(withAuthor, extractOgImageFromHtml(html, normalizedUrl), normalizedUrl);
  if (!recipeLooksValid(withImage)) {
    return {
      notRecipe: true,
      message: 'We could not find a recipe on that page.',
      captionForSearch: pageText.slice(0, 400),
      creatorHint: withImage.social_author_name ?? null,
    };
  }
  await writeImportCache(cacheKey, normalizedUrl, withImage);
  return { recipe: withImage, cached: false };
}

async function importTikTokLink(apiKey: string, normalizedUrl: string): Promise<ImportFromUrlResult> {
  const oembed = await fetchTikTokOembed(normalizedUrl);
  if (!oembed) {
    return {
      notRecipe: true,
      message: 'Could not read that TikTok post. Paste the caption or try a screenshot.',
      captionForSearch: '',
      creatorHint: null,
    };
  }
  const authorLabel = socialAuthorHandle(oembed.authorName);
  return importFromCaption(apiKey, normalizedUrl, 'tiktok', oembed.caption, {
    authorName: authorLabel,
    authorUrl: oembed.authorUrl ?? normalizedUrl,
    thumbnailUrl: oembed.thumbnailUrl,
  });
}

function parseImportImages(raw: ImportRequestBody['images']): ImportImagePayload[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IMPORT_IMAGES) return null;
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const out: ImportImagePayload[] = [];
  for (const entry of raw) {
    const mime = (entry.mimeType ?? 'image/jpeg').toLowerCase().split(';')[0]!.trim();
    const dataRaw = entry.data ?? '';
    const base64 = dataRaw.includes(',') ? (dataRaw.split(',').pop() ?? '') : dataRaw;
    if (!allowed.has(mime) || !base64 || base64.length > 8_000_000) return null;
    out.push({ mimeType: mime, base64 });
  }
  return out;
}

async function maybeAttachAuthorPublicLink(recipe: RecipeImportExtracted): Promise<RecipeImportExtracted> {
  const youtubeKey = Deno.env.get('YOUTUBE_API_KEY') ?? '';
  if (!youtubeKey.trim()) return recipe;
  const suggestion = await searchYoutubeRecipeVideo(youtubeKey, null, recipe.title);
  if (!suggestion) return recipe;
  return { ...recipe, author_public_recipe_url: suggestion.watchUrl };
}

const MIN_TEXT_IMPORT_CHARS = 24;

function guessTitleFromImportText(text: string): string {
  const line = text
    .split('\n')
    .map((row) => row.trim())
    .find((row) => row.length > 2 && !/^ingredients?\b/i.test(row) && !/^instructions?\b/i.test(row));
  return line?.slice(0, 120) ?? 'Imported recipe';
}

async function importFromPlainText(
  apiKey: string,
  text: string,
  options?: { skipSharedCache?: boolean },
): Promise<ImportFromUrlResult> {
  const cacheKey = urlHashKey(`text|${text.slice(0, 4000)}`);
  const skipCache = options?.skipSharedCache === true;
  if (!skipCache) {
    const cached = await readImportCache(cacheKey);
    if (cached) return { recipe: { ...cached, source_url: 'text-import' }, cached: true };
  }

  const ruleParsed = parseRuleBasedRecipeFromText(guessTitleFromImportText(text), text);
  if (ruleParsed) {
    const fromRules: RecipeImportExtracted = {
      ...ruleParsed,
      prep_minutes: null,
      cook_minutes: null,
      source_url: 'text-import',
      source_type: 'web',
    };
    if (recipeLooksValid(fromRules)) {
      if (!skipCache) await writeImportCache(cacheKey, 'text-import', fromRules);
      return { recipe: fromRules, cached: false };
    }
  }

  const fromGemini = await extractRecipeFromPageText(apiKey, text, 'text-import', 'web', {
    singleModelAttempt: skipCache,
    logKind: 'text',
  });
  if (!fromGemini) return null;
  if (!recipeLooksValid(fromGemini)) {
    return {
      notRecipe: true,
      message: 'We could not find a recipe in that text.',
      captionForSearch: text.slice(0, 400),
      creatorHint: null,
    };
  }
  if (!skipCache) await writeImportCache(cacheKey, 'text-import', fromGemini);
  return { recipe: fromGemini, cached: false };
}

async function respondNotRecipeWithAutoYoutube(
  apiKey: string,
  sourceType: string,
  hasCaption: boolean,
  notRecipe: { message: string; captionForSearch?: string; creatorHint?: string | null },
): Promise<Response> {
  const auto = await tryAutoImportFromYoutubeSearch(
    apiKey,
    importFromUrl,
    notRecipe.captionForSearch ?? '',
    notRecipe.creatorHint ?? null,
  );
  if (auto) {
    return jsonResponse({
      recipe: auto.recipe,
      cached: auto.cached,
      autoResolvedViaYoutube: {
        channelTitle: auto.channelTitle,
        watchUrl: auto.watchUrl,
      },
    });
  }
  const fallbacks = await buildFallbackPayload(
    sourceType,
    hasCaption,
    notRecipe.captionForSearch ?? '',
    notRecipe.creatorHint ?? null,
  );
  return jsonResponse({ error: notRecipe.message, code: 'NOT_RECIPE', fallbacks }, 422);
}

/**
 * Wraps every import in the month's allowance: claim one, run the import, and give it back when
 * no recipe was extracted for this request. The answer gains `usage` so the app can show what is
 * left. Requests that are refused before any work (wrong method, signed out) pass straight through.
 */
Deno.serve(async (req) => {
  const userId = req.method === 'POST' ? userIdFromJwt(req) : null;
  if (!userId) return handleImportRequest(req);

  const claim = await claimImport(userId, new Date(), Deno.env.get('PLAN_LIMITS_OVERRIDE'));
  if (claim.state === 'used-up') {
    return jsonResponse(importLimitBody(claim.tier, claim.limit), 429);
  }

  let response: Response;
  try {
    response = await handleImportRequest(req);
  } catch (error) {
    if (claim.state === 'claimed') await refundImport(userId, claim.period);
    throw error;
  }
  if (claim.state !== 'claimed') return response;

  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    body = null;
  }
  if (!importCounts(response.status, body)) {
    await refundImport(userId, claim.period);
    return response;
  }
  return jsonResponse(
    {
      ...(body as Record<string, unknown>),
      usage: { remaining: claim.remaining, limit: claim.limit, isPlus: claim.tier !== 'free', tier: claim.tier },
    },
    200,
  );
});

async function handleImportRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const userId = userIdFromJwt(req);
  if (!userId) {
    return jsonResponse({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401);
  }

  if (!checkUserRateLimit(userId)) {
    return jsonResponse(
      { error: 'Too many recipe imports. Wait a minute and try again.', code: 'RATE_LIMIT' },
      429,
    );
  }

  await cleanupStaleUserImportUploads(userId);

  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!apiKey) {
    return jsonResponse(
      { error: 'Recipe import is not set up yet. Ask an admin to finish setup.', code: 'NOT_CONFIGURED' },
      503,
    );
  }

  let body: ImportRequestBody;
  try {
    body = (await req.json()) as ImportRequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  const action: ImportRequestAction = body.action ?? 'link';

  if (action === 'confirm_youtube') {
    const yt = normalizeImportUrl(body.youtubeUrl ?? '');
    if (!yt || classifyRecipeImportUrl(yt) !== 'youtube') {
      return jsonResponse({ error: 'Invalid YouTube URL', code: 'BAD_REQUEST' }, 400);
    }
    try {
      const result = await importFromUrl(apiKey, yt, 'youtube');
      if (!result) {
        return jsonResponse({ error: 'Could not import that YouTube video.', code: 'UPSTREAM_ERROR' }, 502);
      }
      if ('notRecipe' in result && result.notRecipe) {
        const fallbacks = await buildFallbackPayload(
          'youtube',
          false,
          result.captionForSearch ?? '',
          result.creatorHint ?? null,
        );
        return jsonResponse(
          { error: result.message, code: 'NOT_RECIPE', fallbacks },
          422,
        );
      }
      return jsonResponse({ recipe: result.recipe, cached: result.cached, confirmedYoutube: true });
    } catch (error) {
      console.error('recipe-import confirm_youtube error', error);
      return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
    }
  }

  if (action === 'text') {
    const text = (body.text ?? body.captionText ?? '').trim();
    if (text.length < MIN_TEXT_IMPORT_CHARS) {
      return jsonResponse({ error: 'Paste a longer recipe or caption to import.', code: 'BAD_REQUEST' }, 400);
    }
    const skipSharedCache = shouldSkipSharedImportCache(body);
    try {
      const result = await importFromPlainText(apiKey, text, { skipSharedCache });
      if (!result) {
        return jsonResponse({ error: 'Could not import that text right now.', code: 'UPSTREAM_ERROR' }, 502);
      }
      if ('notRecipe' in result && result.notRecipe) {
        return await respondNotRecipeWithAutoYoutube(apiKey, 'text', true, result);
      }
      return jsonResponse({ recipe: result.recipe, cached: result.cached });
    } catch (error) {
      console.error('recipe-import text error', error);
      return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
    }
  }

  if (action === 'photo') {
    const storagePaths = (body.photoStoragePaths ?? [])
      .map((path) => path.trim())
      .filter(Boolean);
    const pathsToCleanup = [...storagePaths];
    try {
      let images: ImportImagePayload[] | null = null;
      if (storagePaths.length > 0) {
        if (!validatePhotoStoragePaths(userId, storagePaths)) {
          return jsonResponse({ error: 'Invalid photo upload path.', code: 'BAD_REQUEST' }, 400);
        }
        images = await downloadUserImportImages(userId, storagePaths);
        if (!images) {
          return jsonResponse({ error: 'Could not read your uploaded photos.', code: 'BAD_REQUEST' }, 400);
        }
      } else {
        images = parseImportImages(body.images);
        if (!images) {
          return jsonResponse({ error: 'Add 1–4 recipe photos (JPEG/PNG/WebP).', code: 'BAD_REQUEST' }, 400);
        }
      }

      const cacheKey = urlHashKey(
        `photo|${userId}|${images.map((i) => i.base64.slice(0, 64)).join('|')}`,
      );
      const imageParts = images.map((img) => ({
        inline_data: { mime_type: img.mimeType, data: img.base64 },
      }));
      let extracted = await extractRecipeFromPhotos(apiKey, imageParts, 'photo-scan');
      if (!extracted || !recipeLooksValid(extracted)) {
        const fallbacks = await buildFallbackPayload('photo', false, extracted?.title ?? '', null);
        return jsonResponse(
          {
            error: 'We could not read a recipe from those photos.',
            code: 'NOT_RECIPE',
            fallbacks,
          },
          422,
        );
      }
      extracted = await maybeAttachAuthorPublicLink(extracted);
      const skipPhotoCache = shouldSkipSharedImportCache(body);
      if (!skipPhotoCache) {
        await writeImportCache(cacheKey, 'photo-scan', extracted);
      }
      return jsonResponse({ recipe: extracted, cached: false });
    } catch (error) {
      console.error('recipe-import photo error', error);
      return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
    } finally {
      for (const path of pathsToCleanup) {
        await deleteUserImportObject(userId, path);
      }
    }
  }

  if (action === 'screenshot') {
    const storagePaths = (body.photoStoragePaths ?? [])
      .map((path) => path.trim())
      .filter(Boolean);
    const pathsToCleanup = [...storagePaths];
    try {
      let images: ImportImagePayload[] | null = null;
      if (storagePaths.length > 0) {
        if (!validatePhotoStoragePaths(userId, storagePaths)) {
          return jsonResponse({ error: 'Invalid screenshot upload path.', code: 'BAD_REQUEST' }, 400);
        }
        images = await downloadUserImportImages(userId, storagePaths);
        if (!images) {
          return jsonResponse({ error: 'Could not read your uploaded screenshots.', code: 'BAD_REQUEST' }, 400);
        }
      } else {
        images = parseImportImages(body.images);
        if (!images) {
          return jsonResponse({ error: 'Add 1–4 screenshots.', code: 'BAD_REQUEST' }, 400);
        }
      }

      const normalized = normalizeImportUrl(body.url ?? '') ?? 'screenshot-import';
      const sourceType = classifyRecipeImportUrl(normalized) ?? 'web';
      const imageParts = images.map((img) => ({
        inline_data: { mime_type: img.mimeType, data: img.base64 },
      }));
      const extracted = await extractRecipeFromScreenshots(
        apiKey,
        imageParts,
        normalized,
        sourceType === 'youtube' ? 'web' : sourceType,
      );
      if (!extracted || !recipeLooksValid(extracted)) {
        const fallbacks = await buildFallbackPayload(String(sourceType), Boolean(body.captionText?.trim()), '', null);
        return jsonResponse({ error: 'No recipe found in those screenshots.', code: 'NOT_RECIPE', fallbacks }, 422);
      }
      return jsonResponse({ recipe: extracted, cached: false });
    } catch (error) {
      console.error('recipe-import screenshot error', error);
      return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
    } finally {
      for (const path of pathsToCleanup) {
        await deleteUserImportObject(userId, path);
      }
    }
  }

  if (action === 'video') {
    const storagePath = (body.videoStoragePath ?? '').trim();
    if (!storagePath) {
      return jsonResponse({ error: 'Missing video upload path.', code: 'BAD_REQUEST' }, 400);
    }
    if (!validateUserImportStoragePath(userId, storagePath)) {
      return jsonResponse({ error: 'Invalid video upload path.', code: 'BAD_REQUEST' }, 400);
    }

    let geminiFileName: string | null = null;
    try {
      const downloaded = await downloadUserImportObject(userId, storagePath);
      if (!downloaded) {
        return jsonResponse({ error: 'Could not read your uploaded video.', code: 'BAD_REQUEST' }, 400);
      }

      let fileUri: string | undefined;
      if (shouldUseGeminiFileApi(downloaded.bytes.length)) {
        const uploaded = await uploadVideoToGeminiFiles(apiKey, downloaded.bytes, downloaded.mimeType);
        if (!uploaded) {
          return jsonResponse({ error: 'Could not process that video.', code: 'UPSTREAM_ERROR' }, 502);
        }
        fileUri = uploaded.fileUri;
        geminiFileName = uploaded.fileName;
      }

      const parts = buildGeminiPartsForVideo(
        downloaded.bytes,
        downloaded.mimeType,
        '',
        fileUri,
      );
      const extracted = await extractRecipeFromUploadedVideo(apiKey, parts, storagePath);

      if (!extracted || !recipeLooksValid(extracted)) {
        const fallbacks = await buildFallbackPayload('video', false, extracted?.title ?? '', null);
        return jsonResponse({ error: 'That video does not look like a recipe.', code: 'NOT_RECIPE', fallbacks }, 422);
      }
      return jsonResponse({ recipe: extracted, cached: false });
    } catch (error) {
      console.error('recipe-import video error', error);
      return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
    } finally {
      if (geminiFileName) {
        await deleteGeminiFile(apiKey, geminiFileName);
      }
      await deleteUserImportObject(userId, storagePath);
    }
  }

  // --- link import ---
  const normalized = normalizeImportUrl(body.url ?? '');
  if (!normalized) {
    const fallbackText = (body.text ?? body.captionText ?? '').trim();
    if (fallbackText.length >= MIN_TEXT_IMPORT_CHARS) {
      const skipSharedCache = shouldSkipSharedImportCache(body);
      try {
        const result = await importFromPlainText(apiKey, fallbackText, { skipSharedCache });
        if (!result) {
          return jsonResponse({ error: 'Could not import that text right now.', code: 'UPSTREAM_ERROR' }, 502);
        }
        if ('notRecipe' in result && result.notRecipe) {
          return await respondNotRecipeWithAutoYoutube(apiKey, 'text', true, result);
        }
        return jsonResponse({ recipe: result.recipe, cached: result.cached });
      } catch (error) {
        console.error('recipe-import text-via-link error', error);
        return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
      }
    }
    return jsonResponse({ error: 'Paste a link or recipe text to import.', code: 'BAD_REQUEST' }, 400);
  }

  const sourceType = classifyRecipeImportUrl(normalized);
  if (!sourceType) {
    return jsonResponse({ error: 'Unsupported URL', code: 'BAD_REQUEST' }, 400);
  }

  if (sourceType === 'reddit') {
    return jsonResponse(
      {
        error:
          'Reddit links cannot be imported automatically. Copy the recipe text or use a photo instead.',
        code: 'REDDIT_CLIENT_ONLY',
      },
      422,
    );
  }

  if (sourceType === 'tiktok') {
    const caption = (body.captionText ?? '').trim();
    try {
      const result = caption
        ? await importFromCaption(apiKey, normalized, 'tiktok', caption, {
            authorUrl: normalized,
          })
        : await importTikTokLink(apiKey, normalized);
      if (!result) {
        return jsonResponse({ error: 'Could not import that TikTok link.', code: 'UPSTREAM_ERROR' }, 502);
      }
      if ('notRecipe' in result && result.notRecipe) {
        return await respondNotRecipeWithAutoYoutube(
          apiKey,
          'tiktok',
          Boolean(caption),
          result,
        );
      }
      return jsonResponse({ recipe: result.recipe, cached: result.cached });
    } catch (error) {
      console.error('recipe-import tiktok error', error);
      return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
    }
  }

  if (isManualCaptionSourceType(sourceType)) {
    const caption = (body.captionText ?? '').trim();
    if (!caption) {
      const fallbacks = await buildFallbackPayload(sourceType, false, '', null);
      return jsonResponse(
        {
          error: 'Paste the post caption or upload a screenshot of the recipe.',
          code: 'FALLBACK_REQUIRED',
          fallbacks,
        },
        422,
      );
    }
    try {
      const result = await importFromCaption(
        apiKey,
        normalized,
        sourceType,
        caption,
      );
      if (!result) {
        return jsonResponse({ error: 'Could not import that caption.', code: 'UPSTREAM_ERROR' }, 502);
      }
      if ('notRecipe' in result && result.notRecipe) {
        return await respondNotRecipeWithAutoYoutube(apiKey, sourceType, true, result);
      }
      return jsonResponse({ recipe: result.recipe, cached: result.cached });
    } catch (error) {
      console.error('recipe-import caption error', error);
      return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
    }
  }

  if ((body.captionText ?? '').trim()) {
    try {
      const result = await importFromCaption(
        apiKey,
        normalized,
        sourceType === 'youtube' || sourceType === 'web' ? 'web' : sourceType,
        (body.captionText ?? '').trim(),
      );
      if (result && !('notRecipe' in result && result.notRecipe)) {
        return jsonResponse({ recipe: result.recipe, cached: result.cached });
      }
    } catch {
      /* fall through to URL import */
    }
  }

  try {
    if (sourceType === 'tiktok' || sourceType === 'instagram' || sourceType === 'facebook') {
      return jsonResponse({ error: 'Unsupported link flow', code: 'BAD_REQUEST' }, 400);
    }
    const result = await importFromUrl(apiKey, normalized, sourceType);
    if (!result) {
      return jsonResponse({ error: 'Could not import that link right now.', code: 'UPSTREAM_ERROR' }, 502);
    }
    if ('notRecipe' in result && result.notRecipe) {
      return await respondNotRecipeWithAutoYoutube(apiKey, sourceType, false, result);
    }
    return jsonResponse({ recipe: result.recipe, cached: result.cached });
  } catch (error) {
    console.error('recipe-import error', error);
    return jsonResponse({ error: 'Import failed unexpectedly.', code: 'UPSTREAM_ERROR' }, 502);
  }
}
