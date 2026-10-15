/**
 * Talking to the live ask-forky function exactly as the old app does
 * (mobile/lib/forky/askForky.ts, askForkyRequest.ts): POST JSON to
 * <supabase url>/functions/v1/ask-forky with the signed-in person's access token.
 * The function is live and must not change. Pure functions only (tests/forky-request.test.ts);
 * api.ts does the fetch.
 *
 * Function contract (supabase/functions/ask-forky/index.ts):
 *   Request:  { question, history: [{role,text}], pantry: [{name,amount?,expiresOn?}],
 *               recipes: [{id,title,have?,total?,missing?}], household?: {size?, ...} }
 *   200 { answer, recipeIds, offTopic, safetyNote, remaining, limit, isPlus, tier }
 *   401 UNAUTHENTICATED · 403 FEATURE_OFF · 429 LIMIT_REACHED · 400/413 BAD_REQUEST
 *   502 UPSTREAM_ERROR · 503 NOT_CONFIGURED
 */
import { ASK_FORKY_COPY, ASK_FORKY_LIMITS } from './copy';

export type ForkyTurn = { role: 'user' | 'forky'; text: string };

export type ForkyPantryInput = { name: string; quantity: number; unit: string; expiresOn: string | null };

/** A recipe on the shortlist, already ranked best-first. `id` is the new app's route id (r_/l_). */
export type ForkyRecipeInput = { id: string; title: string; have: number; total: number; missing: string[] };

export type ForkyContext = {
  pantry: ForkyPantryInput[];
  recipes: ForkyRecipeInput[];
  /** From the profile. No diet, allergy or health details are ever sent. */
  householdSize?: number | null;
};

/** Client wait, above the function's own 25 s model timeout. */
export const ASK_FORKY_TIMEOUT_MS = 40_000;

export function askForkyUrl(supabaseUrl: string): string {
  const base = supabaseUrl.trim().replace(/\/+$/, '');
  return base ? `${base}/functions/v1/ask-forky` : '';
}

