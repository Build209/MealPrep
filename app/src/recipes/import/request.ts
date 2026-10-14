/**
 * Talking to the live recipe-import function, exactly as the old app does
 * (mobile/lib/recipeImport/client.ts): POST JSON to <supabase url>/functions/v1/recipe-import with
 * the signed-in person's access token and the public anon key. The function is live and must not
 * change. It reads the recipe and counts the import; it does NOT save anything. Saving is the app's
 * own insert into `recipes` afterwards (src/data/recipeImport.ts), as in the old app.
 * Pure functions only (tests/recipe-import-request.test.ts); api.ts does the fetch.
 */
import { parseImportInput, type ParsedImportInput } from './urlInput';

/** Client wait, above the function's own ~90 s budget (old app: 95 s). */
export const IMPORT_TIMEOUT_MS = 95_000;

/** The function's own photo limit (MAX_IMPORT_IMAGES / validatePhotoStoragePaths). */
export const MAX_IMPORT_PHOTOS = 4;

/** Private storage bucket the function reads photo and video uploads from (and deletes them after). */
export const IMPORT_UPLOAD_BUCKET = 'recipe-import-uploads';

/** The bucket's own size cap (104857600 bytes in the baseline), the old app's maxVideoBytes. */
export const MAX_VIDEO_BYTES = 104_857_600;

export function recipeImportUrl(supabaseUrl: string): string {
  const base = supabaseUrl.trim().replace(/\/+$/, '');
  return base ? `${base}/functions/v1/recipe-import` : '';
}

// ---------------------------------------------------------------------- bodies

export type ImportRequest =
  | { mode: 'link'; url: string; caption?: string }
  | { mode: 'text'; text: string }
  | { mode: 'photo'; photoStoragePaths: string[] }
  | { mode: 'screenshot'; photoStoragePaths: string[]; caption?: string }
  | { mode: 'video'; videoStoragePath: string }
  | { mode: 'confirm_youtube'; youtubeUrl: string };

/** What the import box holds, as the request the old importRecipeSmartInput sends. Null: nothing usable. */
export function requestFromInput(raw: string): ImportRequest | null {
  const parsed: ParsedImportInput | null = parseImportInput(raw);
  if (!parsed) return null;
  if (parsed.kind === 'text') return { mode: 'text', text: parsed.text };
  return parsed.caption ? { mode: 'link', url: parsed.url, caption: parsed.caption } : { mode: 'link', url: parsed.url };
}

/** The JSON body, field for field as the old app sends it (undefined fields drop out of the JSON). */
export function buildImportBody(request: ImportRequest): Record<string, unknown> {
  switch (request.mode) {
    case 'text':
      return { action: 'text', text: request.text.trim(), private_import: false };
    case 'link':
      return { action: 'link', url: request.url, captionText: request.caption?.trim() || undefined };
    case 'photo':
      return { action: 'photo', photoStoragePaths: request.photoStoragePaths, private_import: false };
    case 'screenshot':
      return {
        action: 'screenshot',
        photoStoragePaths: request.photoStoragePaths,
        images: undefined,
        url: undefined,
        captionText: request.caption?.trim() || undefined,
      };
    case 'video':
      return { action: 'video', videoStoragePath: request.videoStoragePath };
    case 'confirm_youtube':
      return { action: 'confirm_youtube', youtubeUrl: request.youtubeUrl };
  }
}

export function buildImportRequest(
  request: ImportRequest,
  accessToken: string,
  anonKey: string,
): { method: 'POST'; headers: Record<string, string>; body: string } {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: anonKey },
    body: JSON.stringify(buildImportBody(request)),
  };
}

// --------------------------------------------------------------------- answers

/** Source types the function returns; `recipes.source_type` accepts all but reddit. */
export const IMPORT_SOURCE_TYPES = ['youtube', 'web', 'tiktok', 'instagram', 'facebook', 'reddit', 'photo', 'video'] as const;
export type ImportSourceType = (typeof IMPORT_SOURCE_TYPES)[number];

export type ImportedIngredient = { name: string; quantity: number; unit: string; note?: string };

/** The function's RecipeImportExtracted, checked field by field. */
export type ImportedRecipe = {
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: ImportedIngredient[];
  steps: string[];
  sourceUrl: string;
  sourceType: ImportSourceType;
  sourceTitle: string | null;
  youtubeChannelName: string | null;
  youtubeChannelUrl: string | null;
  socialAuthorName: string | null;
  socialAuthorUrl: string | null;
  authorPublicRecipeUrl: string | null;
  imageUrl: string | null;
  metadataRefreshedAt: string | null;
};

/** Usage the function adds to a counted import: `remaining` is what is left after this one. */
export type ImportUsage = { tier: string | null; limit: number | null; remaining: number | null };

export type YoutubeSuggestion = { watchUrl: string; channelTitle: string; title: string };
export type FallbackStep = 'youtube_confirm' | 'video_upload' | 'screenshot' | 'paste_caption';
export type ImportFallbacks = { steps: FallbackStep[]; youtubeSuggestion: YoutubeSuggestion | null };

