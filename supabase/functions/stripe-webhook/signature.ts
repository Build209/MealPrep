// Stripe webhook signature check (no Stripe SDK: the function bundler only allows supabase-js).
//
// Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 using the endpoint's signing secret
// and sends `Stripe-Signature: t=<timestamp>,v1=<hex>[,v1=<hex>...]`.

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureCheck =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'missing_header' | 'malformed_header' | 'stale' | 'mismatch' | 'no_secret' };

export function parseStripeSignatureHeader(
  header: string | null | undefined,
): { timestamp: number; signatures: string[] } | null {
  if (!header) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) timestamp = parsed;
    } else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Length-independent-time comparison for two hex strings of equal expected length. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function computeStripeSignature(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  return toHex(signed);
}

export async function verifyStripeSignature(options: {
  secret: string;
  header: string | null | undefined;
  rawBody: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<SignatureCheck> {
  const secret = options.secret.trim();
  if (!secret) return { ok: false, reason: 'no_secret' };
  if (!options.header) return { ok: false, reason: 'missing_header' };

  const parsed = parseStripeSignatureHeader(options.header);
  if (!parsed) return { ok: false, reason: 'malformed_header' };

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - parsed.timestamp) > tolerance) return { ok: false, reason: 'stale' };

  const expected = await computeStripeSignature(secret, parsed.timestamp, options.rawBody);
  let matched = false;
  for (const candidate of parsed.signatures) {
    // No early exit: check every candidate.
    if (constantTimeEqual(candidate, expected)) matched = true;
  }
  return matched ? { ok: true, timestamp: parsed.timestamp } : { ok: false, reason: 'mismatch' };
}
