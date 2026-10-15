export const LIBRARY_IMAGE_BUCKET = 'library-recipe-images';

export const DEFAULT_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 3;
export const MAX_QUEUE_ATTEMPTS = 3;

export function geminiTextModel(): string {
  return (Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash').trim();
}

export function geminiImageModel(): string {
  return (Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3.1-flash-lite-image').trim();
}

function envUsdPerMillion(key: string, fallback: number): number {
  const raw = Deno.env.get(key);
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Input token price (USD per 1M tokens) for Gemini text models (default: gemini-3.8-flash). */
export function geminiTextInputUsdPerMillion(): number {
  return envUsdPerMillion('GEMINI_TEXT_INPUT_USD_PER_M', 0.25);
}

/** Output token price (USD per 1M tokens) for Gemini text models. */
export function geminiTextOutputUsdPerMillion(): number {
  return envUsdPerMillion('GEMINI_TEXT_OUTPUT_USD_PER_M', 1.5);
}

/** Token price (USD per 1M tokens) for Gemini image output models. */
export function geminiImageUsdPerMillion(): number {
  return envUsdPerMillion('GEMINI_IMAGE_USD_PER_M', 30);
}
