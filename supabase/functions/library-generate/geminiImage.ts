import { LIBRARY_IMAGE_BUCKET } from './config.ts';
import { parseGeminiUsageMetadata, type GeminiUsageMetadata } from './generationUsage.ts';
import { buildRecipeImagePrompt } from './imagePrompt.ts';
import type { RecipeImportExtracted } from '../recipe-import/recipeImportSchema.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type ImageGenResult = {
  bytes: Uint8Array;
  contentType: string;
  publicUrl: string;
} | null;

function classifyQuota(status: number, body: string): 'rate_limit' | 'quota_exhausted' | 'none' {
  if (status === 429) return 'rate_limit';
  if (/RESOURCE_EXHAUSTED|quota/i.test(body)) return 'quota_exhausted';
  return 'none';
}

async function generateWithGeminiImage(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<
  | { bytes: Uint8Array; contentType: string; usage: GeminiUsageMetadata }
  | { error: string; quota: 'rate_limit' | 'quota_exhausted' | 'none' }
> {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '4:3' },
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    return { error: text.slice(0, 400), quota: classifyQuota(response.status, text) };
  }
  const json = JSON.parse(text) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
    usageMetadata?: unknown;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
  const b64 = inline?.data;
  if (!b64) return { error: 'No image inlineData in response', quota: 'none' };
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const mime = inline?.mimeType ?? 'image/png';
  const contentType = mime.includes('jpeg') || mime.includes('jpg') ? 'image/jpeg' : 'image/png';
  return { bytes, contentType, usage: parseGeminiUsageMetadata(json.usageMetadata) };
}

async function resizeToWebMax(bytes: Uint8Array, contentType: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  try {
    const { Image } = await import('https://deno.land/x/imagescript@1.3.0/mod.ts');
    const image = await Image.decode(bytes);
    const maxWidth = 800;
    if (image.width > maxWidth) {
      const scaled = image.resize(maxWidth, Image.RESIZE_AUTO);
      const out = await scaled.encodeJPEG(82);
      return { bytes: out, contentType: 'image/jpeg' };
    }
    if (contentType === 'image/png') {
      const out = await image.encodeJPEG(82);
      return { bytes: out, contentType: 'image/jpeg' };
    }
    return { bytes, contentType };
  } catch {
    return { bytes, contentType };
  }
}

export async function generateAndStoreRecipeImage(options: {
  apiKey: string;
  imageModel: string;
  supabaseUrl: string;
  serviceKey: string;
  slug: string;
  recipe: RecipeImportExtracted;
}): Promise<{
  result: ImageGenResult;
  quota: 'rate_limit' | 'quota_exhausted' | 'none';
  usage?: GeminiUsageMetadata;
  errorDetail?: string;
}> {
  const prompt = buildRecipeImagePrompt(options.recipe);

  const generated = await generateWithGeminiImage(options.apiKey, options.imageModel, prompt);
  if ('error' in generated) {
    console.warn('library-generate image failed', generated.error);
    return { result: null, quota: generated.quota, errorDetail: generated.error };
  }

  const resized = await resizeToWebMax(generated.bytes, generated.contentType);
  const ext = resized.contentType === 'image/webp' ? 'webp' : 'jpeg';
  const path = `${options.slug}.${ext}`;
  const uploadUrl = `${options.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${LIBRARY_IMAGE_BUCKET}/${path}`;

  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.serviceKey}`,
      apikey: options.serviceKey,
      'Content-Type': resized.contentType,
      'x-upsert': 'true',
    },
    body: resized.bytes,
  });

  if (!upload.ok) {
    const detail = await upload.text();
    console.warn('library-generate image upload failed', detail);
    return { result: null, quota: 'none', errorDetail: detail.slice(0, 400) };
  }

  const publicUrl = `${options.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${LIBRARY_IMAGE_BUCKET}/${path}`;
  return {
    result: { bytes: resized.bytes, contentType: resized.contentType, publicUrl },
    quota: 'none',
    usage: generated.usage,
  };
}