export type ImportResult = { recipe: ImportedRecipe; cached: boolean; usage: ImportUsage | null };

const MAX_INGREDIENTS = 80;
const MAX_STEPS = 60;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const wholeOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;

function parseIngredient(entry: unknown): ImportedIngredient | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const name = str(row.name);
  if (!name) return null;
  const quantity = typeof row.quantity === 'number' && Number.isFinite(row.quantity) && row.quantity >= 0 ? row.quantity : 1;
  const unit = str(row.unit) ?? 'each';
  const note = str(row.note);
  return note ? { name: name.slice(0, 120), quantity, unit: unit.slice(0, 32), note: note.slice(0, 120) } : { name: name.slice(0, 120), quantity, unit: unit.slice(0, 32) };
}

/** The recipe in a 200 answer, or throws ImportError('unexpected'). Same rules as the function's own validator. */
export function parseImportedRecipe(raw: unknown): ImportedRecipe {
  if (!raw || typeof raw !== 'object') throw new ImportError('unexpected', IMPORT_MESSAGES.unexpected);
  const r = raw as Record<string, unknown>;
  const title = str(r.title);
  if (!title) throw new ImportError('unexpected', IMPORT_MESSAGES.unexpected);
  const servings = typeof r.servings === 'number' && Number.isFinite(r.servings) ? Math.max(1, Math.round(r.servings)) : 4;
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .slice(0, MAX_INGREDIENTS)
    .map(parseIngredient)
    .filter((i): i is ImportedIngredient => i !== null);
  const steps = (Array.isArray(r.steps) ? r.steps : [])
    .slice(0, MAX_STEPS)
    .map((s) => str(s))
    .filter((s): s is string => s !== null);
  const sourceType = (IMPORT_SOURCE_TYPES as readonly string[]).includes(r.source_type as string)
    ? (r.source_type as ImportSourceType)
    : 'web';
  return {
    title: title.slice(0, 200),
    servings: Math.min(servings, 99),
    prepMinutes: wholeOrNull(r.prep_minutes),
    cookMinutes: wholeOrNull(r.cook_minutes),
    ingredients,
    steps,
    sourceUrl: typeof r.source_url === 'string' ? r.source_url.trim() : '',
    sourceType,
    sourceTitle: str(r.source_title),
    youtubeChannelName: str(r.youtube_channel_name),
    youtubeChannelUrl: str(r.youtube_channel_url),
    socialAuthorName: str(r.social_author_name),
    socialAuthorUrl: str(r.social_author_url),
    authorPublicRecipeUrl: str(r.author_public_recipe_url),
    imageUrl: str(r.image_url),
    metadataRefreshedAt: str(r.metadata_refreshed_at),
  };
}

function parseUsage(raw: unknown): ImportUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { tier: typeof u.tier === 'string' ? u.tier : null, limit: num(u.limit), remaining: num(u.remaining) };
}

/** A 200 answer: `{ recipe, cached?, usage?, confirmedYoutube?, autoResolvedViaYoutube? }`. */
export function parseImportResponse(json: unknown): ImportResult {
  if (!json || typeof json !== 'object') throw new ImportError('unexpected', IMPORT_MESSAGES.unexpected);
  const body = json as { recipe?: unknown; cached?: unknown; usage?: unknown };
  return { recipe: parseImportedRecipe(body.recipe), cached: body.cached === true, usage: parseUsage(body.usage) };
}

function parseFallbacks(raw: unknown): ImportFallbacks | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as { steps?: unknown; youtubeSuggestion?: unknown };
  const known: FallbackStep[] = ['youtube_confirm', 'video_upload', 'screenshot', 'paste_caption'];
  const steps = Array.isArray(f.steps) ? f.steps.filter((s): s is FallbackStep => known.includes(s as FallbackStep)) : [];
  let youtubeSuggestion: YoutubeSuggestion | null = null;
  if (f.youtubeSuggestion && typeof f.youtubeSuggestion === 'object') {
    const y = f.youtubeSuggestion as Record<string, unknown>;
    const watchUrl = str(y.watchUrl);
    if (watchUrl) youtubeSuggestion = { watchUrl, channelTitle: str(y.channelTitle) ?? 'YouTube', title: str(y.title) ?? '' };
  }
  return { steps, youtubeSuggestion };
}

// ---------------------------------------------------------------------- errors

export type ImportErrorKind =
  | 'used-up' // this month's imports are gone (IMPORT_LIMIT_REACHED)
  | 'rate-limit' // more than 10 in a minute (RATE_LIMIT)
  | 'not-recipe' // read, but no recipe in it (NOT_RECIPE): other ways to try may follow
  | 'needs-caption' // Instagram or Facebook link without its caption (FALLBACK_REQUIRED)
  | 'unsupported' // a link the function cannot read (Reddit, or not a web link)
  | 'bad-input' // too short, or an upload it could not read
  | 'unavailable' // import is down or not set up
  | 'busy' // the reader failed this time (UPSTREAM_ERROR)
  | 'signed-out'
  | 'timeout'
  | 'network'
  | 'unexpected';

