import {
  GEMINI_HTTP_RETRIES_PER_MODEL,
  GEMINI_REQUEST_TIMEOUT_MS,
  GEMINI_REQUEST_TOTAL_BUDGET_MS,
  ModelTimeoutMemory,
  RequestTimeBudget,
  orderModelsForAttempt,
  shouldRetrySameModelAfterError,
} from '../pantry-vision/geminiOrchestration.ts';
import {
  attachImportMetadata,
  GEMINI_RECIPE_IMPORT_JSON_SCHEMA,
  validateGeminiRecipeImportPayload,
  type RecipeImportExtracted,
} from './recipeImportSchema.ts';
import type { RecipeImportSourceType } from './urlClassification.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_DETERMINISTIC_SEED = 42;
const GEMINI_MAX_OUTPUT_TOKENS = 8192;

const geminiModelTimeoutMemory = new ModelTimeoutMemory();

type GeminiAttemptError = {
  kind: 'timeout' | 'http';
  status?: number;
  detail: string;
  retryable?: boolean;
};

const TEXT_EXTRACTION_PROMPT =
  'Extract a home-cooking recipe from the page text. Rewrite steps and ingredient lines in your own words (do not copy marketing or blog prose). ' +
  'Use generic ingredient names (no brands). Return clear step-by-step instructions as short strings. If this is not a recipe, set is_recipe false and confidence low.';

const YOUTUBE_EXTRACTION_PROMPT =
  'You are helping a meal-planning app. The video is referenced by URL only — do not download, store, or reproduce the video or audio. ' +
  'Watch the cooking video and extract a recipe with clear step-by-step INSTRUCTIONS and ingredients with quantities and units. ' +
  'Rewrite the dish title, ingredients, and steps in fresh wording (never copy the video title, description, or transcript verbatim). ' +
  'Leave youtube_channel_name null (channel attribution is added separately). ' +
  'Use generic ingredient names (no brands). If this is not a recipe video, set is_recipe false with a low confidence score.';

const SOCIAL_CAPTION_PROMPT =
  'Extract a home-cooking recipe from this social post caption. Rewrite the title, ingredients, and steps in your own words (do not copy the caption verbatim). ' +
  'Use generic ingredient names (no brands). Return clear step-by-step instructions. If this is not a recipe, set is_recipe false and confidence low.';

const PHOTO_RECIPE_PROMPT =
  'Extract a home-cooking recipe from these photos (printed cookbook pages, recipe cards, or handwritten cards). ' +
  'Rewrite the title, ingredients, and steps in your own words — never copy publisher text verbatim. ' +
  'Use generic ingredient names. Return clear step-by-step instructions. ' +
  'If you can read an author or book name, set cookbook_author_name and cookbook_title_guess; otherwise null. ' +
  'If this is not a recipe, set is_recipe false and confidence low.';

const SCREENSHOT_RECIPE_PROMPT =
  'Extract a home-cooking recipe from these screenshots of a social post or web page. ' +
  'Rewrite in your own words. Use generic ingredient names and clear steps. ' +
  'If this is not a recipe, set is_recipe false and confidence low.';

const UPLOADED_VIDEO_PROMPT =
  'Extract a home-cooking recipe from this cooking video the user saved on their device. ' +
  'Focus on accurate step-by-step INSTRUCTIONS and ingredients with quantities. Rewrite in fresh wording. ' +
  'Use generic ingredient names. If this is not a recipe video, set is_recipe false with low confidence.';

async function callGeminiJson(
  apiKey: string,
  model: string,
  parts: Record<string, unknown>[],
  budget: RequestTimeBudget,
): Promise<{ payload: unknown } | { error: GeminiAttemptError }> {
  const timeoutMs = budget.perCallTimeoutMs(GEMINI_REQUEST_TIMEOUT_MS);
  if (timeoutMs == null) {
    return { error: { kind: 'timeout', detail: 'budget exhausted', retryable: false } };
  }

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: GEMINI_RECIPE_IMPORT_JSON_SCHEMA,
      temperature: 0,
      topP: 0.1,
      seed: GEMINI_DETERMINISTIC_SEED,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const isTimeout =
      error instanceof DOMException
        ? error.name === 'TimeoutError'
        : error instanceof Error && error.name === 'TimeoutError';
    return {
      error: {
        kind: isTimeout ? 'timeout' : 'http',
        detail: error instanceof Error ? error.message : 'network error',
        retryable: !isTimeout,
      },
    };
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    return {
      error: {
        kind: 'http',
        status: upstream.status,
        detail: text.slice(0, 320),
        retryable: upstream.status === 429 || upstream.status >= 500,
      },
    };
  }

  try {
    const envelope = JSON.parse(text) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const partText =
      envelope.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!partText) {
      return { error: { kind: 'http', status: 502, detail: 'empty model response', retryable: true } };
    }
    return { payload: JSON.parse(partText) as unknown };
  } catch (error) {
    return {
      error: {
        kind: 'http',
        status: 502,
        detail: error instanceof Error ? error.message : 'parse error',
        retryable: false,
      },
    };
  }
}

