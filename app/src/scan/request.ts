/**
 * Talking to the live pantry-vision function, exactly as the old app does
 * (mobile/lib/pantryVision/client.ts): POST JSON to <supabase url>/functions/v1/pantry-vision with
 * the signed-in person's access token. The function itself is live and must not change.
 * Pure functions only (tests/scan-request.test.ts); api.ts does the fetch.
 */
import type { ScanUsage } from './allowance';
import type { PreparedImage } from './prepareShared';

/** Where the photo is: the function's own three storage places. A receipt is read, not placed. */
export const SCAN_PLACES = ['pantry', 'fridge', 'spice_rack'] as const;
export type ScanPlace = (typeof SCAN_PLACES)[number];

export const PLACE_LABELS: Record<ScanPlace, string> = { pantry: 'Pantry', fridge: 'Fridge', spice_rack: 'Spice rack' };

export type ScanKind = 'shelf' | 'receipt';

/** Client wait, above the function's own ~110 s budget (old app: 125 s). */
export const SCAN_TIMEOUT_MS = 125_000;

export function pantryVisionUrl(supabaseUrl: string): string {
  const base = supabaseUrl.trim().replace(/\/+$/, '');
  return base ? `${base}/functions/v1/pantry-vision` : '';
}

export type ScanRequestInput = {
  prepared: Pick<PreparedImage, 'base64' | 'mimeType' | 'detailTiles'>;
  imageHash: string;
  kind: ScanKind;
  place: ScanPlace;
};

/** The JSON body, field for field as the old app sends it. */
export function buildScanBody(input: ScanRequestInput): Record<string, unknown> {
  return {
    action: input.kind === 'receipt' ? 'receipt' : undefined,
    imageBase64: input.prepared.base64,
    mimeType: input.prepared.mimeType,
    location: input.place,
    imageHash: input.imageHash,
    tiles:
      input.prepared.detailTiles.length > 0
        ? input.prepared.detailTiles.map((tile) => ({ imageBase64: tile.base64, mimeType: tile.mimeType, position: tile.position }))
        : undefined,
  };
}

export function buildScanRequest(input: ScanRequestInput, accessToken: string): { method: 'POST'; headers: Record<string, string>; body: string } {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(buildScanBody(input)),
  };
}

/** Same photo, same kind, same place: the same request (the function dedupes on this too). */
export function scanRequestKey(input: Pick<ScanRequestInput, 'imageHash' | 'kind' | 'place'>): string {
  return `${input.kind}|${input.place}|${input.imageHash}`;
}

// --------------------------------------------------------------------- answers

export const PANTRY_CATEGORIES = ['spices', 'meats', 'produce', 'dairy', 'dry_goods', 'cookware', 'frozen', 'condiments'] as const;
export type PantryCategory = (typeof PANTRY_CATEGORIES)[number];

export type DetectedItem = {
  name: string;
  quantity: number;
  unit: string;
  category: PantryCategory;
  storage: ScanPlace | null;
  confidence: number;
};

export type ScanResult = { items: DetectedItem[]; usage: ScanUsage | null };

const MAX_ITEMS = 120;

/** The function's answer, checked row by row (same rules as its own sanitizeItems). */
export function parseScanResponse(json: unknown): ScanResult {
  if (!json || typeof json !== 'object') throw new ScanError('unexpected', SCAN_MESSAGES.unexpected);
  const body = json as { items?: unknown; usage?: unknown };
  if (!Array.isArray(body.items)) throw new ScanError('unexpected', SCAN_MESSAGES.unexpected);
  const items: DetectedItem[] = [];
  for (const entry of body.items.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    const quantity = Number(row.quantity);
    const unit = typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : 'each';
    const category = (PANTRY_CATEGORIES as readonly string[]).includes(row.category as string)
      ? (row.category as PantryCategory)
      : 'dry_goods';
    const storageRaw = typeof row.storage === 'string' ? row.storage.trim().toLowerCase() : '';
    const storage = (SCAN_PLACES as readonly string[]).includes(storageRaw) ? (storageRaw as ScanPlace) : null;
    const confidence = Number(row.confidence);
    items.push({
      name: name.slice(0, 120),
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, 9999) : 1,
      unit: unit.slice(0, 32),
      category,
      storage,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    });
  }
  return { items, usage: parseUsage(body.usage) };
}