export const IMPORT_MESSAGES = {
  usedUp: "You've used this month's recipe imports. They start again on the 1st.",
  rateLimit: 'Too many imports in a minute. Wait a moment and try again.',
  notRecipe: "We couldn't find a recipe there. Try a photo of the recipe or paste the recipe text.",
  needsCaption: 'Instagram and Facebook hide captions from apps. Paste the caption under the link, or add a screenshot.',
  unsupported: "That site can't be read automatically. Copy the recipe text and paste it here, or add a photo.",
  reddit: "Reddit doesn't let apps read posts. Copy the recipe text and paste it here, or add a photo.",
  invalidInput: 'Paste a link or recipe text to import.',
  tooShort: 'Paste a longer recipe or caption to import.',
  unavailable: 'Recipe import is unavailable right now. Please try again later.',
  busy: "Couldn't read that recipe right now. Try again in a moment.",
  signedOut: 'Sign in again to import recipes.',
  timeout: 'The import took too long. Check your connection and try again.',
  network: "Couldn't reach the recipe reader. Check your connection and try again.",
  unexpected: 'Something went wrong reading that recipe. Please try again.',
  notConfigured: "This build has no server settings, so recipes can't be imported.",
  videoTooLarge: 'That video is too large. Choose one under 100 MB.',
  uploadFailed: "Couldn't upload that file. Check your connection and try again.",
} as const;

export class ImportError extends Error {
  readonly kind: ImportErrorKind;
  readonly usage: ImportUsage | null;
  readonly fallbacks: ImportFallbacks | null;
  constructor(kind: ImportErrorKind, message: string, extra?: { usage?: ImportUsage | null; fallbacks?: ImportFallbacks | null }) {
    super(message);
    this.name = 'ImportError';
    this.kind = kind;
    this.usage = extra?.usage ?? null;
    this.fallbacks = extra?.fallbacks ?? null;
  }
}

/** The function's own sentence, used only where it is already plain words for people. */
function serverSentence(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text.length > 0 && text.length <= 240 ? text : null;
}

/** Turns a non-2xx answer from recipe-import into an ImportError with a plain message. */
export function importErrorFromResponse(status: number, bodyText: string): ImportError {
  let json: { error?: unknown; code?: unknown; usage?: unknown; fallbacks?: unknown } = {};
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (parsed && typeof parsed === 'object') json = parsed as typeof json;
  } catch {
    /* not JSON: decide on the status alone */
  }
  const code = typeof json.code === 'string' ? json.code : '';
  const error = typeof json.error === 'string' ? json.error : '';

  // 429 means two things: the month's allowance (IMPORT_LIMIT_REACHED) or a burst (RATE_LIMIT).
  if (code === 'IMPORT_LIMIT_REACHED') {
    return new ImportError('used-up', serverSentence(json.error) ?? IMPORT_MESSAGES.usedUp, { usage: parseUsage(json.usage) });
  }
  if (code === 'RATE_LIMIT') return new ImportError('rate-limit', IMPORT_MESSAGES.rateLimit);
  if (code === 'NOT_CONFIGURED' || status === 503) return new ImportError('unavailable', IMPORT_MESSAGES.unavailable);
  if (status === 401 || code === 'UNAUTHENTICATED') return new ImportError('signed-out', IMPORT_MESSAGES.signedOut);
  if (status === 429) return new ImportError('rate-limit', IMPORT_MESSAGES.rateLimit);
  if (code === 'REDDIT_CLIENT_ONLY') return new ImportError('unsupported', IMPORT_MESSAGES.reddit);
  if (code === 'FALLBACK_REQUIRED') {
    return new ImportError('needs-caption', IMPORT_MESSAGES.needsCaption, { fallbacks: parseFallbacks(json.fallbacks) });
  }
  if (code === 'NOT_RECIPE' || status === 422) {
    return new ImportError('not-recipe', IMPORT_MESSAGES.notRecipe, { fallbacks: parseFallbacks(json.fallbacks) });
  }
  if (code === 'BAD_REQUEST' || status === 400) {
    if (/unsupported url/i.test(error)) return new ImportError('unsupported', IMPORT_MESSAGES.unsupported);
    if (/longer recipe/i.test(error)) return new ImportError('bad-input', IMPORT_MESSAGES.tooShort);
    if (/link or recipe text/i.test(error)) return new ImportError('bad-input', IMPORT_MESSAGES.invalidInput);
    return new ImportError('bad-input', serverSentence(json.error) && /photo|screenshot|video/i.test(error) ? error.trim() : IMPORT_MESSAGES.invalidInput);
  }
  if (status === 404) return new ImportError('unavailable', IMPORT_MESSAGES.unavailable);
  if (code === 'UPSTREAM_ERROR' || status === 502 || status === 504) return new ImportError('busy', IMPORT_MESSAGES.busy);
  return new ImportError('unexpected', IMPORT_MESSAGES.unexpected);
}