function amountText(quantity: number, unit: string): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return '';
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} ${unit}`.trim();
}

/**
 * The JSON body, field for field as the old app sends it (buildAskForkyBody): item names, amounts
 * and use-by dates (soonest first so they survive the cap), a short list of recipe titles, and the
 * household size when known. No user ids, photos or notes.
 */
export function buildAskForkyBody(question: string, history: ForkyTurn[], context: ForkyContext) {
  const pantry = [...context.pantry]
    .sort((a, b) => {
      if (a.expiresOn && b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn);
      if (a.expiresOn) return -1;
      if (b.expiresOn) return 1;
      return 0;
    })
    .slice(0, ASK_FORKY_LIMITS.pantryItems)
    .map((item) => {
      const amount = amountText(item.quantity, item.unit);
      return {
        name: item.name,
        ...(amount ? { amount } : {}),
        ...(item.expiresOn ? { expiresOn: item.expiresOn.slice(0, 10) } : {}),
      };
    });

  const recipes = context.recipes.slice(0, ASK_FORKY_LIMITS.recipes).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    have: recipe.have,
    total: recipe.total,
    missing: recipe.missing.slice(0, 6),
  }));

  const size = context.householdSize;
  const household =
    typeof size === 'number' && Number.isInteger(size) && size >= 1 && size <= 20 ? { size } : null;

  return {
    question: question.trim(),
    history: history.slice(-ASK_FORKY_LIMITS.historyTurns).map((turn) => ({ role: turn.role, text: turn.text })),
    pantry,
    recipes,
    ...(household ? { household } : {}),
  };
}

export function buildAskForkyRequest(
  body: ReturnType<typeof buildAskForkyBody>,
  accessToken: string,
): { method: 'POST'; headers: Record<string, string>; body: string } {
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// --------------------------------------------------------------------- answers

export type ForkyAnswer = {
  answer: string;
  recipeIds: string[];
  offTopic: boolean;
  safetyNote: boolean;
  /** Questions left this month after this one, and the month's limit; null when not sent. */
  remaining: number | null;
  limit: number | null;
  isPlus: boolean;
  tier: string | null;
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The function's 200 answer, or null when it is not one (no answer text). */
export function parseAskForkyAnswer(json: unknown): ForkyAnswer | null {
  if (!json || typeof json !== 'object') return null;
  const body = json as Record<string, unknown>;
  if (typeof body.answer !== 'string' || !body.answer.trim()) return null;
  return {
    answer: body.answer,
    recipeIds: Array.isArray(body.recipeIds) ? body.recipeIds.filter((id): id is string => typeof id === 'string') : [],
    offTopic: body.offTopic === true,
    safetyNote: body.safetyNote === true,
    remaining: num(body.remaining),
    limit: num(body.limit),
    isPlus: body.isPlus === true,
    tier: typeof body.tier === 'string' ? body.tier : null,
  };
}

/** The function's own safety words (ask-forky needsSafetyNote), checked again here. */
const SAFETY_WORDS =
  /\b(allerg\w*|gluten|celiac|coeliac|nut[- ]free|dairy[- ]free|lactose|calorie\w*|nutrition\w*|protein grams|sodium|safe to eat|still good|expired|spoil\w*|food poisoning|raw|undercooked|internal temp\w*|left out|pregnan\w*|diabet\w*)\b/i;

/**
 * Compliance rule 9: an answer about allergens, nutrition or food safety carries the check line.
 * The server already decides this; the app checks the question and answer again, so the line
 * still shows if the server's flag is ever missing.
 */
export function needsSafetyNote(question: string, answer: ForkyAnswer): boolean {
  return answer.safetyNote || SAFETY_WORDS.test(question) || SAFETY_WORDS.test(answer.answer);
}

// ---------------------------------------------------------------------- errors

export type ForkyErrorKind =
  | 'used-up' // this month's questions are gone
  | 'rate-limit' // too many at once (429 without LIMIT_REACHED)
  | 'unavailable' // switched off, not set up, or the service is down
  | 'signed-out'
  | 'too-long'
  | 'timeout'
  | 'network'
  | 'unexpected';

export class ForkyError extends Error {
  readonly kind: ForkyErrorKind;
  readonly isPlus: boolean;
  readonly limit: number | null;
  readonly tier: string | null;
  constructor(kind: ForkyErrorKind, message: string, extra: { isPlus?: boolean; limit?: number | null; tier?: string | null } = {}) {
    super(message);
    this.name = 'ForkyError';
    this.kind = kind;
    this.isPlus = extra.isPlus === true;
    this.limit = extra.limit ?? null;
    this.tier = extra.tier ?? null;
  }
}

/** Turns a non-2xx answer (or a 200 without an answer) into a ForkyError with our own words. */
export function forkyErrorFromResponse(status: number, bodyText: string): ForkyError {
  let json: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>;
  } catch {
    /* not JSON: decide on the status alone */
  }
  const code = typeof json.code === 'string' ? json.code : '';
  const isPlus = json.isPlus === true;
  const extra = { isPlus, limit: num(json.limit), tier: typeof json.tier === 'string' ? json.tier : null };

  if (code === 'LIMIT_REACHED') {
    return new ForkyError('used-up', isPlus ? ASK_FORKY_COPY.limitPlus : ASK_FORKY_COPY.limitFree, extra);
  }
  if (code === 'FEATURE_OFF') return new ForkyError('unavailable', ASK_FORKY_COPY.featureOff);
  if (code === 'NOT_CONFIGURED') return new ForkyError('unavailable', ASK_FORKY_COPY.notConfigured);
  if (status === 401 || code === 'UNAUTHENTICATED') return new ForkyError('signed-out', ASK_FORKY_COPY.signedOut);
  if (status === 429 || code === 'RATE_LIMIT') return new ForkyError('rate-limit', ASK_FORKY_COPY.rateLimit);
  if (status === 404 || status === 503) return new ForkyError('unavailable', ASK_FORKY_COPY.unavailable);
  return new ForkyError('unexpected', ASK_FORKY_COPY.genericError);
}