function parseUsage(raw: unknown): ScanUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    isPlus: typeof u.isPlus === 'boolean' ? u.isPlus : undefined,
    tier: typeof u.tier === 'string' ? u.tier : undefined,
    limit: num(u.limit),
    remaining: num(u.remaining),
  };
}

// ---------------------------------------------------------------------- errors

export type ScanErrorKind =
  | 'used-up' // this month's allowance is gone (or the plan has none)
  | 'rate-limit' // too many in a minute
  | 'busy' // the same photo is still being scanned, or the model was busy
  | 'unavailable' // scanning is down or not set up: not this photo, not this account
  | 'signed-out'
  | 'bad-image'
  | 'timeout'
  | 'network'
  | 'unexpected';

export const SCAN_MESSAGES = {
  usedUp: "You've used this month's scans. They start again on the 1st.",
  rateLimit: 'Too many scans in a minute. Wait a moment and try again.',
  stillScanning: 'This photo is still being scanned. Try again in a moment.',
  busy: 'Scanning is busy right now. Try again in a moment.',
  unavailable: 'Photo scanning is unavailable right now. Your photo is fine. Please try again later.',
  signedOut: 'Sign in again to scan.',
  badImage: "That photo couldn't be read. Try another one.",
  timeout: 'The scan took too long. Check your connection and try again.',
  network: "Couldn't reach the scanner. Check your connection and try again.",
  unexpected: 'Something went wrong reading that photo. Please try again.',
  notConfigured: "This build has no server settings, so scanning can't run.",
} as const;

export class ScanError extends Error {
  readonly kind: ScanErrorKind;
  readonly usage: ScanUsage | null;
  constructor(kind: ScanErrorKind, message: string, usage: ScanUsage | null = null) {
    super(message);
    this.name = 'ScanError';
    this.kind = kind;
    this.usage = usage;
  }
}

/** The function's server-written sentence, used only where it is already plain words for people. */
function serverSentence(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text.length > 0 && text.length <= 240 ? text : null;
}

/** Turns a non-2xx answer from pantry-vision into a ScanError with a plain message. */
export function scanErrorFromResponse(status: number, bodyText: string): ScanError {
  let json: { error?: unknown; code?: unknown; usage?: unknown } = {};
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (parsed && typeof parsed === 'object') json = parsed as typeof json;
  } catch {
    /* not JSON: decide on the status alone */
  }
  const code = typeof json.code === 'string' ? json.code : '';
  const usage = parseUsage(json.usage);

  if (code === 'SCAN_LIMIT_REACHED' || (code === 'PLAN_REQUIRED' && usage)) {
    return new ScanError('used-up', serverSentence(json.error) ?? SCAN_MESSAGES.usedUp, usage);
  }
  if (code === 'PLAN_REQUIRED') {
    // Also sent when the plan could not be checked ("Could not check your plan. Please try again.").
    return new ScanError('used-up', serverSentence(json.error) ?? SCAN_MESSAGES.usedUp);
  }
  if (code === 'SCAN_UNAVAILABLE' || code === 'NOT_CONFIGURED') return new ScanError('unavailable', SCAN_MESSAGES.unavailable);
  if (code === 'UPSTREAM_BUSY') return new ScanError('busy', SCAN_MESSAGES.stillScanning);
  if (status === 401 || code === 'UNAUTHENTICATED') return new ScanError('signed-out', SCAN_MESSAGES.signedOut);
  if (status === 429 || code === 'RATE_LIMIT') return new ScanError('rate-limit', SCAN_MESSAGES.rateLimit);
  if (status === 400 || status === 413 || code === 'BAD_REQUEST' || code === 'PAYLOAD_TOO_LARGE') {
    return new ScanError('bad-image', SCAN_MESSAGES.badImage);
  }
  if (status === 404) return new ScanError('unavailable', SCAN_MESSAGES.unavailable);
  if (status === 502 || status === 504 || code === 'UPSTREAM_ERROR') return new ScanError('busy', SCAN_MESSAGES.busy);
  if (status === 503) return new ScanError('unavailable', SCAN_MESSAGES.unavailable);
  return new ScanError('unexpected', SCAN_MESSAGES.unexpected);
}