export interface GeminiExtractOptions {
  /** Use only the primary Gemini model — at most one generateContent call (no fallbacks). */
  singleModelAttempt?: boolean;
}

async function callGeminiWithFallback(
  apiKey: string,
  parts: Record<string, unknown>[],
  options?: GeminiExtractOptions,
): Promise<RecipeImportExtracted | null> {
  const budget = new RequestTimeBudget(GEMINI_REQUEST_TOTAL_BUDGET_MS);
  const allCandidates = orderModelsForAttempt(
    Deno.env.get('GEMINI_MODEL') ?? undefined,
    Deno.env.get('GEMINI_FALLBACK_MODELS') ?? undefined,
    geminiModelTimeoutMemory,
  );
  const candidates = options?.singleModelAttempt ? allCandidates.slice(0, 1) : allCandidates;
  const maxHttpRetries = options?.singleModelAttempt ? 1 : GEMINI_HTTP_RETRIES_PER_MODEL;

  for (const model of candidates) {
    if (budget.isExhausted()) break;
    let httpRetries = 0;
    for (;;) {
      const result = await callGeminiJson(apiKey, model, parts, budget);
      if ('payload' in result) {
        const validated = validateGeminiRecipeImportPayload(result.payload);
        if (validated) return validated;
        break;
      }
      if (result.error.kind === 'timeout') {
        geminiModelTimeoutMemory.record(model);
        break;
      }
      if (shouldRetrySameModelAfterError(result.error, httpRetries, maxHttpRetries)) {
        httpRetries += 1;
        continue;
      }
      break;
    }
  }
  return null;
}

export async function extractRecipeFromYouTubeVideo(
  apiKey: string,
  youtubeUrl: string,
  sourceType: RecipeImportSourceType,
  sourceUrl: string,
): Promise<RecipeImportExtracted | null> {
  const parts = [
    { file_data: { mime_type: 'video/*', file_uri: youtubeUrl } },
    { text: YOUTUBE_EXTRACTION_PROMPT },
  ];
  const extracted = await callGeminiWithFallback(apiKey, parts);
  if (!extracted) return null;
  return attachImportMetadata(extracted, sourceUrl, sourceType);
}

export async function extractRecipeFromPageText(
  apiKey: string,
  pageText: string,
  sourceUrl: string,
  sourceType: RecipeImportSourceType = 'web',
  options?: GeminiExtractOptions,
): Promise<RecipeImportExtracted | null> {
  const prompt =
    sourceType === 'tiktok' || sourceType === 'instagram' || sourceType === 'facebook'
      ? SOCIAL_CAPTION_PROMPT
      : TEXT_EXTRACTION_PROMPT;
  const parts = [
    {
      text: `${prompt}\n\nSource URL: ${sourceUrl}\n\nText:\n${pageText}`,
    },
  ];
  const extracted = await callGeminiWithFallback(apiKey, parts, options);
  if (!extracted) return null;
  return attachImportMetadata(extracted, sourceUrl, sourceType);
}

export async function extractRecipeFromGeminiParts(
  apiKey: string,
  parts: Record<string, unknown>[],
  sourceUrl: string,
  sourceType: RecipeImportSourceType,
  extras?: Parameters<typeof attachImportMetadata>[3],
): Promise<RecipeImportExtracted | null> {
  const extracted = await callGeminiWithFallback(apiKey, parts);
  if (!extracted) return null;
  return attachImportMetadata(extracted, sourceUrl, sourceType, extras);
}

export async function extractRecipeFromPhotos(
  apiKey: string,
  parts: Record<string, unknown>[],
  sourceUrl: string,
): Promise<RecipeImportExtracted | null> {
  const withPrompt = [{ text: PHOTO_RECIPE_PROMPT }, ...parts];
  return extractRecipeFromGeminiParts(apiKey, withPrompt, sourceUrl, 'photo');
}

export async function extractRecipeFromScreenshots(
  apiKey: string,
  parts: Record<string, unknown>[],
  sourceUrl: string,
  sourceType: RecipeImportSourceType,
): Promise<RecipeImportExtracted | null> {
  const withPrompt = [{ text: SCREENSHOT_RECIPE_PROMPT }, ...parts];
  return extractRecipeFromGeminiParts(apiKey, withPrompt, sourceUrl, sourceType);
}

export async function extractRecipeFromUploadedVideo(
  apiKey: string,
  parts: Record<string, unknown>[],
  sourceUrl: string,
): Promise<RecipeImportExtracted | null> {
  const withPrompt = [{ text: UPLOADED_VIDEO_PROMPT }, ...parts];
  return extractRecipeFromGeminiParts(apiKey, withPrompt, sourceUrl, 'video');
}
